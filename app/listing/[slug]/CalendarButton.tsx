"use client";

import { useState } from "react";
import { toICS, googleCalendarUrl } from "@/lib/ics";

/**
 * "Add to Calendar" for a listing's application deadline (BUILD_PROMPT §6/§7). Entirely
 * client-side — lib/ics.ts is pure/dependency-free, no server round-trip, no cost (§0.7).
 * Only rendered when a listing actually has a verified `deadline` (see lib/mapping.ts).
 */
export default function CalendarButton({
  title,
  deadline,
  url,
  location,
}: {
  title: string;
  /** ISO date (YYYY-MM-DD). */
  deadline: string;
  url: string | null;
  location: string | null;
}) {
  const [open, setOpen] = useState(false);

  const event = {
    title: `${title} — Application Deadline`,
    start: new Date(`${deadline}T00:00:00Z`),
    allDay: true,
    url: url ?? undefined,
    location: location ?? undefined,
  };

  function downloadICS() {
    const blob = new Blob([toICS(event)], { type: "text/calendar;charset=utf-8" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `${title.slice(0, 60).replace(/[^a-z0-9]+/gi, "-")}-deadline.ics`;
    a.click();
    URL.revokeObjectURL(href);
    setOpen(false);
  }

  if (!open) {
    return (
      <button className="button ghost" onClick={() => setOpen(true)}>
        <span className="material-symbols-outlined" aria-hidden="true" style={{ verticalAlign: "-4px" }}>
          event
        </span>{" "}
        Add deadline to calendar
      </button>
    );
  }

  return (
    <div className="report-box">
      <button className="button ghost" onClick={downloadICS}>
        Download .ics
      </button>
      <a className="button ghost" href={googleCalendarUrl(event)} target="_blank" rel="noopener noreferrer">
        Add to Google Calendar ↗
      </a>
    </div>
  );
}
