import Link from "next/link";
import { getUser } from "@/lib/supabase/server";

/** Global top nav (Academic Clarity). Brand + primary links + Post Opportunity + auth. */
export default async function Nav() {
  const user = await getUser();

  return (
    <nav className="topnav" aria-label="Primary">
      <div className="nav-left">
        <Link href="/" className="brand">
          OppMatch
        </Link>
        <div className="topnav-links">
          <Link href="/match">Discover</Link>
          <Link href="/listings">Browse</Link>
          <Link href="/shortlist">Saved</Link>
          <Link href="/tracker">Applications</Link>
        </div>
      </div>
      <div className="nav-right">
        <Link href="/register" className="nav-signin">
          Post Opportunity
        </Link>
        {user ? (
          <form action="/auth/signout" method="post" className="signout-form">
            <span className="nav-email" title={user.email ?? ""}>
              {user.email}
            </span>
            <button type="submit" className="nav-signout">
              Sign out
            </button>
          </form>
        ) : (
          <Link href="/login" className="nav-signout">
            Sign in
          </Link>
        )}
      </div>
    </nav>
  );
}
