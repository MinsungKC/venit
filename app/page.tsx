import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <h1>OppMatch</h1>
      <p className="lede">
        A database of <strong>companies, research labs, programs, and opportunities</strong> —
        matched to what you&apos;re into. It spans niche startups, large well-known companies,
        university research labs, and pre-college programs. Many aren&apos;t actively recruiting,
        but you can still discover them by shared interest tags.
      </p>
      <p>
        <Link className="button" href="/listings">
          Browse the database →
        </Link>
      </p>
    </main>
  );
}
