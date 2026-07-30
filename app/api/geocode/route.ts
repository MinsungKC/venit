import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Geocode a free-text US place (city, or "City, State") to coordinates so a student can set their
 * real location for the "near me" radius (BUILD_PROMPT §5). Server-side via Nominatim (OSM, free,
 * no key), with an in-memory cache + rate limit to respect its usage policy. Only a coarse
 * lat/lng + a short label are returned; nothing is stored.
 */
const MAILTO = "youngimyoo@yahoo.com";
const cache = new Map<string, { lat: number; lng: number; label: string } | null>();

function shortLabel(displayName: string): string {
  const parts = displayName.split(",").map((p) => p.trim());
  // "City, County, State, …" → "City, State" (skip county-ish middle parts heuristically).
  if (parts.length >= 3) return `${parts[0]}, ${parts[parts.length - 2]}`;
  return parts.slice(0, 2).join(", ");
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 2) return NextResponse.json({ error: "Enter a city." }, { status: 400 });

  const key = q.toLowerCase();
  if (cache.has(key)) {
    const v = cache.get(key)!;
    return v ? NextResponse.json(v) : NextResponse.json({ error: "Place not found." }, { status: 404 });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`geocode:${ip}`, 30, 60_000)) {
    return NextResponse.json({ error: "Too many lookups. Slow down a moment." }, { status: 429 });
  }

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1&countrycodes=us`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `OppMatch/0.1 (${MAILTO})` },
      signal: AbortSignal.timeout(8000),
    });
    const j = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    if (!j[0]) {
      cache.set(key, null);
      return NextResponse.json({ error: "Place not found." }, { status: 404 });
    }
    const out = { lat: Number(j[0].lat), lng: Number(j[0].lon), label: shortLabel(j[0].display_name) };
    cache.set(key, out);
    return NextResponse.json(out);
  } catch {
    return NextResponse.json({ error: "Lookup failed. Try again." }, { status: 502 });
  }
}
