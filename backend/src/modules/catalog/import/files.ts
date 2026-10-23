import { lstatSync, readFileSync } from "fs";
import { extname } from "path";

export function readDataset(file: string): unknown[] {
  const stat = lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 10 * 1024 * 1024) throw new Error("FILE_LIMIT");
  const buffer = readFileSync(file);
  if (buffer.length > 10 * 1024 * 1024) throw new Error("FILE_LIMIT");
  const content = buffer.toString("utf8").replace(/^\uFEFF/, "");
  if (extname(file).toLowerCase() === ".json") {
    const data = JSON.parse(content);
    if (!Array.isArray(data)) throw new Error("ARRAY_REQUIRED");
    return data;
  }
  if (extname(file).toLowerCase() !== ".csv") throw new Error("JSON_OR_CSV_REQUIRED");
  return parseCsv(content);
}
export function parseCsv(content: string): unknown[] {
  if (Buffer.byteLength(content, "utf8") > 10 * 1024 * 1024) throw new Error("FILE_LIMIT");
  // RFC4180 comma-separated UTF-8, including quoted commas/newlines and escaped quotes.
  const rows: string[][] = []; let row: string[] = [], field = "", quoted = false, closed = false;
  for (let i = 0; i <= content.length; i++) {
    const char = content[i] ?? "\n";
    if (quoted) {
      if (char === '"' && content[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === "\r" && content[i + 1] === "\n") continue;
    else if (char === '"' && !field && !closed) quoted = true;
    else if (char === "," || char === "\n") {
      row.push(field.replace(/\r$/, "")); field = ""; closed = false;
      if (char === "\n") { if (row.some(Boolean)) rows.push(row); row = []; }
    } else { if (closed || char === '"') throw new Error("CSV_INVALID"); field += char; }
    if (field.length > 10000 || rows.length > 20001 || row.length > 100) throw new Error("CSV_LIMIT");
  }
  if (quoted) throw new Error("CSV_UNCLOSED_QUOTE");
  const headers = rows.shift();
  if (!headers || headers.length !== new Set(headers).size || headers.some(h => !h || ["__proto__", "constructor", "prototype"].includes(h))) throw new Error("CSV_HEADERS");
  return rows.map(values => {
    if (values.length !== headers.length) throw new Error("CSV_COLUMNS");
    return Object.fromEntries(headers.map((name, index) => [name, values[index]]));
  });
}
