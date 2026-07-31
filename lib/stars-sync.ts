/**
 * Client-side account sync for the local-first shortlist/tracker (BUILD_PROMPT §7 ★). On a
 * signed-in session it: pulls the account's saved listings, merges them into localStorage, pushes
 * any items that existed only locally (e.g. saved before signing in), and registers a sink so
 * future changes mirror to the account. On a signed-out session it no-ops entirely — the tracker
 * stays purely local ("save without account", §6). Only public listing fields cross the wire.
 */
import { listStars, mergeServerRecords, registerSync, type StarRecord, type SyncOp } from "./stars";

async function push(op: SyncOp): Promise<void> {
  const body =
    op.op === "star"
      ? { op: "star", slug: op.record.slug }
      : op.op === "unstar"
        ? { op: "unstar", slug: op.slug }
        : op.op === "status"
          ? { op: "status", slug: op.slug, status: op.status }
          : { op: "notes", slug: op.slug, notes: op.notes };
  try {
    await fetch("/api/tracker", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    /* offline / transient — local store already updated; a later change re-syncs */
  }
}

/**
 * Initialize sync. Returns true if the student is signed in (sync active), false otherwise.
 * Safe to call once per full page load (the sink is module-global in lib/stars).
 */
export async function initTrackerSync(): Promise<boolean> {
  let items: StarRecord[] = [];
  try {
    const res = await fetch("/api/tracker");
    if (res.status === 401 || !res.ok) return false; // signed out → stay local-only
    items = ((await res.json()) as { items: StarRecord[] }).items ?? [];
  } catch {
    return false;
  }

  const serverSlugs = new Set(items.map((i) => i.slug));
  const localOnly = listStars().filter((r) => !serverSlugs.has(r.slug));

  mergeServerRecords(items); // adopt the account's items locally
  registerSync((op) => void push(op)); // mirror future changes

  // Push items that existed only locally (saved before signing in) so nothing is lost.
  for (const r of localOnly) {
    void push({ op: "star", record: r });
    if (r.status !== "interested") void push({ op: "status", slug: r.slug, status: r.status });
    if (r.notes) void push({ op: "notes", slug: r.slug, notes: r.notes });
  }
  return true;
}
