import { randomUUID } from "crypto";
import { logger } from "../../../logging/logger";
import type { CatalogDevice } from "../catalog.types";
import { manifestSchema, providerFor } from "./providers";
import { canonicalCatalogId, catalogFingerprint, resolveCatalog } from "../resolver";

export interface CatalogImportStore {
  upsertCatalogRecord(record: CatalogDevice): Promise<"inserted" | "updated" | "unchanged">;
  getCatalogDevice?(id: string): Promise<CatalogDevice | null>;
}
export class CatalogImportService {
  constructor(private store?: CatalogImportStore) {}
  async run(records: unknown[], input: unknown, dryRun = true, onStaged?: (rows: CatalogDevice[]) => void) {
    const manifest = manifestSchema.parse(input);
    if (!dryRun && !this.store) throw new Error("STORE_REQUIRED");
    if (records.length > 20000) throw new Error("TOO_MANY_RECORDS");
    const provider = providerFor(manifest.provider);
    const report = { importBatchId: randomUUID(), provider: manifest.provider, sourceVersion: manifest.sourceVersion,
      startedAt: new Date().toISOString(), finishedAt: "", dryRun, received: records.length, normalized: 0,
      valid: 0, invalid: 0, inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0, duplicates: 0,
      staged: 0, wouldWrite: 0, outsideRegion: 0,
      wouldInsert: this.store?.getCatalogDevice ? 0 as number | null : null,
      wouldUpdate: this.store?.getCatalogDevice ? 0 as number | null : null,
      wouldRemainUnchanged: this.store?.getCatalogDevice ? 0 as number | null : null,
      rejections: [] as Array<{ row: number; reason: string }> };
    logger.info("catalog.import.started", { importBatchId: report.importBatchId, provider: manifest.provider });
    const seen = new Map<string, string>();
    const pending: CatalogDevice[] = [];
    for (const [index, raw] of records.entries()) {
      let row: CatalogDevice;
      try {
        row = provider.normalize(raw, manifest); report.normalized++;
        const fingerprint = JSON.stringify(row);
        if (seen.has(row.id)) {
          if (seen.get(row.id) !== fingerprint) throw new Error("CONFLICTING_DUPLICATE");
          report.skipped++; report.duplicates++; continue;
        }
        seen.set(row.id, fingerprint); report.valid++;
      } catch (error) {
        // Never log raw rows, arbitrary input strings, paths, URLs or product-owner data.
        const code = error instanceof Error ? error.message : "";
        if (code === "US_MARKET_REQUIRED") { report.skipped++; report.outsideRegion++; continue; }
        report.invalid++;
        const reason = /^[A-Z_]{1,80}$/.test(code) ? code : "SCHEMA_INVALID";
        if (report.rejections.length < 100) report.rejections.push({ row: index + 1, reason });
        continue;
      }
      pending.push(row);
    }
    // Validate/deduplicate the entire batch before any writes. A bad row blocks the batch.
    let staged: CatalogDevice[] = [];
    try { staged = resolveCatalog(pending); report.staged = staged.length; report.duplicates += pending.length - staged.length; }
    catch { report.invalid++; report.rejections.push({ row: 0, reason: "CATALOG_RESOLUTION_CONFLICT" }); }
    // Persist only this batch's evidence. A planned preview containing old stored sources
    // must never overwrite another provider's update between planning and persistence.
    const incoming = [...staged];
    // Resolve stored evidence before writing any record, including conflicts across providers/batches.
    if (!report.invalid && this.store?.getCatalogDevice) {
      try {
        for (const [index, row] of staged.entries()) {
          const previous = await this.store.getCatalogDevice(canonicalCatalogId(row));
          const merged = previous && row.equivalence ? resolveCatalog([previous, row])[0] : row;
          staged[index] = merged;
          if (!previous) report.wouldInsert!++;
          else if (catalogFingerprint(previous) === catalogFingerprint(merged)) report.wouldRemainUnchanged!++;
          else report.wouldUpdate!++;
        }
      } catch { report.invalid++; report.rejections.push({ row: 0, reason: "STORED_EVIDENCE_CONFLICT" }); }
    }
    report.wouldWrite = report.invalid ? 0 : staged.length;
    if (report.invalid) logger.warn("catalog.record.invalid", { importBatchId: report.importBatchId, invalidCount: report.invalid });
    if (!report.invalid) onStaged?.(staged);
    for (const row of incoming) {
      if (dryRun || report.invalid) { report.skipped++; continue; }
      try {
        report[await this.store!.upsertCatalogRecord(row)]++;
      }
      catch { report.failed++; }
    }
    report.finishedAt = new Date().toISOString();
    logger.info(report.failed || report.invalid ? "catalog.import.failed" : "catalog.import.completed", report);
    return report;
  }
}
