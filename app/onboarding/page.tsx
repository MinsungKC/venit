import Link from "next/link";
import { redirect } from "next/navigation";
import { getTagCatalog } from "@/lib/match-data";
import { getUserProfile } from "@/lib/profile";
import { getUser } from "@/lib/supabase/server";
import OnboardingWizard from "./OnboardingWizard";
import OnboardingGlobe from "./OnboardingGlobe";
import styles from "./onboarding.module.css";

export const dynamic = "force-dynamic";

/**
 * The onboarding entry point (BUILD_PROMPT §6): a short wizard that ends by landing the student
 * straight on `/match` results. This is a server component so the interest-tag catalog is read
 * on the server (via `getTagCatalog`) and handed to the client wizard as a prop — the browser
 * never loads the whole listings/tag pipeline. Only interest tags are collected here; nothing
 * personality-related is involved in this flow (guardrail §0.1).
 *
 * Presentation: a glass "Let's build your profile" card floating over a slowly-spinning world-MAP
 * globe (OnboardingGlobe) on a white background, with red GeoGuessr-style pins that pop in.
 */
export default async function OnboardingPage({
  searchParams,
}: {
  searchParams: { edit?: string };
}) {
  // Once the form is done, don't make the student redo it — send them straight to their matches.
  // `?edit=1` (from "Edit interests") bypasses this so they can deliberately tweak their answers.
  if (searchParams.edit !== "1") {
    const user = await getUser();
    if (user) {
      const saved = await getUserProfile(user.id);
      if (saved.tagSlugs.length) redirect("/match");
    }
  }

  const catalog = getTagCatalog();

  return (
    <>
      <OnboardingGlobe />
      <main className={styles.page}>
        <Link href="/" className={styles.homeLink}>
          ← Home
        </Link>
        <OnboardingWizard catalog={catalog} />
      </main>
    </>
  );
}
