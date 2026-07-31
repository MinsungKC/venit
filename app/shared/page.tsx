import Link from "next/link";
import { getListingsBySlugs } from "@/lib/match-data";
import type { ListingKind } from "@/lib/mapping";

export const dynamic = "force-dynamic";

/**
 * Read-only shared shortlist (BUILD_PROMPT §7 "Shareable shortlists"). A student sends
 * /shared?ids=slug1,slug2 to a parent/teacher/counselor; it renders their saved listings with no
 * account and no personality data — just public listing fields.
 */
const KIND_LABEL: Record<ListingKind, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
  volunteer: "Volunteering",
};

const COST_LABEL: Record<string, string> = {
  free: "Free",
  stipend: "Stipend",
  paid: "Paid",
  unknown: "Cost unknown",
};

function faviconFor(url: string | null): string | null {
  if (!url) return null;
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).host}.ico`;
  } catch {
    return null;
  }
}

export default function SharedPage({ searchParams }: { searchParams: { ids?: string } }) {
  const slugs = (searchParams.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const listings = getListingsBySlugs(slugs);

  return (
    <main className="container">
      <header className="page-head">
        <div>
          <Link href="/" className="back">
            ← OppMatch
          </Link>
          <h1>A shared shortlist</h1>
        </div>
        <p className="count">{listings.length} listings</p>
      </header>

      {listings.length === 0 ? (
        <p className="empty">
          This shared list is empty or its links have expired.{" "}
          <Link className="button" href="/match">
            Explore opportunities →
          </Link>
        </p>
      ) : (
        <div className="grid">
          {listings.map((l) => {
            const fav = faviconFor(l.url);
            return (
              <article className="card" key={l.slug}>
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
                </div>
                <p className="kindline">
                  <span className={`kind kind-${l.kind}`}>{KIND_LABEL[l.kind]}</span>
                  <span className="cost"> · {COST_LABEL[l.cost_type] ?? l.cost_type}</span>
                </p>
                {l.short_description && <p className="desc">{l.short_description}</p>}
                <p className="meta">{l.is_remote ? "Remote" : l.location_name ?? "—"}</p>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
