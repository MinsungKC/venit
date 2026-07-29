import { NextResponse } from "next/server";
import { getListingsBySlugs } from "@/lib/listings";

export const dynamic = "force-dynamic";

/**
 * Resolve a shortlist of listing slugs into full listing views. The slugs come from the
 * student's device (localStorage) or a shared `?items=` link — no identity, no personality.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { slugs?: unknown } | null;
  const slugs = Array.isArray(body?.slugs)
    ? body!.slugs.filter((s): s is string => typeof s === "string").slice(0, 500)
    : [];
  const listings = await getListingsBySlugs(slugs);
  return NextResponse.json({ listings });
}
