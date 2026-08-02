"use client";

import { useState } from "react";
import { parseOpportunityApplicationPayload } from "@/lib/opportunities";

export default function OpportunityApplyForm({ slug }: { slug: string }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    age: "",
    grade: "",
    timezone: "",
    resume: "",
    availability: "",
    interests: "",
    experience: "",
    message: "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setStatus(null);

    try {
      const payload = parseOpportunityApplicationPayload({ slug, ...form });
      const res = await fetch("/api/opportunities/apply", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.message || "Could not submit your application.");
      setStatus(data.message || "Thanks! Your application note has been received.");
      setForm({
        name: "",
        email: "",
        phone: "",
        age: "",
        grade: "",
        timezone: "",
        resume: "",
        availability: "",
        interests: "",
        experience: "",
        message: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not submit your application.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 12, maxWidth: 720 }}>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Name</span>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Email</span>
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Phone</span>
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Age</span>
            <input value={form.age} onChange={(e) => setForm({ ...form, age: e.target.value })} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Grade</span>
            <input value={form.grade} onChange={(e) => setForm({ ...form, grade: e.target.value })} />
          </label>
          <label style={{ display: "grid", gap: 6 }}>
            <span>Time zone</span>
            <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })} />
          </label>
        </div>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Resume / background</span>
          <textarea rows={5} value={form.resume} onChange={(e) => setForm({ ...form, resume: e.target.value })} placeholder="Paste your resume summary, projects, coursework, or other relevant background here." />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Availability</span>
          <input value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })} placeholder="Summer, evenings, weekends, etc." />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Interests</span>
          <input value={form.interests} onChange={(e) => setForm({ ...form, interests: e.target.value })} placeholder="AI, biology, design, entrepreneurship..." />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Relevant experience</span>
          <textarea rows={4} value={form.experience} onChange={(e) => setForm({ ...form, experience: e.target.value })} placeholder="Tell us about clubs, internships, coding, research, or volunteer work." />
        </label>

        <label style={{ display: "grid", gap: 6 }}>
          <span>Why this opportunity?</span>
          <textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} required />
        </label>

        <button type="submit" className="button" disabled={submitting}>
          {submitting ? "Submitting..." : "Send application"}
        </button>
      </form>

      {status && <p style={{ margin: 0, color: "var(--accent)" }}>{status}</p>}
      {error && <p style={{ margin: 0, color: "var(--danger, #b91c1c)" }}>{error}</p>}
    </div>
  );
}
