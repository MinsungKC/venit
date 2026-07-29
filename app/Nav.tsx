import Link from "next/link";

/** Slim global navigation shown on every page (BUILD_PROMPT §6 — one place to reach each flow). */
export default function Nav() {
  return (
    <nav className="topnav" aria-label="Primary">
      <Link href="/" className="brand">
        OppMatch
      </Link>
      <div className="topnav-links">
        <Link href="/match">Matches</Link>
        <Link href="/listings">Browse</Link>
        <Link href="/shortlist">Shortlist</Link>
        <Link href="/tracker">Tracker</Link>
      </div>
    </nav>
  );
}
