import { lookup } from "dns/promises";
import { request } from "https";
import { createHash } from "crypto";

// Only documented, publicly exported datasets. Never accept a URL from a caller.
export const registeredSources = {
  "energy-star-refrigerators": {
    url: "https://data.energystar.gov/api/v3/views/p5st-her9/export.csv",
    provider: "ENERGY_STAR" as const, adapter: "energystar-refrigerator-csv-v1" as const,
  },
  "energy-star-televisions": {
    url: "https://data.energystar.gov/api/v3/views/pd96-rr3d/export.csv",
    provider: "ENERGY_STAR" as const, adapter: "energystar-television-csv-v1" as const,
  },
  "energy-star-room-air-conditioners": {
    url: "https://data.energystar.gov/api/v3/views/5xn2-dv4h/export.csv",
    provider: "ENERGY_STAR" as const, adapter: "energystar-room-ac-csv-v1" as const,
  },
  "energy-star-freezers": {
    url: "https://data.energystar.gov/api/v3/views/8t9c-g3tn/export.csv",
    provider: "ENERGY_STAR" as const, adapter: "energystar-freezer-csv-v1" as const,
  },
  "energy-star-displays": {
    url: "https://data.energystar.gov/api/v3/views/qbg3-d468/export.csv",
    provider: "ENERGY_STAR" as const, adapter: "energystar-display-csv-v1" as const,
  },
};
export const publicIPv4 = (address: string) => {
  if (!/^(?:\d{1,3}\.){3}\d{1,3}$/.test(address)) return false;
  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a,b,c] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || (a === 198 && (b === 18 || b === 19)) ||
    (a === 192 && b === 0) || (a === 198 && b === 51 && c === 100) || (a === 203 && b === 0 && c === 113));
};
export function validateRemoteResponse(status: number | undefined, type: string, encoding: string | undefined, length?: string) {
  if (status !== 200 || !["text/csv", "application/csv", "text/plain"].includes(type.split(";")[0].trim().toLowerCase()) ||
    (encoding && encoding !== "identity") || (length && (!/^\d+$/.test(length) || Number(length) > 10 * 1024 * 1024))) {
    throw new Error("SOURCE_RESPONSE_REFUSED");
  }
}
export async function downloadRegisteredSource(key: string) {
  if (!Object.prototype.hasOwnProperty.call(registeredSources, key)) throw new Error("SOURCE_NOT_REGISTERED");
  const source = registeredSources[key as keyof typeof registeredSources];
  const url = new URL(source.url);
  let dnsTimer: ReturnType<typeof setTimeout> | undefined;
  const addresses = await Promise.race([lookup(url.hostname, { all: true, family: 4 }),
    new Promise<never>((_resolve, reject) => { dnsTimer = setTimeout(() => reject(new Error("SOURCE_DNS_TIMEOUT")), 5000); })])
    .finally(() => { if (dnsTimer) clearTimeout(dnsTimer); });
  if (!addresses.length || addresses.some(row => !publicIPv4(row.address))) throw new Error("SOURCE_ADDRESS_REFUSED");
  const body = await new Promise<Buffer>((resolve, reject) => {
    const req = request(url, { method: "GET", family: 4,
      lookup: (_hostname, _options, callback) => callback(null, addresses[0].address, 4),
      headers: { Accept: "text/csv", "Accept-Encoding": "identity", "User-Agent": "WattStatus-CatalogSync/1.0" } }, res => {
      try { validateRemoteResponse(res.statusCode, String(res.headers["content-type"] || ""), res.headers["content-encoding"], res.headers["content-length"]); }
      catch { res.destroy(); reject(new Error("SOURCE_RESPONSE_REFUSED")); return; }
      const chunks: Buffer[] = []; let size = 0;
      res.on("data", (chunk: Buffer) => { size += chunk.length; if (size > 10 * 1024 * 1024) req.destroy(new Error("SOURCE_TOO_LARGE")); else chunks.push(chunk); });
      res.on("end", () => resolve(Buffer.concat(chunks)));
      res.on("error", reject);
    });
    const timer = setTimeout(() => req.destroy(new Error("SOURCE_TIMEOUT")), 30000);
    req.on("close", () => clearTimeout(timer)); req.on("error", reject); req.end();
  });
  return { body, sha256: createHash("sha256").update(body).digest("hex"), source };
}
