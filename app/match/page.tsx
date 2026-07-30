import Link from "next/link";
import { getTagCatalog, kindCounts, runMatch, type LocMode, type MatchedListing } from "@/lib/match-data";
import { getDesiredVectors, getUserPersonalityVector } from "@/lib/personality-data";
import { getUser } from "@/lib/supabase/server";
import type { ListingKind } from "@/lib/mapping";
import type { SortAxis } from "@/lib/match-types";
import StarButton from "./StarButton";
import SearchBar from "@/app/SearchBar";
import styles from "./match.module.css";

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
const KIND_ICON: Record<ListingKind, string> = {
  company: "business",
  research_lab: "science",
  program: "school",
  opportunity: "work",
  camp: "cabin",
};
const KIND_ORDER: ListingKind[] = ["company", "program", "opportunity", "camp", "research_lab"];
const COST_LABEL: Record<string, string> = {
  free: "Free",
  stipend: "Stipend",
  paid: "Paid",
  unknown: "Cost N/A",
};
const SORTS: SortAxis[] = ["fit", "distance", "cost"];
const DISPLAY_LIMIT = 60;
// Hard ceiling on how many cards a single response ever renders — "Explore more" used to dump
// the ENTIRE result set (which could be thousands for a broad interest), a real freeze risk in
// the browser. This caps it; results beyond it are reachable by narrowing filters instead.
const MAX_RENDERED = 240;
const MILES_PER_KM = 0.621371;

interface Query {
  tagSlugs: string[];
  grade: number | null;
  age: number | null;
  locMode: LocMode;
  region: string | null;
  radiusMi: number;
  userLat: number | null;
  userLng: number | null;
  place: string | null;
  showAll: boolean;
  /** Include "broader" matches (share <2 tags) alongside the default primary tier. */
  showBroader: boolean;
  sort?: SortAxis;
  kind?: ListingKind;
  freeOnly: boolean;
  remoteOnly: boolean;
  boost: string[];
  niche: string[];
  /** Kinds the student said they're looking for at onboarding — boosts, never filters (§0.4). */
  preferredKinds: ListingKind[];
}

