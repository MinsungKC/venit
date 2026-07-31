"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

/** Emails a magic link via Supabase Auth (signInWithOtp). No password. */
export default function LoginForm({ next }: { next?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const supabase = createClient();
    // Carry the post-login destination through the magic link → /auth/callback reads `next`.
    const callback = new URL("/auth/callback", window.location.origin);
    if (next) callback.searchParams.set("next", next);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: callback.toString() },
    });
    if (error) {
      setStatus("error");
      setMessage(error.message);
    } else {
      setStatus("sent");
    }
  }

  if (status === "sent") {
    return (
      <div className="auth-sent">
        <h2>Check your email ✉️</h2>
        <p>We sent a magic link to {email}. Click it to finish signing in.</p>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={submit}>
      <input
        type="email"
        required
        placeholder="you@school.edu"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        aria-label="Email address"
      />
      <button className="button" type="submit" disabled={status === "sending"}>
        {status === "sending" ? "Sending…" : "Email me a link"}
      </button>
      {status === "error" && <p className="auth-error">{message}</p>}
    </form>
  );
}
