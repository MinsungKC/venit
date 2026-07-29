/**
 * Local-first shortlist store (BUILD_PROMPT §6 "save without account", §7 tracker). Stars are
 * kept in localStorage with a small snapshot of each listing so the shortlist and application
 * tracker can render without a server round-trip. No account needed; a later sync can adopt it.
 *
 * Client-only (guards `window`). Nothing personality-related is ever stored — only public
 * listing fields the student already sees.
 */
import type { CostType, ListingKind } from "./mapping";

export interface StarSnapshot {
  slug: string;
  title: string;
  kind: ListingKind;
  url: string | null;
  cost_type: CostType;
  location_name: string | null;
  is_remote: boolean;
}

/** Application-tracker status for a starred listing (BUILD_PROMPT §7 ★ Kanban). */
export type TrackStatus = "interested" | "applied" | "accepted" | "rejected";

export interface StarRecord extends StarSnapshot {
  status: TrackStatus;
  notes?: string;
  starredAt: number;
}

const KEY = "oppmatch:stars:v1";
const EVENT = "oppmatch:stars-changed";

function canUse(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readAll(): Record<string, StarRecord> {
  if (!canUse()) return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as Record<string, StarRecord>;
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, StarRecord>): void {
  if (!canUse()) return;
  window.localStorage.setItem(KEY, JSON.stringify(map));
  // Notify listeners in this tab (the native 'storage' event only fires in *other* tabs).
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function listStars(): StarRecord[] {
  return Object.values(readAll()).sort((a, b) => b.starredAt - a.starredAt);
}

export function isStarred(slug: string): boolean {
  return slug in readAll();
}

/** Toggle a star; returns the new starred state. Adds with a snapshot, removes by slug. */
export function toggleStar(snapshot: StarSnapshot): boolean {
  const map = readAll();
  if (map[snapshot.slug]) {
    delete map[snapshot.slug];
    writeAll(map);
    return false;
  }
  map[snapshot.slug] = { ...snapshot, status: "interested", starredAt: Date.now() };
  writeAll(map);
  return true;
}

export function removeStar(slug: string): void {
  const map = readAll();
  if (map[slug]) {
    delete map[slug];
    writeAll(map);
  }
}

export function setStatus(slug: string, status: TrackStatus): void {
  const map = readAll();
  if (map[slug]) {
    map[slug].status = status;
    writeAll(map);
  }
}

export function setNotes(slug: string, notes: string): void {
  const map = readAll();
  if (map[slug]) {
    map[slug].notes = notes;
    writeAll(map);
  }
}

/** Subscribe to shortlist changes (same-tab custom event + cross-tab storage event). */
export function onStarsChanged(fn: () => void): () => void {
  if (!canUse()) return () => {};
  const handler = () => fn();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}
