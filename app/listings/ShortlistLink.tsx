"use client";

import Link from "next/link";
import { useStars } from "@/lib/stars";

/** Header link to the shortlist, showing a live saved-count badge. */
export default function ShortlistLink() {
  const count = useStars().length;
  return (
    <Link className="shortlist-link" href="/shortlist">
      ★ Shortlist
      {count > 0 && <span className="shortlist-n">{count}</span>}
    </Link>
  );
}
