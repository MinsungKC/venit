import Link from "next/link";
import { redirect } from "next/navigation";
import { getTagCatalog } from "@/lib/match-data";
import { getUserProfile } from "@/lib/profile";
import { getUser } from "@/lib/supabase/server";
import ResetForm from "./ResetForm";

export const dynamic = "force-dynamic";

/**
 * Student settings. Shows the search saved on their account (so they can see it persists) and lets
 * them edit or reset the form. GUARDRAIL §0.2: the resume is never stored, so there's nothing about
 * it to display or remove here — only its derived interests live on the profile.
 */
export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/login?next=/settings");

  const saved = await getUserProfile(user.id);
  const catalog = getTagCatalog();
  const label = new Map<string, string>();
  for (const g of catalog) for (const t of g.tags) label.set(t.slug, t.label);
  const interests = saved.tagSlugs.map((s) => label.get(s) ?? s);

  return (
    <main className="container">
      <h1>Settings</h1>

      <section style={{ marginTop: 20 }}>
        <h2>Your form</h2>
        {saved.tagSlugs.length ? (
          <>
            <p className="lede">Saved to your account — you won&apos;t have to fill it out again.</p>
            <p>
              <b>Interests:</b> {interests.join(", ") || "—"}
            </p>
            <p>
              <b>Grade:</b> {saved.grade ?? "—"} &nbsp;&nbsp; <b>Age:</b> {saved.age ?? "—"}
            </p>
            <p style={{ marginTop: 14 }}>
              <Link className="button" href="/onboarding?edit=1">
                Edit interests
              </Link>
            </p>
          </>
        ) : (
          <p className="lede">
            You haven&apos;t completed the form yet. <Link href="/onboarding">Start now →</Link>
          </p>
        )}
      </section>

      <section style={{ marginTop: 32 }}>
        <h2>Reset</h2>
        <p className="lede">
          Clear your saved answers and start the form over. Your resume is never stored, so there&apos;s
          nothing else to remove.
        </p>
        <ResetForm />
      </section>
    </main>
  );
}
