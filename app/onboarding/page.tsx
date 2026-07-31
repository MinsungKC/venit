import Link from "next/link";
import { getTagCatalog } from "@/lib/match-data";
import OnboardingWizard from "./OnboardingWizard";
import OnboardingGlobe from "./OnboardingGlobe";
import styles from "./onboarding.module.css";

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
export default function OnboardingPage() {
  const catalog = getTagCatalog();

  return (
    <>
      <OnboardingGlobe />
      <main className={styles.page}>
        <Link href="/" className={styles.homeLink}>
          ← Home
        </Link>
        <div className={styles.card}>
          <OnboardingWizard catalog={catalog} />
        </div>
      </main>
    </>
  );
}
