import Link from "next/link";
import { getTagCatalog, kindCounts, runMatch, type MatchedListing } from "@/lib/match-data";
import type { ListingKind } from "@/lib/mapping";
import type { SortAxis } from "@/lib/match-types";
import InterestPicker from "./InterestPicker";
import StarButton from "./StarButton";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<ListingKind, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
};

const KIND_PLURAL: Record<ListingKind, string> = {
  company: "Companies",
  research_lab: "Research Labs",
  program: "Programs",
  opportunity: "Opportunities",
  camp: "Camps",
};

const KIND_ORDER: ListingKind[] = ["company", "program", "opportunity", "camp", "research_lab"];

const COST_LABEL: Record<string, string> = {
  free: "Free",
  stipend: "Stipend",
  paid: "Paid",
  unknown: "Cost unknown",
};

const SORTS: SortAxis[] = ["fit", "distance", "cost"];

/** All the state the results view carries in the URL, so every control stays shareable. */
interface Query {
  tagSlugs: string[];
  grade: number | null;
  age: number | null;
  sort?: SortAxis;
  kind?: ListingKind;
  freeOnly: boolean;
  remoteOnly: boolean;
}

/** Build a /match URL from the current query with a set of overrides applied. */
function href(q: Query, over: Partial<Query>): string {
  const m = { ...q, ...over };
  const p = new URLSearchParams();
  if (m.tagSlugs.length) p.set("tags", m.tagSlugs.join(","));
  if (m.grade) p.set("grade", String(m.grade));
  if (m.age) p.set("age", String(m.age));
  if (m.sort) p.set("sort", m.sort);
  if (m.kind) p.set("kind", m.kind);
  if (m.freeOnly) p.set("free", "1");
  if (m.remoteOnly) p.set("remote", "1");
  return `/match?${p.toString()}`;
}

function faviconFor(url: string | null): string | null {
  if (!url) return null;
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).host}.ico`;
  } catch {
    return null;
  }
}

function parseNum(v: string | undefined, lo: number, hi: number): number | null {
  const n = Number(v);
  return v && Number.isFinite(n) && n >= lo && n <= hi ? n : null;
}

export default function MatchPage({
  searchParams,
}: {
  searchParams: {
    tags?: string;
    grade?: string;
    age?: string;
    sort?: string;
    kind?: string;
    free?: string;
    remote?: string;
  };
}) {
  const catalog = getTagCatalog();
  const q: Query = {
    tagSlugs: (searchParams.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    grade: parseNum(searchParams.grade, 1, 13),
    age: parseNum(searchParams.age, 5, 100),
    sort: (SORTS as string[]).includes(searchParams.sort ?? "")
      ? (searchParams.sort as SortAxis)
      : undefined,
    kind: KIND_ORDER.includes(searchParams.kind as ListingKind)
      ? (searchParams.kind as ListingKind)
      : undefined,
    freeOnly: searchParams.free === "1",
    remoteOnly: searchParams.remote === "1",
  };

  const hasQuery = q.tagSlugs.length > 0;
  const all = hasQuery
    ? runMatch({
        tagSlugs: q.tagSlugs,
        grade: q.grade,
        age: q.age,
        sort: q.sort,
        freeOnly: q.freeOnly,
        remoteOnly: q.remoteOnly,
      })
    : [];
  const counts = kindCounts(all);
  const results = q.kind ? all.filter((l) => l.kind === q.kind) : all;

  return (
    <main className="container">
      <header className="page-head">
        <div>
          <Link href="/" className="back">
            ← OppMatch
          </Link>
          <h1>Find your matches</h1>
        </div>
        <p className="count">
          Pick what you&apos;re into — we show opportunities that share your interests.
        </p>
      </header>

      <InterestPicker
        catalog={catalog}
        initialSelected={q.tagSlugs}
        initialGrade={q.grade}
        initialAge={q.age}
      />

      {hasQuery && (
        <section className="results">
          <div className="results-head">
            <h2>{results.length.toLocaleString()} matches</h2>
            <nav className="sortbar" aria-label="Sort results">
              <Link className={`tab ${!q.sort ? "active" : ""}`} href={href(q, { sort: undefined })}>
                Best fit
              </Link>
              <Link className={`tab ${q.sort === "cost" ? "active" : ""}`} href={href(q, { sort: "cost" })}>
                Cost
              </Link>
            </nav>
          </div>

          <nav className="filterbar" aria-label="Filter results">
            <Link className={`tab ${!q.kind ? "active" : ""}`} href={href(q, { kind: undefined })}>
              All <span className="tab-n">{all.length.toLocaleString()}</span>
            </Link>
            {KIND_ORDER.filter((k) => counts[k]).map((k) => (
              <Link key={k} className={`tab ${q.kind === k ? "active" : ""}`} href={href(q, { kind: k })}>
                {KIND_PLURAL[k]} <span className="tab-n">{counts[k].toLocaleString()}</span>
              </Link>
            ))}
            <span className="filter-sep" />
            <Link
              className={`tab toggle ${q.freeOnly ? "active" : ""}`}
              href={href(q, { freeOnly: !q.freeOnly })}
            >
              Free only
            </Link>
            <Link
              className={`tab toggle ${q.remoteOnly ? "active" : ""}`}
              href={href(q, { remoteOnly: !q.remoteOnly })}
            >
              Remote
            </Link>
          </nav>

          {results.length === 0 ? (
            <p className="empty">
              No matches with these filters. Try adding interests, widening grade/age, or clearing
              a filter.{" "}Research labs need a location match, so they&apos;re not shown here yet.
            </p>
          ) : (
            <div className="grid">
              {results.map((l) => (
                <ResultCard key={l.slug} l={l} />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}

function ResultCard({ l }: { l: MatchedListing }) {
  const fav = faviconFor(l.url);
  return (
    <article className="card">
      <div className="card-top">
        <div className="title-wrap">
          {fav && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="favicon" src={fav} alt="" width={20} height={20} loading="lazy" />
          )}
          <h3 className="card-title">
            <Link href={`/listing/${l.slug}`}>{l.title}</Link>
          </h3>
        </div>
        <StarButton
          snapshot={{
            slug: l.slug,
            title: l.title,
            kind: l.kind,
            url: l.url,
            cost_type: l.cost_type,
            location_name: l.location_name,
            is_remote: l.is_remote,
          }}
        />
      </div>

      <p className="kindline">
        <span className={`kind kind-${l.kind}`}>{KIND_LABEL[l.kind]}</span>
        <span className="cost"> · {COST_LABEL[l.cost_type] ?? l.cost_type}</span>
      </p>

      {l.short_description && <p className="desc">{l.short_description}</p>}

      <p className="meta">{l.is_remote ? "Remote" : l.location_name ?? "—"}</p>

      {l.matchedTags.length > 0 && (
        <div className="why">
          <span className="why-label">Matched on</span>
          <ul className="tags" aria-label="Matched interest tags">
            {l.matchedTags.slice(0, 8).map((t) => (
              <li className="tag on" key={t}>
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </article>
  );
}
