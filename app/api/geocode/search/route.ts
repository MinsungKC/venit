import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Address autocomplete for the globe/distance filter (BUILD_PROMPT §7 map view). Backed by
 * Nominatim (OpenStreetMap) — effectively a full global address database, no API key. Returns up
 * to 5 suggestions with coarse coordinates. The chosen address is used client-side only for
 * distance filtering and is never stored or sent anywhere else.
 */
const MAILTO = "youngimyoo@yahoo.com";
const cache = new Map<string, { label: string; lat: number; lng: number }[]>();

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q")?.trim();
  if (!q || q.length < 3) return NextResponse.json({ results: [] });

  const key = q.toLowerCase();
  if (cache.has(key)) return NextResponse.json({ results: cache.get(key) });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  if (!rateLimit(`geosearch:${ip}`, 40, 60_000)) {
    return NextResponse.json({ error: "Too many lookups." }, { status: 429 });
  }

  const url =
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}` +
    `&format=json&limit=5&addressdetails=0&countrycodes=us`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": `venit/0.1 (${MAILTO})` },
      signal: AbortSignal.timeout(8000),
    });
    const j = (await res.json()) as { lat: string; lon: string; display_name: string }[];
    const results = j.map((r) => ({
      label: r.display_name.split(",").slice(0, 3).join(",").trim(),
      lat: Number(r.lat),
      lng: Number(r.lon),
    }));
    cache.set(key, results);
    return NextResponse.json({ results });
  } catch {
    return NextResponse.json({ results: [] });
  }
}
