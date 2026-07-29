import type { ReactNode } from "react";
import type { ListingView } from "@/lib/listings";
import type { ListingKind } from "@/lib/mapping";

export const KIND_LABEL: Record<ListingKind, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
};

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

/**
 * Presentational listing card, shared by the results grid and the shortlist. Deliberately
 * client/server-agnostic (no hooks) so a server page can hand it a client `star` island.
 * Renders only interest tags — never any personality data.
 */
export default function ListingCard({
  l,
  matched,
  star,
}: {
  l: ListingView;
  /** Interest-tag labels the user matched on, shown first and highlighted. */
  matched?: Set<string>;
  /** Optional star/save control (a client island). */
  star?: ReactNode;
}) {
  const badge = statusBadge(l);
  const fav = faviconFor(l.url);
  const tags = matched
    ? [...l.tags].sort((a, b) => Number(matched.has(b)) - Number(matched.has(a)))
    : l.tags;

  return (
    <article className="card">
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
        <div className="card-actions">
          {badge && <span className={`badge ${badge.cls}`}>{badge.text}</span>}
          {star}
        </div>
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

      {tags.length > 0 && (
        <ul className="tags" aria-label="Interest tags">
          {tags.slice(0, 8).map((t) => (
            <li className={`tag ${matched?.has(t) ? "match" : ""}`} key={t}>
              {t}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
