import { describe, it, expect } from "vitest";
import { toICS, googleCalendarUrl, type CalendarEvent } from "../lib/ics";

const now = new Date(Date.UTC(2026, 6, 29, 12, 0, 0)); // fixed DTSTAMP for determinism

describe("toICS", () => {
  it("emits a valid single all-day event with exclusive DTEND (next day)", () => {
    const e: CalendarEvent = {
      title: "ASSIP application deadline",
      start: new Date(Date.UTC(2026, 2, 1)),
      allDay: true,
      url: "https://example.org/apply",
    };
    const ics = toICS(e, now);
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART;VALUE=DATE:20260301");
    expect(ics).toContain("DTEND;VALUE=DATE:20260302"); // exclusive end
    expect(ics).toContain("DTSTAMP:20260729T120000Z");
    expect(ics).toContain("END:VCALENDAR");
    expect(ics.endsWith("\r\n")).toBe(true);
  });

  it("defaults a timed event to a one-hour block", () => {
    const ics = toICS({ title: "Info session", start: new Date(Date.UTC(2026, 2, 1, 15, 0, 0)) }, now);
    expect(ics).toContain("DTSTART:20260301T150000Z");
    expect(ics).toContain("DTEND:20260301T160000Z");
  });

  it("escapes commas, semicolons, and newlines in text fields", () => {
    const ics = toICS(
      { title: "Camp: robotics, AI; more", start: new Date(Date.UTC(2026, 2, 1)), allDay: true },
      now,
    );
    expect(ics).toContain("SUMMARY:Camp: robotics\\, AI\\; more");
  });
});

describe("googleCalendarUrl", () => {
  it("builds an all-day TEMPLATE link with an exclusive end date", () => {
    const url = googleCalendarUrl({
      title: "SIMR deadline",
      start: new Date(Date.UTC(2026, 1, 20)),
      allDay: true,
    });
    expect(url).toContain("https://calendar.google.com/calendar/render?");
    expect(url).toContain("action=TEMPLATE");
    expect(url).toContain("dates=20260220%2F20260221");
    expect(url).toContain("text=SIMR+deadline");
  });
});
