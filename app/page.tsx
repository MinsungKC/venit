import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <h1>OppMatch</h1>
      <p className="lede">
        A database of companies, programs, and opportunities — matched to what you&apos;re
        into. This early build shows the <strong>companies</strong> database: niche companies
        (many not actively hiring) that you can still discover by shared interest tags.
      </p>
      <p>
        <Link className="button" href="/listings">
          Browse the companies database →
        </Link>
      </p>
    </main>
  );
}
