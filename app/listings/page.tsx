import Link from "next/link";
import { getListings } from "@/lib/listings";

export const dynamic = "force-dynamic";

export default async function ListingsPage() {
  const { listings, total, source } = await getListings(90);

  return (
    <main className="container">
      <header className="page-head">
        <div>
          <Link href="/" className="back">
            ← OppMatch
          </Link>
          <h1>Companies</h1>
        </div>
        <p className="count">
          Showing {listings.length.toLocaleString()} of {total.toLocaleString()} companies
          <span className="src"> · {source === "database" ? "live database" : "static seed"}</span>
        </p>
      </header>

      <section className="grid">
        {listings.map((l) => (
          <article className="card" key={l.slug}>
            <div className="card-top">
              <h2 className="card-title">
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    {l.title}
                  </a>
                ) : (
                  l.title
                )}
              </h2>
              <span className={`badge ${l.is_recruiting ? "hiring" : "quiet"}`}>
                {l.is_recruiting ? "Hiring" : "Not actively recruiting"}
              </span>
            </div>

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
        ))}
      </section>
    </main>
  );
}
