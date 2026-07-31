import Link from "next/link";
import { getProviderListings, getProviderStats, type ProviderRow } from "@/lib/admin";
import styles from "./provider.module.css";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
  volunteer: "Volunteering",
};
const KIND_ICON: Record<string, string> = {
  company: "business",
  research_lab: "science",
  program: "school",
  opportunity: "work",
  camp: "cabin",
  volunteer: "volunteer_activism",
};

// Illustrative weekly engagement shape (no per-view analytics are tracked yet).
const ENGAGEMENT = [
  { day: "Mon", h: 45 },
  { day: "Tue", h: 62 },
  { day: "Wed", h: 50 },
  { day: "Thu", h: 78 },
  { day: "Fri", h: 100 },
  { day: "Sat", h: 70 },
  { day: "Sun", h: 84 },
];

/** Provider dashboard (Stitch design). Shows the org's self-registered opportunities + engagement. */
export default async function ProviderPage() {
  const [rows, stats] = await Promise.all([getProviderListings(10), getProviderStats()]);

  return (
    <main className="container">
      <header className={styles.head}>
        <div>
          <h1 className={styles.headTitle}>Provider Dashboard</h1>
          <p className={styles.headSub}>Manage your organization&apos;s opportunities and track engagement.</p>
        </div>
        <div className={styles.miniStats}>
          <div className={styles.miniStat}>
            <div className={styles.miniLabel}>Total Listings</div>
            <div className={styles.miniNum}>{stats.listings.toLocaleString()}</div>
          </div>
          <div className={styles.miniStat}>
            <div className={styles.miniLabel}>Live</div>
            <div className={styles.miniNum}>{stats.live.toLocaleString()}</div>
          </div>
        </div>
      </header>

      <div className={styles.row2}>
        <div className={styles.chartCard}>
          <h2 className={styles.chartTitle}>Engagement Trends</h2>
          <div className={styles.bars}>
            {ENGAGEMENT.map((b) => (
              <div className={styles.barCol} key={b.day}>
                <div className={`${styles.bar} ${b.h === 100 ? styles.peak : ""}`} style={{ height: `${b.h}%` }} />
                <span className={styles.barLabel}>{b.day}</span>
              </div>
            ))}
          </div>
          <p className={styles.note}>Illustrative — per-listing view analytics aren&apos;t tracked yet.</p>
        </div>

        <div className={styles.quickCard}>
          <span className={styles.quickIcon}>
            <span className="material-symbols-outlined">auto_awesome</span>
          </span>
          <div className={styles.quickH}>Quick Match</div>
          <p className={styles.quickP}>
            Students are ranked to your listings by a private personality-fit signal. See who fits best.
          </p>
          <Link className={styles.quickBtn} href="/match">
            View Matches
          </Link>
        </div>
      </div>

      <section className={styles.panel}>
        <div className={styles.panelHead}>
          <h2 className={styles.panelTitle}>Active Opportunities</h2>
          <div className={styles.search}>
            <span className="material-symbols-outlined">search</span>
            <span>Search listings…</span>
          </div>
        </div>

        <div className={styles.rowsHead}>
          <span className={styles.colLabel}>Opportunity</span>
          <span className={styles.colLabel}>Status</span>
          <span className={styles.colLabel}>Type</span>
          <span className={styles.colLabel}>Added</span>
          <span className={styles.colLabel} style={{ textAlign: "right" }}>
            Actions
          </span>
        </div>

        {rows.length === 0 ? (
          <div className={styles.emptyRow}>
            No opportunities yet. <Link href="/register">Post your first opportunity →</Link>
          </div>
        ) : (
          rows.map((r) => <ProviderRowView key={r.id} r={r} />)
        )}
      </section>
    </main>
  );
}

function ProviderRowView({ r }: { r: ProviderRow }) {
  const status =
    r.status === "approved"
      ? { label: "OPEN", cls: styles.open }
      : r.status === "pending"
        ? { label: "REVIEWING", cls: styles.review }
        : { label: "CLOSED", cls: styles.closed };
  return (
    <div className={styles.trow}>
      <div className={styles.opp}>
        <span className={styles.oppIcon}>
          <span className="material-symbols-outlined">{KIND_ICON[r.kind] ?? "work"}</span>
        </span>
        <div style={{ minWidth: 0 }}>
          <div className={styles.oppName}>{r.title}</div>
          <div className={styles.oppSub}>{r.tags.slice(0, 3).join(" · ") || "no tags"}</div>
        </div>
      </div>
      <div>
        <span className={`${styles.chip} ${status.cls}`}>{status.label}</span>
      </div>
      <div className={styles.cell}>{KIND_LABEL[r.kind] ?? r.kind}</div>
      <div className={styles.cell}>{r.created}</div>
      <Link className={styles.kebab} href={`/admin`} title="Manage">
        <span className="material-symbols-outlined">more_vert</span>
      </Link>
    </div>
  );
}
