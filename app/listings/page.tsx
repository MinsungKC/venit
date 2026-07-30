import Link from "next/link";
import { getListings, type ListingView } from "@/lib/listings";
import type { ListingKind } from "@/lib/mapping";
import SearchBar from "@/app/SearchBar";

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

const KIND_ORDER: ListingKind[] = ["company", "research_lab", "program", "opportunity", "camp"];

/** A small logo for a listing, derived from its website host (no dataset needed). */
function faviconFor(url: string | null): string | null {
  if (!url) return null;
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(url).host}.ico`;
  } catch {
    return null;
  }
}

function statusBadge(l: ListingView): { text: string; cls: string } | null {
  // Generated research groups (OpenAlex): we don't know their HS policy — show no status.
  if (l.badges.includes("openalex")) return null;
  if (l.kind === "company") {
    return l.is_recruiting
      ? { text: "Hiring", cls: "hiring" }
      : { text: "Not actively recruiting", cls: "quiet" };
  }
  return l.is_recruiting
    ? { text: "Accepting students", cls: "hiring" }
    : { text: "Not currently accepting", cls: "quiet" };
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { kind?: string };
}) {
  const kind = KIND_ORDER.includes(searchParams.kind as ListingKind)
    ? (searchParams.kind as ListingKind)
    : undefined;

  const { listings, total, counts, source } = await getListings({ kind, limit: 120 });
  const grandTotal = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <main className="container">
      <header className="page-head">
        <div>
          <Link href="/" className="back">
            ← OppMatch
          </Link>
          <h1>Opportunities</h1>
        </div>
        <p className="count">
          {listings.length.toLocaleString()} shown of {total.toLocaleString()}
          <span className="src"> · {source === "database" ? "live database" : "static seed"}</span>
        </p>
      </header>

      <SearchBar />

      <nav className="tabs" aria-label="Filter by kind">
        <Link className={`tab ${!kind ? "active" : ""}`} href="/listings">
          All <span className="tab-n">{grandTotal.toLocaleString()}</span>
        </Link>
        {KIND_ORDER.filter((k) => counts[k]).map((k) => (
          <Link
            key={k}
            className={`tab ${kind === k ? "active" : ""}`}
            href={`/listings?kind=${k}`}
          >
            {KIND_PLURAL[k]} <span className="tab-n">{counts[k].toLocaleString()}</span>
          </Link>
        ))}
      </nav>

      <section className="grid">
        {listings.map((l) => {
          const badge = statusBadge(l);
          const fav = faviconFor(l.url);
          return (
            <article className="card" key={l.slug}>
              <div className="card-top">
                <div className="title-wrap">
                  {fav && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="favicon" src={fav} alt="" width={20} height={20} loading="lazy" />
                  )}
                  <h2 className="card-title">
                    {l.url ? (
                      <a href={l.url} target="_blank" rel="noopener noreferrer">
                        {l.title}
                      </a>
                    ) : (
                      l.title
                    )}
                  </h2>
                </div>
                {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
              </div>

              <p className="kindline">
                <span className={`kind kind-${l.kind}`}>{KIND_LABEL[l.kind]}</span>
              </p>

              {l.short_description && <p className="desc">{l.short_description}</p>}

              <p className="meta">
                {l.is_remote ? "Remote" : l.location_name ?? "—"}
                {l.industry ? ` · ${l.industry}` : ""}
                {l.team_size ? ` · ${l.team_size.toLocaleString()} people` : ""}
              </p>

              {l.tags.length > 0 && (
                <ul className="tags" aria-label="Interest tags">
                  {l.tags.slice(0, 8).map((t) => (
                    <li className="tag" key={t}>
                      {t}
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