function href(q: Query, over: Partial<Query>): string {
  const m = { ...q, ...over };
  const p = new URLSearchParams();
  if (m.tagSlugs.length) p.set("tags", m.tagSlugs.join(","));
  if (m.grade) p.set("grade", String(m.grade));
  if (m.age) p.set("age", String(m.age));
  if (m.locMode !== "any") p.set("loc", m.locMode);
  if (m.region) p.set("region", m.region);
  if (m.userLat != null && m.userLng != null) {
    p.set("ulat", m.userLat.toFixed(4));
    p.set("ulng", m.userLng.toFixed(4));
  }
  if (m.place) p.set("place", m.place);
  if (m.radiusMi !== 100) p.set("radius", String(m.radiusMi));
  if (m.showAll) p.set("all", "1");
  if (m.showBroader) p.set("broad", "1");
  if (m.sort) p.set("sort", m.sort);
  if (m.kind) p.set("kind", m.kind);
  if (m.freeOnly) p.set("free", "1");
  if (m.remoteOnly) p.set("remote", "1");
  if (m.boost?.length) p.set("boost", m.boost.join(","));
  if (m.niche?.length) p.set("niche", m.niche.join(","));
  if (m.preferredKinds?.length) p.set("kinds", m.preferredKinds.join(","));
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

export default async function MatchPage({
  searchParams,
}: {
  searchParams: {
    tags?: string;
    grade?: string;
    age?: string;
    loc?: string;
    region?: string;
    radius?: string;
    ulat?: string;
    ulng?: string;
    place?: string;
    all?: string;
    broad?: string;
    sort?: string;
    kind?: string;
    free?: string;
    remote?: string;
    boost?: string;
    niche?: string;
    kinds?: string;
  };
}) {
  const catalog = getTagCatalog();
  const labelBySlug = new Map<string, string>();
  for (const g of catalog) for (const t of g.tags) labelBySlug.set(t.slug, t.label);

  const q: Query = {
    tagSlugs: (searchParams.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    grade: parseNum(searchParams.grade, 1, 13),
    age: parseNum(searchParams.age, 5, 100),
    locMode: (["near", "country", "any"] as string[]).includes(searchParams.loc ?? "")
      ? (searchParams.loc as LocMode)
      : "any",
    region: searchParams.region?.trim() || null,
    radiusMi: parseNum(searchParams.radius, 5, 3000) ?? 100,
    userLat: parseNum(searchParams.ulat, -90, 90),
    userLng: parseNum(searchParams.ulng, -180, 180),
    place: searchParams.place?.trim() || null,
    showAll: searchParams.all === "1",
    showBroader: searchParams.broad === "1",
    sort: (SORTS as string[]).includes(searchParams.sort ?? "") ? (searchParams.sort as SortAxis) : undefined,
    kind: KIND_ORDER.includes(searchParams.kind as ListingKind) ? (searchParams.kind as ListingKind) : undefined,
    freeOnly: searchParams.free === "1",
    remoteOnly: searchParams.remote === "1",
    boost: (searchParams.boost ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    niche: (searchParams.niche ?? "").split(",").map((s) => s.trim()).filter(Boolean),
    preferredKinds: (searchParams.kinds ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter((s): s is ListingKind => KIND_ORDER.includes(s as ListingKind)),
  };

  const hasQuery = q.tagSlugs.length > 0;

  // Onboarding-less entry: prompt to pick interests.
  if (!hasQuery) {
    return (
      <main className="container">
        <h1>Your feed is empty</h1>
        <p className="lede">Tell us what you&apos;re into and we&apos;ll curate opportunities for you.</p>
        <Link className="button" href="/onboarding">
          Pick your interests →
        </Link>
      </main>
    );
  }

  // Personality fit for signed-in students: SECRET vector read server-side, never sent to client.
  const user = await getUser();
  const personalityVector = user ? await getUserPersonalityVector(user.id) : null;
  const desiredBySlug = personalityVector ? await getDesiredVectors() : undefined;

  const all = runMatch({
    tagSlugs: q.tagSlugs,
    grade: q.grade,
    age: q.age,
    locMode: q.locMode,
    region: q.region,
    userLat: q.userLat,
    userLng: q.userLng,
    radiusKm: q.radiusMi / MILES_PER_KM,
    sort: q.sort,
    freeOnly: q.freeOnly,
    remoteOnly: q.remoteOnly,
    personalityVector,
    desiredBySlug,
    boostSlugs: q.boost,
    nicheSlugs: q.niche,
    preferredKinds: q.preferredKinds,
  });
  // Default to the "primary" tier (strong, specific matches) — "broader" ones still exist and
  // are fully reachable, just not counted in the headline (keeps a broad single-interest catalog
  // like the ~9.7k OpenAlex labs from swamping the feed; see MatchedListing.tier in match-data.ts).
  const primaryAll = all.filter((l) => l.tier === "primary");
  const broaderAll = all.filter((l) => l.tier === "broader");
  const pool = q.showBroader ? all : primaryAll;
  const counts = kindCounts(pool);
  const results = q.kind ? pool.filter((l) => l.kind === q.kind) : pool;
  const broaderCount = q.kind ? broaderAll.filter((l) => l.kind === q.kind).length : broaderAll.length;
  const shown = (q.showAll ? results.slice(0, MAX_RENDERED) : results.slice(0, DISPLAY_LIMIT));
  const topTags = q.tagSlugs.slice(0, 2).map((s) => labelBySlug.get(s) ?? s);

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <div className={styles.sideHead}>
          <h2 className={styles.sideTitle}>Filters</h2>
          <Link className={styles.reset} href={`/match?tags=${q.tagSlugs.join(",")}`}>
            Reset all
          </Link>
        </div>
        <p className={styles.sideSub}>Refine your feed</p>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Sort</span>
          <Link className={`${styles.item} ${!q.sort ? styles.active : ""}`} href={href(q, { sort: undefined })}>
            <span className="material-symbols-outlined">verified</span> Best fit
          </Link>
          <Link className={`${styles.item} ${q.sort === "cost" ? styles.active : ""}`} href={href(q, { sort: "cost" })}>
            <span className="material-symbols-outlined">payments</span> Lowest cost
          </Link>
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Type</span>
          <Link className={`${styles.item} ${!q.kind ? styles.active : ""}`} href={href(q, { kind: undefined })}>
            <span className="material-symbols-outlined">apps</span> All
            <span style={{ marginLeft: "auto", opacity: 0.7 }}>{pool.length.toLocaleString()}</span>
          </Link>
          {KIND_ORDER.filter((k) => counts[k]).map((k) => (
            <Link key={k} className={`${styles.item} ${q.kind === k ? styles.active : ""}`} href={href(q, { kind: k })}>
              <span className="material-symbols-outlined">{KIND_ICON[k]}</span> {KIND_PLURAL[k]}
              <span style={{ marginLeft: "auto", opacity: 0.7 }}>{counts[k].toLocaleString()}</span>
            </Link>
          ))}
        </div>

        <div className={styles.group}>
          <span className={styles.groupLabel}>Cost</span>
          <Link className={`${styles.item} ${q.freeOnly ? styles.active : ""}`} href={href(q, { freeOnly: !q.freeOnly })}>
            <span className="material-symbols-outlined">savings</span> Free only
          </Link>
          <Link className={`${styles.item} ${q.remoteOnly ? styles.active : ""}`} href={href(q, { remoteOnly: !q.remoteOnly })}>
            <span className="material-symbols-outlined">public</span> Remote only
          </Link>
        </div>

        {broaderCount > 0 && (
          <div className={styles.group}>
            <span className={styles.groupLabel}>Match strength</span>
            <Link
              className={`${styles.item} ${q.showBroader ? styles.active : ""}`}
              href={href(q, { showBroader: !q.showBroader })}
            >
              <span className="material-symbols-outlined">{q.showBroader ? "filter_alt" : "filter_alt_off"}</span>
              {q.showBroader ? "Hide broader matches" : `Show ${broaderCount.toLocaleString()} broader matches`}
            </Link>
          </div>
        )}

        <div className={styles.spacer}>
          <Link className={styles.item} href={href(q, {}).replace("/match", "/globe")}>
            <span className="material-symbols-outlined">public</span> Map view
          </Link>
          <Link className={styles.item} href="/onboarding">
            <span className="material-symbols-outlined">tune</span> Edit interests
          </Link>
          <Link className={styles.item} href="/shortlist">
            <span className="material-symbols-outlined">bookmark</span> Shortlist
          </Link>
        </div>
      </aside>

      <main className={styles.main}>
        <SearchBar existingTags={q.tagSlugs} basePath={href(q, { tagSlugs: [] })} signedIn={!!user} />

        <div className={styles.feedHead}>
          <div>
            <h1 className={styles.feedTitle}>Curated for you</h1>
            <p className={styles.feedSub}>
              {results.length.toLocaleString()} matches based on your interest in <b>{topTags[0]}</b>
              {topTags[1] ? (
                <>
                  {" "}and <b>{topTags[1]}</b>
                </>
              ) : null}
              .
            </p>
          </div>
          <div className={styles.sortWrap}>
            <span className={styles.sortLabel}>Sort by</span>
            <Link className={`${styles.sortLink} ${!q.sort ? styles.on : ""}`} href={href(q, { sort: undefined })}>
              Best fit
            </Link>
            <Link className={`${styles.sortLink} ${q.sort === "cost" ? styles.on : ""}`} href={href(q, { sort: "cost" })}>
              Cost
            </Link>
          </div>
        </div>

        {results.length === 0 ? (
          <p className={styles.empty}>
            No matches with these filters.{" "}
            {!q.showBroader && broaderCount > 0 ? (
              <>
                <Link href={href(q, { showBroader: true })}>Show {broaderCount.toLocaleString()} broader matches</Link>,
                or try clearing a filter, or <Link href="/onboarding">edit your interests</Link>.
              </>
            ) : (
              <>
                Try clearing one, or <Link href="/onboarding">edit your interests</Link>.
              </>
            )}
          </p>
        ) : (
          <div className={styles.cards}>
            {shown.map((l) => (
              <OppCard key={l.slug} l={l} />
            ))}
          </div>
        )}

        {!q.showAll && results.length > DISPLAY_LIMIT && (
          <div className={styles.explore}>
            <Link className={styles.exploreBtn} href={href(q, { showAll: true })}>
              Explore more opportunities <span className="material-symbols-outlined">arrow_forward</span>
            </Link>
          </div>
        )}

        {q.showAll && results.length > MAX_RENDERED && (
          <p className={styles.empty}>
            Showing the top {MAX_RENDERED.toLocaleString()} of {results.length.toLocaleString()} — narrow your
            interests or filters to zero in on the best fits.
          </p>
        )}
      </main>
    </div>
  );
}

function OppCard({ l }: { l: MatchedListing }) {
  const fav = faviconFor(l.url);
  return (
    <article className={styles.card}>
      {l.fitLabel === "Great fit" ? (
        <span className={styles.badge}>
          <span className="material-symbols-outlined">auto_awesome</span> AI-MATCHED
        </span>
      ) : l.fitLabel ? (
        <span className={`${styles.badge} ${styles.new}`}>{l.fitLabel}</span>
      ) : null}

      <div className={styles.head}>
        <div className={styles.logo}>
          {fav ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fav} alt="" loading="lazy" />
          ) : (
            <span className="material-symbols-outlined">{KIND_ICON[l.kind]}</span>
          )}
        </div>
        <div>
          <h3 className={styles.title}>
            <Link href={`/listing/${l.slug}`}>{l.title}</Link>
          </h3>
          <p className={styles.org}>{KIND_LABEL[l.kind]}</p>
        </div>
      </div>

      {l.matchedTags.length > 0 && (
        <div className={styles.tags}>
          {l.matchedTags.slice(0, 3).map((t) => (
            <span key={t} className={styles.tag}>
              {t}
            </span>
          ))}
        </div>
      )}

      <div className={styles.foot}>
        <div className={styles.metaRow}>
          <span className={styles.metaItem}>
            <span className="material-symbols-outlined">{l.is_remote ? "public" : "location_on"}</span>
            {l.is_remote ? "Remote" : l.location_name ?? "—"}
          </span>
          <span className={styles.metaItem}>
            <span className="material-symbols-outlined">payments</span>
            {COST_LABEL[l.cost_type] ?? l.cost_type}
          </span>
        </div>
        <div className={styles.actions}>
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
          <Link className={styles.apply} href={`/listing/${l.slug}`}>
            Details
          </Link>
        </div>
      </div>
    </article>
  );
}
