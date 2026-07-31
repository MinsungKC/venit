/**
 * Pure text helpers for turning raw ATS job descriptions into the fields we store — no network,
 * no side effects, so they're unit-testable and shared by scripts/generate-ats-jobs.ts. Kept
 * separate from the fetcher (which has a top-level run) so importing these never triggers a fetch.
 */

/** Titles relevant to high-school / early-career students. */
export const STUDENT_ROLE =
  /\b(intern|internship|co-?op|apprentice(?:ship)?|early[\s-]?career|new[\s-]?grad|university\s+grad|trainee|fellow(?:ship)?|high[\s-]?school|summer\s+(?:analyst|associate|scholar))\b/i;
/** Senior roles that sometimes contain a relevant word ("Intern Manager") — exclude. */
export const SENIOR_ROLE =
  /\b(senior|staff|principal|lead|manager|director|head of|vp|vice president)\b/i;

/** Whether a job title is student / early-career relevant (and not actually a senior role). */
export function isStudentRole(title: string): boolean {
  return STUDENT_ROLE.test(title) && !SENIOR_ROLE.test(title);
}

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&#39;": "'", "&rsquo;": "'",
  "&apos;": "'", "&quot;": '"', "&ldquo;": '"', "&rdquo;": '"', "&mdash;": "—", "&ndash;": "–",
};

/** Decode common HTML entities, strip tags, collapse whitespace → readable plain text. */
export function htmlToText(html: string): string {
  let s = html;
  // Two passes: Greenhouse double-encodes ("&amp;nbsp;"), so one pass leaves "&nbsp;" behind.
  for (let pass = 0; pass < 2; pass++) {
    for (const [k, v] of Object.entries(ENTITIES)) s = s.split(k).join(v);
    s = s.replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
  }
  s = s.replace(/<\/(p|div|li|br|h\d)>/gi, " ").replace(/<[^>]+>/g, " ");
  return s.replace(/\s+/g, " ").trim();
}

const QUAL_HEADING =
  /(minimum qualifications|basic qualifications|preferred qualifications|requirements|qualifications|what you.?ll (?:need|bring)|who you are|you (?:have|bring|will need))/i;

/** Trim to <= max chars on a word boundary (mirrors mapping.truncate, kept local to stay pure). */
function clip(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const slice = clean.slice(0, max);
  const cut = slice.lastIndexOf(" ");
  return (cut > max * 0.6 ? slice.slice(0, cut) : slice).trimEnd() + "…";
}

/** Pull a short qualifications/requirements snippet from a job description. */
export function extractQualifications(text: string): string | null {
  if (!text) return null;
  const idx = text.search(QUAL_HEADING);
  const src = idx >= 0 ? text.slice(idx) : text;
  const snippet = clip(src, 480);
  return snippet || null;
}

/** Parse an explicit minimum age (only when stated and plausible, 14–21). */
export function extractAgeMin(text: string): number | null {
  if (!text) return null;
  const patterns = [
    /\b(?:must be|be)\s+(?:at least\s+)?(\d{2})\s+years?\s+(?:of age|old)/i,
    /\b(?:at least|minimum age of|minimum age)\s+(\d{2})\b/i,
    /\b(\d{2})\s+years?\s+of age or older\b/i,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const n = Number(m[1]);
      if (n >= 14 && n <= 21) return n;
    }
  }
  return null;
}
