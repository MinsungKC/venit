"use client";

import { useState } from "react";
import { LISTING_KINDS, COST_TYPES } from "@/lib/schemas";
import styles from "./admin.module.css";

/**
 * Admin management surface (BUILD_PROMPT §4): search ANY listing and edit / delete it, or add a
 * new (immediately-approved) one. Complements the pending-queue approve/reject in AdminClient.
 * Talks to /api/admin/listing (auth = ADMIN_KEY in the request, or the signed-in admin role).
 */
interface Row {
  id: number;
  slug: string;
  title: string;
  kind: string;
  status: string;
  url: string | null;
  short_description: string | null;
}

const STATUSES = ["approved", "pending", "rejected"] as const;
const box: React.CSSProperties = {
  padding: "8px 10px",
  border: "1px solid var(--line)",
  borderRadius: 8,
  background: "var(--panel)",
  color: "var(--text)",
  font: "inherit",
};

export default function AdminManage({
  adminKey,
  allTags,
}: {
  adminKey: string | null;
  allTags: { slug: string; label: string }[];
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [add, setAdd] = useState({
    title: "",
    kind: "program",
    short_description: "",
    url: "",
    apply_url: "",
    location_name: "",
    is_remote: false,
    cost_type: "unknown",
  });
  const [addTags, setAddTags] = useState<string[]>([]);

  const post = (body: Record<string, unknown>) =>
    fetch("/api/admin/listing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ key: adminKey ?? undefined, ...body }),
    });

  async function search() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/listing?q=${encodeURIComponent(q)}${adminKey ? `&key=${encodeURIComponent(adminKey)}` : ""}`);
      const d = await res.json();
      setRows(res.ok ? d.results ?? [] : []);
      if (!res.ok) setMsg(d.error ?? "Search failed.");
    } finally {
      setBusy(false);
    }
  }

  function edit(id: number, field: keyof Row, value: string) {
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  }

  async function saveRow(r: Row) {
    setBusy(true);
    const res = await post({
      action: "update",
      id: r.id,
      patch: { title: r.title, short_description: r.short_description ?? "", url: r.url ?? "", status: r.status },
    });
    setMsg(res.ok ? `Saved “${r.title}”.` : "Save failed.");
    setBusy(false);
  }

  async function del(r: Row) {
    if (!confirm(`Delete “${r.title}” permanently? This can't be undone.`)) return;
    const res = await post({ action: "delete", id: r.id });
    if (res.ok) {
      setRows((rs) => rs.filter((x) => x.id !== r.id));
      setMsg(`Deleted “${r.title}”.`);
    } else setMsg("Delete failed.");
  }

  async function createListing(e: React.FormEvent) {
    e.preventDefault();
    if (addTags.length === 0) {
      setMsg("Pick at least one interest tag.");
      return;
    }
    setBusy(true);
    const res = await post({ action: "create", listing: add, tag_slugs: addTags });
    const d = await res.json();
    setBusy(false);
    if (res.ok) {
      setMsg(`Added “${add.title}”.`);
      setShowAdd(false);
      setAdd({ title: "", kind: "program", short_description: "", url: "", apply_url: "", location_name: "", is_remote: false, cost_type: "unknown" });
      setAddTags([]);
    } else setMsg(d.error ?? "Add failed.");
  }

  return (
    <section className={styles.panel} style={{ marginTop: 24 }}>
      <div className={styles.panelHead}>
        <div className={styles.search}>
          <span className="material-symbols-outlined">manage_search</span>
          <input
            style={{ border: "none", background: "transparent", outline: "none", flex: 1, color: "var(--text)" }}
            placeholder="Search ALL listings by name to edit or delete…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
          />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.seg} onClick={search} disabled={busy}>
            Search
          </button>
          <button className={`${styles.seg} ${styles.on}`} onClick={() => setShowAdd((s) => !s)}>
            {showAdd ? "Cancel add" : "+ Add listing"}
          </button>
        </div>
      </div>

      {msg && <p style={{ padding: "8px 4px", color: "var(--accent)" }}>{msg}</p>}

      {showAdd && (
        <form onSubmit={createListing} style={{ display: "grid", gap: 10, padding: "12px 4px", borderBottom: "1px solid var(--line)" }}>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input style={{ ...box, flex: 2, minWidth: 180 }} placeholder="Title *" required value={add.title} onChange={(e) => setAdd({ ...add, title: e.target.value })} />
            <select style={{ ...box, flex: 1 }} value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value })}>
              {LISTING_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <select style={{ ...box, flex: 1 }} value={add.cost_type} onChange={(e) => setAdd({ ...add, cost_type: e.target.value })}>
              {COST_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <textarea style={{ ...box, resize: "vertical" }} rows={2} placeholder="Short description * (≥10 chars)" required value={add.short_description} onChange={(e) => setAdd({ ...add, short_description: e.target.value })} />
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <input style={{ ...box, flex: 1, minWidth: 160 }} placeholder="Website URL" value={add.url} onChange={(e) => setAdd({ ...add, url: e.target.value })} />
            <input style={{ ...box, flex: 1, minWidth: 160 }} placeholder="Apply URL" value={add.apply_url} onChange={(e) => setAdd({ ...add, apply_url: e.target.value })} />
            <input style={{ ...box, flex: 1, minWidth: 140 }} placeholder="Location" value={add.location_name} disabled={add.is_remote} onChange={(e) => setAdd({ ...add, location_name: e.target.value })} />
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={add.is_remote} onChange={(e) => setAdd({ ...add, is_remote: e.target.checked })} /> Remote
            </label>
          </div>
          <label style={{ display: "grid", gap: 4, fontSize: 13 }}>
            Interest tags * (Ctrl/Cmd-click for multiple)
            <select
              multiple
              style={{ ...box, minHeight: 96 }}
              value={addTags}
              onChange={(e) => setAddTags(Array.from(e.target.selectedOptions, (o) => o.value))}
            >
              {allTags.map((t) => <option key={t.slug} value={t.slug}>{t.label}</option>)}
            </select>
          </label>
          <button className={`${styles.seg} ${styles.on}`} type="submit" disabled={busy} style={{ justifySelf: "start" }}>
            Add (approved)
          </button>
        </form>
      )}

      {rows.length === 0 ? (
        <div className={styles.emptyRow}>Search for a listing to edit or delete it.</div>
      ) : (
        rows.map((r) => (
          <div key={r.id} style={{ display: "grid", gap: 8, padding: "12px 4px", borderBottom: "1px solid var(--line)" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input style={{ ...box, flex: 2, minWidth: 200 }} value={r.title} onChange={(e) => edit(r.id, "title", e.target.value)} />
              <select style={box} value={r.status} onChange={(e) => edit(r.id, "status", e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className={styles.cell} style={{ opacity: 0.7 }}>{r.kind}</span>
            </div>
            <input style={box} placeholder="Short description" value={r.short_description ?? ""} onChange={(e) => edit(r.id, "short_description", e.target.value)} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input style={{ ...box, flex: 1, minWidth: 200 }} placeholder="URL" value={r.url ?? ""} onChange={(e) => edit(r.id, "url", e.target.value)} />
              <button className={`${styles.seg} ${styles.on}`} onClick={() => saveRow(r)} disabled={busy}>Save</button>
              <button className={styles.seg} onClick={() => del(r)} disabled={busy} style={{ color: "var(--danger, #dc2626)" }}>Delete</button>
            </div>
          </div>
        ))
      )}
    </section>
  );
}
