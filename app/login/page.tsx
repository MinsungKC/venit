import Link from "next/link";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

/** Passwordless sign-in (magic link) so students can save their profile + shortlist across devices. */
export default function LoginPage() {
  return (
    <main className="container">
      <Link href="/" className="back">
        ← OppMatch
      </Link>
      <h1>Sign in</h1>
      <p className="lede">
        We&apos;ll email you a magic link — no password. Signing in lets you save your interests and
        shortlist, and turns on personalized ranking (which stays private).
      </p>
      <LoginForm />
    </main>
  );
}
