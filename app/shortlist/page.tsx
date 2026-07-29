"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { ListingView } from "@/lib/listings";
import { parseItemsParam, orderBySlugs } from "@/lib/shortlist";
import { useStars, removeStar } from "@/lib/stars";
import ListingCard from "../listings/ListingCard";
import StarButton from "../listings/StarButton";

export const dynamic = "force-dynamic";

export default function ShortlistPage() {
  const searchParams = useSearchParams();
  const sharedSlugs = useMemo(
    () => parseItemsParam(searchParams.get("items")),
    [searchParams],
  );
  const shared = sharedSlugs.length > 0;

  const myStars = useStars();
  const slugs = shared ? sharedSlugs : myStars;

  const [listings, setListings] = useState<ListingView[] | null>(null);
  const slugsKey = slugs.join(",");

  useEffect(() => {
    let alive = true;
    if (slugs.length === 0) {
      setListings([]);
      return;
    }
    fetch("/api/shortlist", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ slugs }),
    })
      .then((r) => r.json())
      .then((data: { listings: ListingView[] }) => {
        if (alive) setListings(orderBySlugs(data.listings, slugs));
      })
      .catch(() => {
        if (alive) setListings([]);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slugsKey]);

  async function copyShareLink() {
    const url = `${window.location.origin}/shortlist?items=${myStars.join(",")}`;
    try {
      await navigator.clipboard.writeText(url);
      alert("Shareable link copied to your clipboard.");
    } catch {
      window.prompt("Copy your shareable shortlist link:", url);
    }
  }

  return (
    <main className="container">
      <header className="page-head">
        <div>
          <Link href="/listings" className="back">
            ← Back to opportunities
          </Link>
          <h1>{shared ? "Shared shortlist" : "Your shortlist"}</h1>
        </div>
        {!shared && myStars.length > 0 && (
          <button type="button" className="button" onClick={copyShareLink}>
            Copy shareable link
          </button>
        )}
      </header>

      {shared && (
        <p className="count" style={{ marginBottom: 20 }}>
          Someone shared these {sharedSlugs.length.toLocaleString()} opportunities with you. Star
          any to save them to your own shortlist.
        </p>
      )}

      {listings === null && <p className="count">Loading…</p>}

      {listings !== null && listings.length === 0 && (
        <p className="empty">
          {shared
            ? "This shared shortlist is empty or its links are no longer available."
            : "You haven't saved anything yet. Browse opportunities and tap ☆ to build your shortlist."}
        </p>
      )}

      {listings !== null && listings.length > 0 && (
        <section className="grid">
          {listings.map((l) => (
            <ListingCard key={l.slug} l={l} star={<StarButton slug={l.slug} title={l.title} />} />
          ))}
        </section>
      )}

      {!shared && myStars.length > 0 && (
        <p className="count" style={{ marginTop: 20 }}>
          {myStars.length.toLocaleString()} saved.{" "}
          <button
            type="button"
            className="picker-clear"
            onClick={() => myStars.forEach((s) => removeStar(s))}
          >
            Clear shortlist
          </button>
        </p>
      )}
    </main>
  );
}
