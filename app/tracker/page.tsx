"use client";

/**
 * Application tracker — a simple Kanban board (BUILD_PROMPT §7 ★). Reads the local-first
 * shortlist from lib/stars and lets a student move each saved listing across four status
 * columns, jot private notes, or drop it. Fully client-side and account-free; it re-reads on
 * every stars-changed event so the board stays in sync with the StarButton elsewhere.
 *
 * Guardrails: only public listing fields are ever shown — nothing personality-related exists
 * in StarRecord, so there is nothing secret to leak here.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import {
  listStars,
  onStarsChanged,
  removeStar,
  setNotes,
  setStatus,
  type StarRecord,
  type TrackStatus,
} from "@/lib/stars";
import type { ListingKind } from "@/lib/mapping";
import styles from "./tracker.module.css";

// The four columns, left → right, matching the TrackStatus union order.
const COLUMNS: { status: TrackStatus; label: string }[] = [
  { status: "interested", label: "Interested" },
  { status: "applied", label: "Applied" },
  { status: "accepted", label: "Accepted" },
  { status: "rejected", label: "Rejected" },
];

const KIND_LABEL: Record<ListingKind, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
  volunteer: "Volunteering",
};

export default function TrackerPage() {
  const [stars, setStars] = useState<StarRecord[]>([]);

  useEffect(() => {
    // Read on mount, then keep in sync with same-tab + cross-tab shortlist changes.
    const sync = () => setStars(listStars());
    sync();
    return onStarsChanged(sync);
  }, []);

  return (
    <main className="container">
      <header className="page-head">
        <div>
          <Link href="/" className="back">
            ← venit
          </Link>
          <h1>Application tracker</h1>
        </div>
        <p className="count">Move each saved opportunity as you apply, hear back, and decide.</p>
      </header>

      {stars.length === 0 ? (
        <p className="empty">
          Nothing saved yet. Star opportunities and they&apos;ll show up here to track.
          <br />
          <Link className="button" href="/match">
            Find matches →
          </Link>
        </p>
      ) : (
        <div className={styles.board}>
          {COLUMNS.map(({ status, label }) => {
            const cards = stars.filter((s) => s.status === status);
            return (
              <section className={styles.column} key={status}>
                <div className={styles.columnHead}>
                  <h2 className={styles.columnTitle}>{label}</h2>
                  <span className={styles.columnCount}>{cards.length}</span>
                </div>
                <div className={styles.cards}>
                  {cards.length === 0 ? (
                    <p className={styles.columnEmpty}>Nothing here.</p>
                  ) : (
                    cards.map((card) => <Card key={card.slug} card={card} />)
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}

function Card({ card }: { card: StarRecord }) {
  // Index of this card's status so ← / → can step to the neighbouring column.
  const idx = COLUMNS.findIndex((c) => c.status === card.status);
  const prev = idx > 0 ? COLUMNS[idx - 1] : null;
  const next = idx < COLUMNS.length - 1 ? COLUMNS[idx + 1] : null;

  return (
    <article className={styles.card}>
      <div className={styles.cardTop}>
        <h3 className={styles.cardTitle}>
          {card.url ? (
            <a href={card.url} target="_blank" rel="noopener noreferrer">
              {card.title}
            </a>
          ) : (
            card.title
          )}
        </h3>
        <button
          className={styles.remove}
          onClick={() => removeStar(card.slug)}
          aria-label={`Remove ${card.title}`}
          title="Remove"
        >
          ✕
        </button>
      </div>

      <p className={styles.kindline}>
        <span className={`kind kind-${card.kind}`}>{KIND_LABEL[card.kind]}</span>
        {card.is_remote ? (
          <span className={styles.meta}> · Remote</span>
        ) : card.location_name ? (
          <span className={styles.meta}> · {card.location_name}</span>
        ) : null}
      </p>

      <textarea
        className={styles.notes}
        defaultValue={card.notes ?? ""}
        placeholder="Notes (deadline, contact, next step…)"
        rows={2}
        // Local-first: persist on blur so we don't thrash localStorage on every keypress.
        onBlur={(e) => setNotes(card.slug, e.target.value)}
        aria-label={`Notes for ${card.title}`}
      />

      <div className={styles.moveRow}>
        <button
          className={styles.move}
          onClick={() => prev && setStatus(card.slug, prev.status)}
          disabled={!prev}
          aria-label={prev ? `Move to ${prev.label}` : "Already in the first column"}
          title={prev ? `Move to ${prev.label}` : undefined}
        >
          ←
        </button>
        <button
          className={styles.move}
          onClick={() => next && setStatus(card.slug, next.status)}
          disabled={!next}
          aria-label={next ? `Move to ${next.label}` : "Already in the last column"}
          title={next ? `Move to ${next.label}` : undefined}
        >
          →
        </button>
      </div>
    </article>
  );
}
