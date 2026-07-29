import Link from "next/link";
import { notFound } from "next/navigation";
import { getListingBySlug, similarByTags } from "@/lib/match-data";
import type { ListingKind } from "@/lib/mapping";
import StarButton from "../../match/StarButton";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<ListingKind, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
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

export default function ListingPage({ params }: { params: { slug: string } }) {
  const l = getListingBySlug(params.slug);
  if (!l) notFound();

  const similar = similarByTags(l.slug, 6);
  const fav = faviconFor(l.url);

  return (
    <main className="container">
      <Link href="/match" className="back">
        ← Back to matches
      </Link>

      <header className="detail-head">
        <div className="title-wrap">
          {fav && (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="favicon lg" src={fav} alt="" width={36} height={36} loading="lazy" />
          )}
          <div>
            <h1 className="detail-title">{l.title}</h1>
            <p className="kindline">
              <span className={`kind kind-${l.kind}`}>{KIND_LABEL[l.kind]}</span>
              <span className="cost"> · {COST_LABEL[l.cost_type] ?? l.cost_type}</span>
              <span className="cost"> · {l.is_remote ? "Remote" : l.location_name ?? "Location N/A"}</span>
            </p>
          </div>
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
      </header>

      {(l.short_description || l.long_description) && (
        <p className="detail-desc">{l.long_description ?? l.short_description}</p>
      )}

      <div className="detail-actions">
        {l.url && (
          <a className="button" href={l.url} target="_blank" rel="noopener noreferrer">
            Visit site ↗
          </a>
        )}
        {l.apply_url && (
          <a className="button ghost" href={l.apply_url} target="_blank" rel="noopener noreferrer">
            Apply ↗
          </a>
        )}
        {l.linkedin_url && (
          <a className="back" href={l.linkedin_url} target="_blank" rel="noopener noreferrer">
            LinkedIn ↗
          </a>
        )}
      </div>

      {l.tags.length > 0 && (
        <section className="detail-section">
          <h2 className="section-title">Interest tags</h2>
          <ul className="tags">
            {l.tags.map((t) => (
              <li className="tag" key={t}>
                {t}
              </li>
            ))}
          </ul>
        </section>
      )}

      {similar.length > 0 && (
        <section className="detail-section">
          <h2 className="section-title">More like this</h2>
          <div className="grid">
            {similar.map((s) => (
              <article className="card" key={s.slug}>
                <h3 className="card-title">
                  <Link href={`/listing/${s.slug}`}>{s.title}</Link>
                </h3>
                <p className="kindline">
                  <span className={`kind kind-${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                </p>
                {s.short_description && <p className="desc">{s.short_description}</p>}
                {s.matchedTags.length > 0 && (
                  <ul className="tags" aria-label="Shared interest tags">
                    {s.matchedTags.slice(0, 6).map((t) => (
                      <li className="tag on" key={t}>
                        {t}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
