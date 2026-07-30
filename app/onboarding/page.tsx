import Link from "next/link";
import { getTagCatalog } from "@/lib/match-data";
import OnboardingWizard from "./OnboardingWizard";

/**
 * The onboarding entry point (BUILD_PROMPT §6): a short wizard that ends by landing the student
 * straight on `/match` results. This is a server component so the interest-tag catalog is read
 * on the server (via `getTagCatalog`) and handed to the client wizard as a prop — the browser
 * never loads the whole listings/tag pipeline. Only interest tags are collected here; nothing
 * personality-related is involved in this flow (guardrail §0.1).
 */
export default function OnboardingPage() {
  const catalog = getTagCatalog();

  return (
    <main className="container">
      <Link href="/" className="back">
        ← Home
      </Link>
      <OnboardingWizard catalog={catalog} />
    </main>
  );
}
