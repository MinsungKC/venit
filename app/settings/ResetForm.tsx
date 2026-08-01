"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** Clears the saved profile server-side + the local draft, then reopens onboarding. */
export default function ResetForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function reset() {
    if (!window.confirm("Reset your form? This clears your saved interests and answers so you can start over.")) {
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/profile/reset", { method: "POST" });
      if (!res.ok) throw new Error();
      try {
        localStorage.removeItem("oppmatch:onboarding"); // drop the on-device draft too
      } catch {
        /* ignore */
      }
      router.push("/onboarding?edit=1");
    } catch {
      setErr("Couldn't reset — please try again.");
      setBusy(false);
    }
  }

  return (
    <div>
      <button className="button" onClick={reset} disabled={busy}>
        {busy ? "Resetting…" : "Reset my form"}
      </button>
      {err && <p style={{ color: "crimson", marginTop: 8 }}>{err}</p>}
    </div>
  );
}
