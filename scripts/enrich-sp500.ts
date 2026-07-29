/**
 * One-time enrichment: fetch official website + short description for S&P 500 companies
 * from Wikidata (keyed by ticker on NYSE/NASDAQ), and vendor the result so builds stay
 * reproducible and offline.
 *
 *   npx tsx scripts/enrich-sp500.ts
 *   -> supabase/seed/source/sp500-enrichment.json  { [ticker]: { website, description } }
 *
 * The S&P constituents CSV has no URLs or descriptions; this fills that gap. Logos are NOT
 * fetched here — the UI derives a favicon from each listing's website host instead.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseCsvObjects } from "../lib/csv";

const OUT = join(process.cwd(), "supabase", "seed", "source", "sp500-enrichment.json");
const CSV = join(process.cwd(), "supabase", "seed", "source", "sp500.csv");
const ENDPOINT = "https://query.wikidata.org/sparql";
const UA = "OppMatch/0.1 (research prototype; contact youngimyoo@yahoo.com)";

interface Enrichment {
  website?: string;
  description?: string;
}

function query(tickers: string[]): string {
  const values = tickers.map((t) => `"${t}"`).join(" ");
  return `SELECT ?ticker ?website ?desc WHERE {
    VALUES ?ticker { ${values} }
    VALUES ?exch { wd:Q13677 wd:Q82059 }
    ?c p:P414 ?st . ?st ps:P414 ?exch ; pq:P249 ?ticker .
    OPTIONAL { ?c wdt:P856 ?website }
    OPTIONAL { ?c schema:description ?desc FILTER(LANG(?desc) = "en") }
  }`;
}

/** Prefer the shortest (most root-level) website URL. */
function pickWebsite(current: string | undefined, candidate: string): string {
  if (!current) return candidate;
  return candidate.length < current.length ? candidate : current;
}

async function runBatch(tickers: string[], out: Map<string, Enrichment>) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query(tickers))}`;
  const res = await fetch(url, {
    headers: { Accept: "application/sparql-results+json", "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Wikidata ${res.status} for batch of ${tickers.length}`);
  const json = (await res.json()) as {
    results: { bindings: Record<string, { value: string }>[] };
  };
  for (const b of json.results.bindings) {
    const ticker = b.ticker?.value;
    if (!ticker) continue;
    const e = out.get(ticker) ?? {};
    if (b.website?.value) e.website = pickWebsite(e.website, b.website.value);
    if (b.desc?.value && !e.description) e.description = b.desc.value;
    out.set(ticker, e);
  }
}

async function main() {
  const rows = parseCsvObjects(readFileSync(CSV, "utf8"));
  const tickers = rows.map((r) => r["Symbol"]).filter(Boolean);
  const out = new Map<string, Enrichment>();

  const size = 60;
  for (let i = 0; i < tickers.length; i += size) {
    const batch = tickers.slice(i, i + size);
    try {
      await runBatch(batch, out);
      process.stdout.write(`  batch ${i / size + 1}: ${out.size} enriched so far\n`);
    } catch (err) {
      console.warn(`  batch ${i / size + 1} failed: ${(err as Error).message}`);
    }
    await new Promise((r) => setTimeout(r, 800)); // be polite to the endpoint
  }

  const obj = Object.fromEntries([...out.entries()].sort());
  writeFileSync(OUT, JSON.stringify(obj, null, 0));
  const withWeb = [...out.values()].filter((e) => e.website).length;
  console.log(
    `enrich-sp500 — ${out.size}/${tickers.length} tickers matched, ${withWeb} with website.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
