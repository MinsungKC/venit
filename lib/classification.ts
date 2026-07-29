/**
 * Applies the canonical classification (from scripts/classify.ts) to normalized listings:
 * swaps each listing's heterogeneous source tags for its assigned canonical taxonomy tags.
 *
 * Falls back gracefully — if classification hasn't been run yet, listings keep their source
 * tags so the app still works (just with the raw, inconsistent vocabulary).
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { NormalizedListing, TagRecord } from "./mapping";

export interface TaxonomyTag {
  slug: string;
  label: string;
  domain: string;
  description: string;
}

const TAXONOMY_PATH = join(process.cwd(), "supabase", "seed", "taxonomy.json");
const CLASSIFICATION_PATH = join(process.cwd(), "public", "data", "classification.json");

export function loadTaxonomy(): TaxonomyTag[] {
  return JSON.parse(readFileSync(TAXONOMY_PATH, "utf8")) as TaxonomyTag[];
}

function loadClassificationMap(): Record<string, string[]> | null {
  if (!existsSync(CLASSIFICATION_PATH)) return null;
  return JSON.parse(readFileSync(CLASSIFICATION_PATH, "utf8")) as Record<string, string[]>;
}

/**
 * Replace each listing's tag_labels with its canonical taxonomy labels when a classification
 * exists; otherwise leave the source tags untouched.
 */
export function applyClassification(items: NormalizedListing[]): NormalizedListing[] {
  const map = loadClassificationMap();
  if (!map) return items;
  const labelBySlug = new Map(loadTaxonomy().map((t) => [t.slug, t.label]));

  return items.map((item) => {
    const slugs = map[`${item.source}:${item.external_id}`];
    if (!slugs || slugs.length === 0) return item;
    const tag_labels = slugs.map((s) => labelBySlug.get(s)).filter((l): l is string => Boolean(l));
    return tag_labels.length ? { ...item, tag_labels } : item;
  });
}

/** Override derived tag domains with authoritative taxonomy domains where known. */
export function applyTaxonomyDomains(tags: TagRecord[]): TagRecord[] {
  const domainBySlug = new Map(loadTaxonomy().map((t) => [t.slug, t.domain]));
  return tags.map((t) => (domainBySlug.has(t.slug) ? { ...t, domain: domainBySlug.get(t.slug)! } : t));
}
