import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { YcCompany } from "./mapping";

/** Path to the vendored, dated snapshot of the yc-oss dataset. */
export const SOURCE_PATH = join(
  process.cwd(),
  "supabase",
  "seed",
  "source",
  "yc-companies.json",
);

/** Load the vendored company snapshot from disk (Node contexts only). */
export function loadCompanies(): YcCompany[] {
  const raw = readFileSync(SOURCE_PATH, "utf8");
  const data = JSON.parse(raw);
  if (!Array.isArray(data)) throw new Error("yc-companies.json is not an array");
  return data as YcCompany[];
}
