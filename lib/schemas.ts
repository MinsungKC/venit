/**
 * Zod schemas for every input boundary (BUILD_PROMPT §1 "Validation: Zod on every input
 * boundary"). Pure and shared between the client forms and the API routes so validation is
 * identical on both sides. No personality fields are accepted from students here — personality
 * is derived on-device and only ever written through the guarded profile path (§0.1).
 */
import { z } from "zod";

export const LISTING_KINDS = ["program", "company", "opportunity", "camp", "research_lab"] as const;
export const COST_TYPES = ["free", "paid", "stipend", "unknown"] as const;

/** An optional URL field that also accepts the empty string (unfilled). */
const optionalUrl = z.string().url().max(500).optional().or(z.literal(""));

/**
 * Org self-registration (BUILD_PROMPT §4). A program/company/opportunity describes itself and
 * MUST pick ≥ 1 interest tag; submissions land in the moderation queue (status = pending) and
 * are never live until an admin approves. `desired_archetypes` is used only for ranking.
 */
export const registrationSchema = z.object({
  title: z.string().trim().min(2, "Give it a name").max(160),
  kind: z.enum(LISTING_KINDS),
  short_description: z.string().trim().min(10, "Add a short description").max(300),
  url: optionalUrl,
  apply_url: optionalUrl,
  linkedin_url: optionalUrl,
  location_name: z.string().trim().max(160).optional().or(z.literal("")),
  is_remote: z.boolean().default(false),
  cost_type: z.enum(COST_TYPES).default("unknown"),
  grade_min: z.number().int().min(1).max(13).nullable().optional(),
  grade_max: z.number().int().min(1).max(13).nullable().optional(),
  org_name: z.string().trim().max(160).optional().or(z.literal("")),
  contact_email: z.string().email().max(200).optional().or(z.literal("")),
  tag_slugs: z.array(z.string().min(1)).min(1, "Pick at least one interest tag").max(12),
  desired_archetypes: z.array(z.string().min(1)).max(10).optional(),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

/** Report a broken link or problem with a listing (BUILD_PROMPT §7). */
export const reportSchema = z.object({
  slug: z.string().min(1).max(120),
  reason: z.enum(["broken_link", "outdated", "inaccurate", "inappropriate", "other"]),
  detail: z.string().trim().max(500).optional().or(z.literal("")),
});

export type ReportInput = z.infer<typeof reportSchema>;

/**
 * Save a student's profile (BUILD_PROMPT §2c/§3). The personality vector is accepted here ONLY to
 * be written to the guarded, non-readable column — it is never echoed back (§0.1). `.length(384)`
 * matches the MiniLM dimension.
 */
export const profileSchema = z.object({
  grade: z.number().int().min(1).max(13).nullable().optional(),
  age: z.number().int().min(5).max(100).nullable().optional(),
  region: z.string().trim().max(120).optional().or(z.literal("")),
  tagSlugs: z.array(z.string().min(1)).max(60).default([]),
  personalityVector: z.array(z.number()).length(384).optional(),
  personalityArchetypes: z.array(z.string().min(1)).max(10).optional(),
});

export type ProfileInput = z.infer<typeof profileSchema>;
