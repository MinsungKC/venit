"use client";

import { toggleStar, useStars } from "@/lib/stars";

/** Star toggle for a single listing. Local-first: writes to the shortlist in localStorage. */
export default function StarButton({ slug, title }: { slug: string; title: string }) {
  const stars = useStars();
  const on = stars.includes(slug);
  return (
    <button
      type="button"
      className={`star ${on ? "on" : ""}`}
      aria-pressed={on}
      aria-label={on ? `Remove ${title} from your shortlist` : `Save ${title} to your shortlist`}
      title={on ? "Saved — click to remove" : "Save to shortlist"}
      onClick={() => toggleStar(slug)}
    >
      {on ? "★" : "☆"}
    </button>
  );
}
