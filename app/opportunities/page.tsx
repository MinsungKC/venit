import Link from "next/link";
import { getPool } from "@/lib/db";
import type { ListingKind } from "@/lib/mapping";

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const pool = getPool();
  const venitListings = pool
    ? ((await pool.query<{
        title: string;
        slug: string;
        kind: ListingKind;
        url: string | null;
        short_description: string | null;
        location_name: string | null;
        is_remote: boolean;
        team_size: number | null;
        industry: string | null;
        is_recruiting: boolean;
        badges: string[] | null;
        tags: string[] | null;
      }>(
        `select l.title, l.slug, l.kind, l.url, l.short_description, l.location_name,
                l.is_remote, l.team_size, l.industry, l.is_recruiting, l.badges,
                coalesce(array_agg(t.label order by t.label)
                         filter (where t.label is not null), '{}') as tags
           from listings l
           left join listing_interest_tags lit on lit.listing_id = l.id
           left join interest_tags t on t.id = lit.tag_id
          where l.status = 'approved' and l.source::text in ('self_registered', 'admin')
            and l.kind = 'opportunity'
          group by l.id
          order by l.id desc
          limit 50`
      )).rows.map((r) => ({
        title: r.title,
        slug: r.slug,
        kind: r.kind,
        url: r.url,
        short_description: r.short_description,
        location_name: r.location_name,
        is_remote: r.is_remote,
        team_size: r.team_size,
        industry: r.industry,
        is_recruiting: r.is_recruiting,
        badges: Array.isArray(r.badges) ? r.badges : [],
        tags: Array.isArray(r.tags) ? r.tags : [],
      })))
    : [];

  return (
    <main className="container">
      <h1>opportunities @ venit</h1>
      <p className="lede">
        These are the current venit-specific opportunities available to apply for.
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
        <Link href="/" className="button ghost">
          Back home
        </Link>
      </div>

      <section style={{ marginTop: 24, display: "grid", gap: 12 }}>
        {venitListings.map((listing) => (
          <article key={listing.slug} style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, background: "var(--surface)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: 18 }}>{listing.title}</h2>
                <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>{listing.short_description}</p>
              </div>
              <span style={{ color: "var(--accent)", fontWeight: 600, textTransform: "capitalize" }}>{listing.kind}</span>
            </div>
            {listing.tags.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                {listing.tags.map((tag) => (
                  <span key={tag} style={{ background: "var(--tag-bg)", color: "var(--tag-text)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
            <div style={{ marginTop: 12 }}>
              <Link href={`/opportunities/${listing.slug}`} className="button ghost">
                Learn more & apply
              </Link>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
