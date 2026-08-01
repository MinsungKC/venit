import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserProfile } from "@/lib/profile";
import { getUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function Home() {
  // Signed-in students open straight into the app: their matches if they've onboarded, otherwise
  // the form. The marketing landing is only for signed-out visitors.
  const user = await getUser();
  if (user) {
    const saved = await getUserProfile(user.id);
    redirect(saved.tagSlugs.length ? "/match" : "/onboarding");
  }

  return (
    <main className="home">
      <div className="home-center">
        <h1 className="home-headline">
          Find opportunities <span className="grad-text">that fit you</span>
        </h1>
        <p className="home-tagline">Companies, labs, camps &amp; programs — matched to your interests.</p>
        <Link className="get-started" href="/onboarding">
          <span>Get started</span>
          <span className="gs-arrow">→</span>
        </Link>
      </div>
    </main>
  );
}
