import Link from "next/link";

export default function Home() {
  return (
    <main className="container">
      <h1>Find opportunities that fit you</h1>
      <p className="lede">
        A free database of <strong>companies, research labs, programs, and opportunities</strong>{" "}
        — matched to your interests. Niche startups, big-name companies, university research, and
        pre-college programs. Many aren&apos;t actively recruiting, but you can still discover them
        by shared interest tags.
      </p>
      <p className="cta-row">
        <Link className="button" href="/onboarding">
          Get started →
        </Link>
        <Link className="back browse-link" href="/listings">
          or browse the whole database
        </Link>
      </p>

      <ul className="home-points">
        <li>
          <strong>Match on what you&apos;re into.</strong> Pick interest tags; we rank real
          opportunities that share them.
        </li>
        <li>
          <strong>Save a shortlist.</strong> Star anything and track it from Interested → Applied →
          Accepted — no account needed.
        </li>
        <li>
          <strong>Private by design.</strong> Your inputs stay on your device; we never show or
          store a hidden personality score.
        </li>
      </ul>
    </main>
  );
}
