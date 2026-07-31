import Link from "next/link";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/supabase/server";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

/** Same-origin path only (a single leading "/"); otherwise fall back to /match. */
function safeNext(raw: string | undefined): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/match";
  return raw;
}

/** Passwordless sign-in (magic link) so students can save their profile + shortlist across devices. */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string; error?: string };
}) {
  const next = safeNext(searchParams.next);

  // Already signed in? Skip the form and continue to where they were headed.
  const user = await getUser();
  if (user) redirect(next);

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
      {searchParams.error && (
        <p className="auth-error">That sign-in link didn&apos;t work — request a new one below.</p>
      )}
      <LoginForm next={next} />
    </main>
  );
}
