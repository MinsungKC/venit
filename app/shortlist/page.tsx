"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { listStars, removeStar, onStarsChanged, type StarRecord } from "@/lib/stars";
import type { CostType, ListingKind } from "@/lib/mapping";
import styles from "./shortlist.module.css";

/**
 * The local-first shortlist view (BUILD_PROMPT §6). Reads from lib/stars and live-updates
 * via onStarsChanged, so starring anywhere in the app is reflected here without a reload.
 * Only public listing fields are rendered — nothing personality-related is stored or shown.
 */

const KIND_LABEL: Record<ListingKind, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
};

const COST_LABEL: Record<CostType, string> = {
  free: "Free",
  stipend: "Stipend",
  paid: "Paid",
  unknown: "Cost unknown",
};

export default function ShortlistPage() {
  const [stars, setStars] = useState<StarRecord[]>([]);

  // Read on mount and re-read on every shortlist change (same-tab + cross-tab).
  useEffect(() => {
    const sync = () => setStars(listStars());
    sync();
    return onStarsChanged(sync);
  }, []);

  return (
    <main className="container">
      <header className="page-head">
        <div>
          <Link href="/" className="back">
            ← OppMatch
          </Link>
          <h1>Your shortlist</h1>
        </div>
        <p className="count">
          {stars.length} saved {stars.length === 1 ? "listing" : "listings"}
        </p>
      </header>

      {stars.length === 0 ? (
        <p className="empty">
          Nothing saved yet. Star opportunities as you browse and they&apos;ll show up here.
          <br />
          <Link className="button" href="/match">
            Find matches →
          </Link>
        </p>
      ) : (
        <>
          <div className={styles.toolbar}>
            <CopyButton stars={stars} />
            <ShareLinkButton stars={stars} />
          </div>
          <div className="grid">
            {stars.map((s) => (
              <ShortlistCard key={s.slug} star={s} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

/** Copy the shortlist as a plain-text "title + url" list (BUILD_PROMPT §7 shareable list). */
function CopyButton({ stars }: { stars: StarRecord[] }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const text = stars
      .map((s) => (s.url ? `${s.title} — ${s.url}` : s.title))
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked (e.g. insecure context) — leave the button state unchanged.
    }
  };

  return (
    <button className={`${styles.copyBtn} ${copied ? styles.done : ""}`} onClick={copy}>
      {copied ? "Copied!" : "Copy shareable list"}
    </button>
  );
}

/** Copy a read-only /shared?ids=… link to send to a parent/teacher (BUILD_PROMPT §7). */
function ShareLinkButton({ stars }: { stars: StarRecord[] }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    const ids = stars.map((s) => s.slug).join(",");
    const url = `${window.location.origin}/shared?ids=${encodeURIComponent(ids)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard blocked — no-op.
    }
  };

  return (
    <button className={`${styles.copyBtn} ${copied ? styles.done : ""}`} onClick={copy}>
      {copied ? "Link copied!" : "Copy share link"}
    </button>
  );
}

function ShortlistCard({ star }: { star: StarRecord }) {
  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <h3 className={styles.title}>
          {star.url ? (
            <a href={star.url} target="_blank" rel="noopener noreferrer">
              {star.title}
            </a>
          ) : (
            star.title
          )}
        </h3>
        <button
          className={styles.removeBtn}
          onClick={() => removeStar(star.slug)}
          aria-label={`Remove ${star.title} from shortlist`}
        >
          Remove
        </button>
      </div>

      <p className="kindline">
        <span className={`kind kind-${star.kind}`}>{KIND_LABEL[star.kind]}</span>
        <span className="cost"> · {COST_LABEL[star.cost_type]}</span>
      </p>

      <p className={styles.meta}>{star.is_remote ? "Remote" : star.location_name ?? "—"}</p>
    </article>
  );
}
