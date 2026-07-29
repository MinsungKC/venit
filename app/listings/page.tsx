import Link from "next/link";
import { getListings, getInterestTags } from "@/lib/listings";
import { parseTagParam } from "@/lib/matching";
import InterestPicker from "./InterestPicker";
import ListingCard from "./ListingCard";
import StarButton from "./StarButton";
import ShortlistLink from "./ShortlistLink";
import type { ListingKind } from "@/lib/mapping";

export const dynamic = "force-dynamic";

const KIND_PLURAL: Record<ListingKind, string> = {
  company: "Companies",
  research_lab: "Research Labs",
  program: "Programs",
  opportunity: "Opportunities",
  camp: "Camps",
};

const KIND_ORDER: ListingKind[] = ["company", "research_lab", "program", "opportunity", "camp"];

/** A /listings href that keeps the active interest selection while switching the kind tab. */
function tabHref(tags: string[], kind?: ListingKind): string {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (tags.length) params.set("tags", tags.join(","));
  const qs = params.toString();
  return qs ? `/listings?${qs}` : "/listings";
}

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: { kind?: string; tags?: string };
}) {
  const kind = KIND_ORDER.includes(searchParams.kind as ListingKind)
    ? (searchParams.kind as ListingKind)
    : undefined;
  const selectedSlugs = parseTagParam(searchParams.tags);

  const [{ listings, total, counts, source }, allTags] = await Promise.all([
    getListings({ kind, tags: selectedSlugs, limit: 120 }),
    getInterestTags(),
  ]);
  const grandTotal = Object.values(counts).reduce((a, b) => a + b, 0);
  const matching = selectedSlugs.length > 0;
  // Labels of the user's selected interests, for the per-card "why you matched" highlight.
  const selectedLabels = new Set(
    allTags.filter((t) => selectedSlugs.includes(t.slug)).map((t) => t.label),
  );

  return (
    <main className="container">
      <header className="page-head">
        <div>
          <Link href="/" className="back">
            ← OppMatch
          </Link>
          <h1>Opportunities</h1>
        </div>
        <div className="head-right">
          <ShortlistLink />
          <p className="count">
            {listings.length.toLocaleString()} shown of {total.toLocaleString()}
            {matching ? " matching your interests" : ""}
            <span className="src">
              {" "}
              · {source === "database" ? "live database" : "static seed"}
            </span>
          </p>
        </div>
      </header>

      <InterestPicker tags={allTags} selected={selectedSlugs} />

      <nav className="tabs" aria-label="Filter by kind">
        <Link className={`tab ${!kind ? "active" : ""}`} href={tabHref(selectedSlugs)}>
          All <span className="tab-n">{grandTotal.toLocaleString()}</span>
        </Link>
        {KIND_ORDER.filter((k) => counts[k]).map((k) => (
          <Link
            key={k}
            className={`tab ${kind === k ? "active" : ""}`}
            href={tabHref(selectedSlugs, k)}
          >
            {KIND_PLURAL[k]} <span className="tab-n">{counts[k].toLocaleString()}</span>
          </Link>
        ))}
      </nav>

      <section className="grid">
        {listings.map((l) => (
          <ListingCard
            key={l.slug}
            l={l}
            matched={matching ? selectedLabels : undefined}
            star={<StarButton slug={l.slug} title={l.title} />}
          />
        ))}
      </section>

      {matching && listings.length === 0 && (
        <p className="empty">
          No listings share your selected interests. Try adding more interests or removing a
          narrow one.
        </p>
      )}
    </main>
  );
}
