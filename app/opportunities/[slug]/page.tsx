import Link from "next/link";
import { notFound } from "next/navigation";
import { getPool } from "@/lib/db";
import type { ListingKind } from "@/lib/mapping";
import OpportunityApplyForm from "./OpportunityApplyForm";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<ListingKind, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
  volunteer: "Volunteering",
};

interface ListingDetail {
  title: string;
  slug: string;
  kind: ListingKind;
  url: string | null;
  short_description: string | null;
  long_description: string | null;
  location_name: string | null;
  is_remote: boolean;
  team_size: number | null;
  industry: string | null;
  is_recruiting: boolean;
  badges: string[];
  tags: string[];
  apply_url: string | null;
}

async function getOpportunityBySlug(slug: string): Promise<ListingDetail | null> {
  const pool = getPool();
  if (!pool) return null;

  const res = await pool.query<{
    title: string;
    slug: string;
    kind: ListingKind;
    url: string | null;
    short_description: string | null;
    long_description: string | null;
    location_name: string | null;
    is_remote: boolean;
    team_size: number | null;
    industry: string | null;
    is_recruiting: boolean;
    badges: string[] | null;
    tags: string[] | null;
    apply_url: string | null;
  }>(
    `select l.title, l.slug, l.kind, l.url, l.short_description, l.long_description,
            l.location_name, l.is_remote, l.team_size, l.industry, l.is_recruiting,
            l.badges, l.apply_url,
            coalesce(array_agg(t.label order by t.label)
                     filter (where t.label is not null), '{}') as tags
       from listings l
       left join listing_interest_tags lit on lit.listing_id = l.id
       left join interest_tags t on t.id = lit.tag_id
      where l.status = 'approved' and l.kind = 'opportunity' and l.slug = $1
      group by l.id
      limit 1`,
    [slug],
  );

  if (res.rows.length === 0) return null;
  const row = res.rows[0];
  return {
    title: row.title,
    slug: row.slug,
    kind: row.kind,
    url: row.url,
    short_description: row.short_description,
    long_description: row.long_description,
    location_name: row.location_name,
    is_remote: row.is_remote,
    team_size: row.team_size,
    industry: row.industry,
    is_recruiting: row.is_recruiting,
    badges: Array.isArray(row.badges) ? row.badges : [],
    tags: Array.isArray(row.tags) ? row.tags : [],
    apply_url: row.apply_url,
  };
}

export default async function OpportunityDetailPage({ params }: { params: { slug: string } }) {
  const listing = await getOpportunityBySlug(params.slug);
  if (!listing) notFound();

  return (
    <main className="container" style={{ display: "grid", gap: 24 }}>
      <Link href="/opportunities" className="button ghost">
        ← Back to opportunities
      </Link>

      <section style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 24, background: "var(--surface)" }}>
        <p style={{ margin: 0, color: "var(--accent)", fontWeight: 600, textTransform: "capitalize" }}>
          {KIND_LABEL[listing.kind]}
        </p>
        <h1 style={{ margin: "8px 0 12px", fontSize: 30 }}>{listing.title}</h1>
        <p style={{ margin: 0, color: "var(--muted)", lineHeight: 1.6 }}>
          {listing.short_description || "A venit opportunity for students to explore and apply to."}
        </p>
      </section>

      <section style={{ display: "grid", gap: 16 }}>
        {listing.long_description && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, background: "var(--surface)" }}>
            <h2 style={{ marginTop: 0 }}>About this opportunity</h2>
            <p style={{ marginBottom: 0, lineHeight: 1.7 }}>{listing.long_description}</p>
          </div>
        )}

        <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, background: "var(--surface)" }}>
          <h2 style={{ marginTop: 0 }}>Opportunity details</h2>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {listing.location_name && <li>Location: {listing.location_name}</li>}
            {listing.is_remote && <li>Remote-friendly</li>}
            {listing.team_size && <li>Team size: {listing.team_size}</li>}
            {listing.industry && <li>Industry: {listing.industry}</li>}
            {listing.is_recruiting ? <li>Currently recruiting</li> : <li>Recruiting status not listed</li>}
          </ul>
        </div>

        {listing.tags.length > 0 && (
          <div style={{ border: "1px solid var(--line)", borderRadius: 12, padding: 16, background: "var(--surface)" }}>
            <h2 style={{ marginTop: 0 }}>Relevant interests</h2>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {listing.tags.map((tag) => (
                <span key={tag} style={{ background: "var(--tag-bg)", color: "var(--tag-text)", borderRadius: 999, padding: "4px 10px", fontSize: 12 }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section style={{ border: "1px solid var(--line)", borderRadius: 16, padding: 24, background: "var(--surface)" }}>
        <h2 style={{ marginTop: 0 }}>Apply through venit</h2>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Share a short note and we’ll capture your interest for this opportunity right here on venit.
        </p>
        <OpportunityApplyForm slug={listing.slug} />
      </section>
    </main>
  );
}
