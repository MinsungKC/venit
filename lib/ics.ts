/**
 * Calendar export (BUILD_PROMPT §6/§7): turn a listing deadline into a downloadable `.ics` file
 * and an "Add to Google Calendar" link, generated entirely client-side (no server, no cost).
 *
 * Pure and dependency-free. Deadlines are usually date-only (all-day); timed events are also
 * supported. Text is escaped per RFC 5545.
 */

export interface CalendarEvent {
  title: string;
  /** Event start. For an all-day deadline, only the date part is used. */
  start: Date;
  /** Optional end; defaults to a 1-hour block (timed) or the same day (all-day). */
  end?: Date;
  description?: string;
  url?: string;
  location?: string;
  /** All-day event (VALUE=DATE). Deadlines are typically all-day. */
  allDay?: boolean;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** UTC timestamp form: 20260729T140000Z. */
function formatUTC(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/** Date-only form: 20260729 (uses UTC calendar date). */
function formatDate(d: Date): string {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}`;
}

/** Escape a value for an iCalendar text field (RFC 5545 §3.3.11). */
function escapeText(v: string): string {
  return v
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** The day after `d` (UTC), used as the exclusive DTEND for an all-day event. */
function nextDay(d: Date): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + 1);
  return n;
}

/** A stable-ish UID for the event (host + start), so re-imports update rather than duplicate. */
function uid(e: CalendarEvent): string {
  const slug = e.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${formatDate(e.start)}-${slug || "event"}@venit`;
}

/** Serialize an event to a single-event `.ics` document (with CRLF line endings per spec). */
export function toICS(e: CalendarEvent, now: Date = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//venit//EN",
    "BEGIN:VEVENT",
    `UID:${uid(e)}`,
    `DTSTAMP:${formatUTC(now)}`,
  ];

  if (e.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${formatDate(e.start)}`);
    lines.push(`DTEND;VALUE=DATE:${formatDate(nextDay(e.end ?? e.start))}`);
  } else {
    const end = e.end ?? new Date(e.start.getTime() + 60 * 60 * 1000);
    lines.push(`DTSTART:${formatUTC(e.start)}`);
    lines.push(`DTEND:${formatUTC(end)}`);
  }

  lines.push(`SUMMARY:${escapeText(e.title)}`);
  const desc = [e.description, e.url].filter(Boolean).join("\n");
  if (desc) lines.push(`DESCRIPTION:${escapeText(desc)}`);
  if (e.url) lines.push(`URL:${escapeText(e.url)}`);
  if (e.location) lines.push(`LOCATION:${escapeText(e.location)}`);

  lines.push("END:VEVENT", "END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}

/** An "Add to Google Calendar" URL for the event. */
export function googleCalendarUrl(e: CalendarEvent): string {
  const dates = e.allDay
    ? `${formatDate(e.start)}/${formatDate(nextDay(e.end ?? e.start))}`
    : `${formatUTC(e.start)}/${formatUTC(e.end ?? new Date(e.start.getTime() + 60 * 60 * 1000))}`;

  const params = new URLSearchParams({ action: "TEMPLATE", text: e.title, dates });
  const details = [e.description, e.url].filter(Boolean).join("\n");
  if (details) params.set("details", details);
  if (e.location) params.set("location", e.location);
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
