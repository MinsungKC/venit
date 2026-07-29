/**
 * Client-side PII scrub (BUILD_PROMPT §3, guardrail §0.3). Runs in the browser before a
 * resume ever meets the embedding model: raw text/files never leave the device — only the
 * scrubbed text is embedded, and only derived tag IDs are uploaded (§0.2).
 *
 * Regex-based and dependency-free so it runs anywhere. Best-effort by design: the goal is to
 * strip the obvious direct identifiers and *show the user what was removed* so they can catch
 * anything the patterns miss, not to be a bulletproof de-identifier.
 */

/** A single redaction: what kind of identifier was removed and its original value. */
export interface StrippedPII {
  kind: string;
  value: string;
}

export interface ScrubResult {
  cleaned: string;
  stripped: StrippedPII[];
}

/** Placeholder token substituted for each removed value, tagged by kind. */
function redaction(kind: string): string {
  return `[REDACTED_${kind.toUpperCase()}]`;
}

/**
 * Ordered detectors. Order matters: emails are matched before phones/SSNs so their digits
 * aren't mistaken for a phone number, and street addresses last (the loosest pattern).
 */
const DETECTORS: { kind: string; pattern: RegExp }[] = [
  // Emails: local@domain.tld.
  { kind: "email", pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g },
  // US SSN: 3-2-4 digits with optional dashes/spaces (matched before phones).
  { kind: "ssn", pattern: /\b\d{3}[-\s]\d{2}[-\s]\d{4}\b/g },
  // Phone numbers: optional country/area code, 7-10 digits with common separators.
  {
    kind: "phone",
    pattern: /(?:\+?\d{1,2}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}\b/g,
  },
  // Street addresses (best-effort): "<number> <name...> <suffix>[, unit]".
  {
    kind: "address",
    pattern:
      /\b\d{1,6}\s+(?:[A-Za-z0-9.'-]+\s+){0,4}(?:Street|St|Avenue|Ave|Boulevard|Blvd|Road|Rd|Lane|Ln|Drive|Dr|Court|Ct|Place|Pl|Way|Terrace|Ter|Circle|Cir|Highway|Hwy)\b\.?(?:\s*(?:Apt|Apartment|Suite|Ste|Unit|#)\s*[A-Za-z0-9-]+)?/gi,
  },
];

/**
 * Redact direct identifiers from `text`, returning the cleaned text plus a list of what was
 * removed (so the UI can surface it per §0.3). Each match becomes a `[REDACTED_<KIND>]` token.
 */
export function scrubPII(text: string): ScrubResult {
  const stripped: StrippedPII[] = [];
  let cleaned = text;

  for (const { kind, pattern } of DETECTORS) {
    cleaned = cleaned.replace(pattern, (match) => {
      stripped.push({ kind, value: match });
      return redaction(kind);
    });
  }

  return { cleaned, stripped };
}
