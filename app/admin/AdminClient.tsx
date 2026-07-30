"use client";

import { useMemo, useState } from "react";
import type { PendingRow } from "@/lib/admin";
import styles from "./admin.module.css";

const KIND_LABEL: Record<string, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
};

/**
 * Records table (moderation queue) with search + approve/reject, styled as the Stitch admin
 * table. `adminKey` is null for a signed-in admin (role-based) — the moderate API falls back to
 * checking their session cookie in that case, so no key needs to travel in the request body.
 */
export default function AdminClient({ pending, adminKey }: { pending: PendingRow[]; adminKey: string | null }) {
  const [rows, setRows] = useState(pending);
  const [busy, setBusy] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.title.toLowerCase().includes(q) || r.kind.includes(q));
  }, [rows, query]);

  async function moderate(id: number, action: "approve" | "reject") {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/moderate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: adminKey ?? undefined, id, action }),
      });
      if (res.ok) setRows((rs) => rs.filter((r) => r.id !== id));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className={styles.panel}>
      <div className={styles.panelHead}>
        <div className={styles.search}>
          <span className="material-symbols-outlined">search</span>
          <input
            style={{ border: "none", background: "transparent", outline: "none", flex: 1, color: "var(--text)" }}
            placeholder="Search the moderation queue…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className={styles.segTabs}>
          <button className={`${styles.seg} ${styles.on}`}>Pending</button>
        </div>
      </div>

      <div className={styles.rowsHead}>
        <span className={styles.colLabel}>Entity</span>
        <span className={styles.colLabel}>Status</span>
        <span className={styles.colLabel}>Category</span>
        <span className={styles.colLabel}>Source</span>
        <span className={styles.colLabel} style={{ textAlign: "right" }}>
          Actions
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className={styles.emptyRow}>Nothing waiting for review. 🎉</div>
      ) : (
        filtered.map((r) => (
          <div className={styles.row} key={r.id}>
            <div className={styles.entity}>
              <span className={styles.avatar}>{r.title.charAt(0).toUpperCase()}</span>
              <div style={{ minWidth: 0 }}>
                <div className={styles.entityName}>
                  {r.url ? (
                    <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                      {r.title}
                    </a>
                  ) : (
                    r.title
                  )}
                </div>
                <div className={styles.entitySub}>{r.tags.slice(0, 3).join(" · ") || "no tags"}</div>
              </div>
            </div>
            <div>
              <span className={`${styles.chip} ${styles.pending}`}>Pending Review</span>
            </div>
            <div className={styles.cell}>{KIND_LABEL[r.kind] ?? r.kind}</div>
            <div className={styles.cell} style={{ textTransform: "capitalize" }}>
              {r.source.replace("_", " ")}
            </div>
            <div className={styles.rowActions}>
              <button
                className={`${styles.iconBtn} ${styles.approve}`}
                title="Approve"
                disabled={busy === r.id}
                onClick={() => moderate(r.id, "approve")}
              >
                <span className="material-symbols-outlined">check_circle</span>
              </button>
              <button
                className={`${styles.iconBtn} ${styles.reject}`}
                title="Reject"
                disabled={busy === r.id}
                onClick={() => moderate(r.id, "reject")}
              >
                <span className="material-symbols-outlined">cancel</span>
              </button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
