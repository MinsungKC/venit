"use client";

import { useState } from "react";
import type { ReportInput } from "@/lib/schemas";

/** Report a problem with a listing (BUILD_PROMPT §7). Posts to /api/report. */
const REASONS: { value: ReportInput["reason"]; label: string }[] = [
  { value: "broken_link", label: "Broken link" },
  { value: "outdated", label: "Outdated / no longer running" },
  { value: "inaccurate", label: "Inaccurate info" },
  { value: "inappropriate", label: "Inappropriate" },
  { value: "other", label: "Something else" },
];

export default function ReportButton({ slug }: { slug: string }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportInput["reason"]>("broken_link");
  const [detail, setDetail] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, reason, detail }),
      });
      if (res.ok) setDone(true);
    } finally {
      setBusy(false);
    }
  }

  if (done) return <span className="report-done">Thanks — we&apos;ll take a look.</span>;

  if (!open) {
    return (
      <button className="report-link" onClick={() => setOpen(true)}>
        Report a problem
      </button>
    );
  }

  return (
    <div className="report-box">
      <select value={reason} onChange={(e) => setReason(e.target.value as ReportInput["reason"])}>
        {REASONS.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      <input
        placeholder="Optional details"
        value={detail}
        onChange={(e) => setDetail(e.target.value)}
        maxLength={500}
      />
      <button className="button ghost" onClick={submit} disabled={busy}>
        {busy ? "Sending…" : "Send report"}
      </button>
    </div>
  );
}
