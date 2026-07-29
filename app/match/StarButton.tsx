"use client";

import { useEffect, useState } from "react";
import { isStarred, onStarsChanged, toggleStar, type StarSnapshot } from "@/lib/stars";

/**
 * Star a listing into the local-first shortlist (BUILD_PROMPT §6/§7). Backed by lib/stars so the
 * shortlist and tracker pages stay in sync. Stores only public listing fields — nothing secret.
 */
export default function StarButton({ snapshot }: { snapshot: StarSnapshot }) {
  const [starred, setStarred] = useState(false);

  useEffect(() => {
    const sync = () => setStarred(isStarred(snapshot.slug));
    sync();
    return onStarsChanged(sync);
  }, [snapshot.slug]);

  return (
    <button
      className={`star ${starred ? "on" : ""}`}
      onClick={() => setStarred(toggleStar(snapshot))}
      aria-pressed={starred}
      aria-label={starred ? "Remove from shortlist" : "Save to shortlist"}
      title={starred ? "Saved" : "Save"}
    >
      {starred ? "★" : "☆"}
    </button>
  );
}
