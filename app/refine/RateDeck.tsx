"use client";

import { useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "./refine.module.css";

interface Opp {
  slug: string;
  title: string;
  kind: string;
  tags: string[];
  tagSlugs: string[];
  description: string | null;
  url: string | null;
  location: string;
  cost: string;
}

const KIND_LABEL: Record<string, string> = {
  company: "Company",
  research_lab: "Research Lab",
  program: "Program",
  opportunity: "Opportunity",
  camp: "Camp",
  volunteer: "Volunteering",
};
const COST_LABEL: Record<string, string> = {
  free: "Free",
  stipend: "Stipend",
  paid: "Paid",
  unknown: "Cost N/A",
};

/**
 * "Rate your top 5" flashcard deck. Tap a card to send it to the back; tap the name for details;
 * drag the hover slider to rate the fit. Highly-rated cards' tags boost the full results.
 */
export default function RateDeck({ opps, carry }: { opps: Opp[]; carry: string }) {
  const router = useRouter();
  const [order, setOrder] = useState<number[]>(opps.map((_, i) => i));
  const [ratings, setRatings] = useState<Record<string, number>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  const cycle = () => setOrder((o) => [...o.slice(1), o[0]]);
  const rate = (slug: string, v: number) => setRatings((r) => ({ ...r, [slug]: v }));
  const ratedCount = Object.keys(ratings).length;

  function showMatches() {
    const boost = new Set<string>();
    for (const opp of opps) if ((ratings[opp.slug] ?? 0) >= 60) opp.tagSlugs.forEach((s) => boost.add(s));
    const params = new URLSearchParams(carry);
    if (boost.size) params.set("boost", [...boost].join(","));
    const qs = params.toString();
    router.push(qs ? `/match?${qs}` : "/match");
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.head}>
        <h1 className={styles.title}>Your top matches</h1>
        <p className={styles.sub}>
          Rate how well each fits you — it fine-tunes everything else. Tap a card to see the next.
        </p>
      </div>

      <div className={styles.deck}>
        {order.map((idx, pos) => {
          const opp = opps[idx];
          const isTop = pos === 0;
          const style: CSSProperties = {
            zIndex: order.length - pos,
            transform: `translateY(${pos * 16}px) scale(${1 - pos * 0.05})`,
            opacity: pos > 3 ? 0 : 1,
            pointerEvents: isTop ? "auto" : "none",
          };
          return (
            <article
              key={opp.slug}
              className={`${styles.card} ${isTop ? styles.top : ""}`}
              style={style}
              onClick={() => isTop && cycle()}
            >
              <div className={styles.cardHead}>
                <span className={styles.kind}>{KIND_LABEL[opp.kind] ?? opp.kind}</span>
                <span className={styles.pos}>
                  {idx + 1} / {opps.length}
                </span>
              </div>

              <button
                className={styles.name}
                onClick={(e) => {
                  e.stopPropagation();
                  setExpanded((x) => (x === opp.slug ? null : opp.slug));
                }}
              >
                {opp.title}
              </button>

              <div className={styles.cardTags}>
                {opp.tags.map((t) => (
                  <span key={t} className={styles.tag}>
                    {t}
                  </span>
                ))}
              </div>

              {expanded === opp.slug && (
                <div className={styles.info} onClick={(e) => e.stopPropagation()}>
                  {opp.description && <p className={styles.infoP}>{opp.description}</p>}
                  <p className={styles.infoMeta}>
                    {opp.location} · {COST_LABEL[opp.cost] ?? opp.cost}
                  </p>
                  <Link href={`/listing/${opp.slug}`} className={styles.infoLink} target="_blank">
                    Full details →
                  </Link>
                </div>
              )}

              {isTop && (
                <div className={styles.rateRow} onClick={(e) => e.stopPropagation()}>
                  <span className={styles.rateLabel}>How well does this match you?</span>
                  <div className={styles.sliderRow}>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={ratings[opp.slug] ?? 50}
                      className={styles.slider}
                      style={{ ["--val" as string]: `${ratings[opp.slug] ?? 50}%` } as CSSProperties}
                      onChange={(e) => rate(opp.slug, Number(e.target.value))}
                    />
                    <span className={styles.rateVal}>{ratings[opp.slug] ?? 50}</span>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      <div className={styles.actions}>
        <button className={styles.primary} onClick={showMatches}>
          Show all my matches →
        </button>
        <Link className={styles.skip} href={carry ? `/match?${carry}` : "/match"}>
          Skip
        </Link>
      </div>
      <p className={styles.hint}>
        Tap a card to cycle · tap the name for details · {ratedCount}/{opps.length} rated
      </p>
    </div>
  );
}
