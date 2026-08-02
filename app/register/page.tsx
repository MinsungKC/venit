import Link from "next/link";
import { getArchetypes, getTagCatalog } from "@/lib/match-data";
import RegisterForm from "./RegisterForm";

export const dynamic = "force-dynamic";

/** Public org self-registration (BUILD_PROMPT §4). Submissions land in the moderation queue. */
export default function RegisterPage() {
  const catalog = getTagCatalog();
  const archetypes = getArchetypes();

  return (
    <main className="container">
      <Link href="/" className="back">
        ← venit
      </Link>
      <h1>List your program or company</h1>
      <p className="lede">
        Add a program, company, camp, opportunity, or research lab. Submissions are reviewed before
        they go live. You must choose at least one interest tag so students can find you.
      </p>
      <RegisterForm catalog={catalog} archetypes={archetypes} />
    </main>
  );
}
