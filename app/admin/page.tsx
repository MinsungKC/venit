import Link from "next/link";
import { adminKeyOk, getAdminStats, getPendingListings, getSupplyGaps, isAdmin } from "@/lib/admin";
import { getTagCatalog } from "@/lib/match-data";
import { getUser } from "@/lib/supabase/server";
import AdminClient from "./AdminClient";
import AdminManage from "./AdminManage";
import KeyGate from "./KeyGate";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";

/**
 * Admin "System Overview" (Stitch design). Gated by ADMIN_KEY (?key=…, the bootstrap path) OR a
 * signed-in user granted admin via the `roles` table (scripts/grant-admin.ts) — see lib/admin.ts.
 */
export default async function AdminPage({ searchParams }: { searchParams: { key?: string } }) {
  const key = searchParams.key ?? null;
  const viaKey = adminKeyOk(key);

  const user = viaKey ? null : await getUser();
  const viaRole = user ? await isAdmin(user.id) : false;

  if (!viaKey && !viaRole) {
    return (
      <main className="container">
        <Link href="/" className="back">
          ← Home
        </Link>
        <h1>Admin</h1>
        <p className="lede">
          {user
            ? "Your account doesn't have admin access."
            : "Sign in with an admin account, or enter the admin key."}
        </p>
        <KeyGate />
      </main>
    );
  }

  const [pending, gaps, stats] = await Promise.all([getPendingListings(), getSupplyGaps(8), getAdminStats()]);
  const zeroSupply = gaps.filter((g) => g.approved === 0);
  const allTags = getTagCatalog().flatMap((g) => g.tags.map((t) => ({ slug: t.slug, label: t.label })));

  return (
    <main className="container">
      <header className={styles.head}>
        <div>
          <h1 className={styles.headTitle}>System Overview</h1>
          <p className={styles.headSub}>Quality control and platform record management.</p>
        </div>
        <div className={styles.headActions}>
          <Link className={styles.btn} href="/listings">
            <span className="material-symbols-outlined">download</span> Export Data
          </Link>
          <Link className={styles.btnPrimary} href="/register">
            <span className="material-symbols-outlined">add</span> New Entry
          </Link>
        </div>
      </header>

      <section className={styles.statGrid}>
        <StatCard icon="list_alt" label="Live Opportunities" num={stats.approved} trend="Approved" tone="neutral" />
        <StatCard icon="pending_actions" label="Pending Review" num={stats.pending} trend="Needs review" tone="up" />
        <StatCard icon="apartment" label="Providers" num={stats.orgs} trend="Registered" tone="neutral" />
      </section>

      <AdminClient pending={pending} adminKey={key} />

      <AdminManage adminKey={key} allTags={allTags} />

      {(zeroSupply.length > 0 || stats.pending > 0) && (
        <section>
          <h2 className={styles.alertsTitle}>Urgent Quality Alerts</h2>
          <div className={styles.alerts}>
            {stats.pending > 0 && (
              <div className={`${styles.alert} ${styles.warn}`}>
                <span className="material-symbols-outlined">warning</span>
                <div>
                  <h3 className={styles.alertH}>{stats.pending} listings awaiting review</h3>
                  <p className={styles.alertP}>
                    New self-registered opportunities are pending approval and not yet visible to students.
                  </p>
                  <span className={styles.alertLink}>Review the queue above ↑</span>
                </div>
              </div>
            )}
            {zeroSupply.length > 0 && (
              <div className={`${styles.alert} ${styles.info}`}>
                <span className="material-symbols-outlined">priority_high</span>
                <div>
                  <h3 className={styles.alertH}>Supply gap in {zeroSupply.length} interest tags</h3>
                  <p className={styles.alertP}>
                    No approved listings for: {zeroSupply.slice(0, 5).map((g) => g.label).join(", ")}
                    {zeroSupply.length > 5 ? "…" : ""}. Focus outreach here.
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>
      )}
    </main>
  );
}

function StatCard({
  icon,
  label,
  num,
  trend,
  tone,
}: {
  icon: string;
  label: string;
  num: number;
  trend: string;
  tone: "up" | "neutral";
}) {
  return (
    <div className={styles.statCard}>
      <div className={styles.statTop}>
        <span className={styles.statIcon}>
          <span className="material-symbols-outlined">{icon}</span>
        </span>
        <span className={`${styles.trend} ${tone === "up" ? styles.up : styles.neutral}`}>{trend}</span>
      </div>
      <p className={styles.statLabel}>{label}</p>
      <div className={styles.statNum}>{num.toLocaleString()}</div>
    </div>
  );
}
