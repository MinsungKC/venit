import Link from "next/link";
import SearchBar from "./SearchBar";

export default function Home() {
  return (
    <main className="home">
      <div className="home-center">
        <h1 className="home-headline">
          Find opportunities <span className="grad-text">that fit you</span>
        </h1>
        <p className="home-tagline">Companies, labs, camps &amp; programs — matched to your interests.</p>
        <SearchBar />
        <p className="home-or">or</p>
        <Link className="get-started" href="/onboarding">
          <span>Get started</span>
          <span className="gs-arrow">→</span>
        </Link>
      </div>
    </main>
  );
}
