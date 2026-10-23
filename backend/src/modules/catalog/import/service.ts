import { randomUUID } from "crypto";
import { logger } from "../../../logging/logger";
import type { CatalogDevice } from "../catalog.types";
import { manifestSchema, providerFor } from "./providers";

export interface CatalogImportStore { upsertCatalogRecord(record: CatalogDevice): Promise<"inserted" | "updated" | "unchanged">; }
export class CatalogImportService {
  constructor(private store?: CatalogImportStore) {}
  async run(records: unknown[], input: unknown, dryRun = true) {
    const manifest = manifestSchema.parse(input);
    if (!dryRun && !this.store) throw new Error("STORE_REQUIRED");
    if (records.length > 20000) throw new Error("TOO_MANY_RECORDS");
    const provider = providerFor(manifest.provider);
    const report = { importBatchId: randomUUID(), provider: manifest.provider, sourceVersion: manifest.sourceVersion,
      startedAt: new Date().toISOString(), finishedAt: "", dryRun, received: records.length, normalized: 0,
      valid: 0, invalid: 0, inserted: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0,
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
          report.skipped++; continue;
        }
        seen.set(row.id, fingerprint); report.valid++;
      } catch (error) {
        report.invalid++;
        // Never log raw rows, arbitrary input strings, paths, URLs or product-owner data.
        const code = error instanceof Error ? error.message : "";
        const reason = /^[A-Z_]{1,80}$/.test(code) ? code : "SCHEMA_INVALID";
        if (report.rejections.length < 100) report.rejections.push({ row: index + 1, reason });
        continue;
      }
      pending.push(row);
    }
    // Validate/deduplicate the entire batch before any writes. A bad row blocks the batch.
    for (const row of pending) {
      if (dryRun || report.invalid) { report.skipped++; continue; }
      try { report[await this.store!.upsertCatalogRecord(row)]++; }
      catch { report.failed++; }
    }
    report.finishedAt = new Date().toISOString();
    logger.info(report.failed || report.invalid ? "catalog.import.failed" : "catalog.import.completed", report);
    return report;
  }
}
