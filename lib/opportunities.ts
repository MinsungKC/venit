import { z } from "zod";

const opportunityApplicationSchema = z.object({
  slug: z.string().trim().min(1, "Please select an opportunity."),
  name: z.string().trim().min(1, "Please share your name."),
  email: z.string().trim().email("Please enter a valid email address."),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  age: z.string().trim().max(40).optional().or(z.literal("")),
  grade: z.string().trim().max(80).optional().or(z.literal("")),
  timezone: z.string().trim().max(80).optional().or(z.literal("")),
  resume: z.string().trim().max(12000).optional().or(z.literal("")),
  availability: z.string().trim().max(400).optional().or(z.literal("")),
  interests: z.string().trim().max(600).optional().or(z.literal("")),
  experience: z.string().trim().max(1200).optional().or(z.literal("")),
  message: z.string().trim().min(1, "Please share a short note."),
});

export type OpportunityApplicationPayload = z.infer<typeof opportunityApplicationSchema>;

export function parseOpportunityApplicationPayload(input: unknown): OpportunityApplicationPayload {
  return opportunityApplicationSchema.parse(input);
}
