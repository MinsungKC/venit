"use client";

/**
 * Client-side "star" store: the student's shortlist, kept in localStorage so it survives visits
 * with no account (BUILD_PROMPT §7). All mounted star buttons + the header counter subscribe to
 * one source of truth and stay in sync (same tab via a custom event, other tabs via `storage`).
 * Only listing slugs are stored — no personality, no PII.
 */
import { useSyncExternalStore } from "react";
import { toggleSlug } from "./shortlist";

const KEY = "oppmatch.stars";
const EVENT = "oppmatch:stars";
const EMPTY: string[] = [];

// A referentially-stable snapshot for useSyncExternalStore: the array reference only changes
// when the stored value actually changes (compared via its serialized form).
let cache: string[] = EMPTY;
let cacheRaw = "[]";

function refresh(): void {
  if (typeof window === "undefined") return;
  const raw = window.localStorage.getItem(KEY) ?? "[]";
  if (raw === cacheRaw) return;
  cacheRaw = raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    cache = Array.isArray(parsed) ? parsed.filter((s): s is string => typeof s === "string") : EMPTY;
  } catch {
    cache = EMPTY;
  }
}

function write(slugs: string[]): void {
  if (typeof window === "undefined") return;
  cache = slugs;
  cacheRaw = JSON.stringify(slugs);
  window.localStorage.setItem(KEY, cacheRaw);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function getStars(): string[] {
  refresh();
  return cache;
}

export function toggleStar(slug: string): void {
  write(toggleSlug(getStars(), slug));
}

export function removeStar(slug: string): void {
  write(getStars().filter((s) => s !== slug));
}

function subscribe(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", onStorage);
  };
}

/** React hook: the current shortlist, live-updating as stars are toggled anywhere. */
export function useStars(): string[] {
  return useSyncExternalStore(subscribe, getStars, () => EMPTY);
}
