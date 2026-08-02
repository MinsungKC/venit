import { NextResponse } from "next/server";
import { parseOpportunityApplicationPayload } from "@/lib/opportunities";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = parseOpportunityApplicationPayload(body);

    // This is a lightweight, no-DB submission flow for local development.
    // In production, you could forward this to an email service or save it to a table.
    console.info("Opportunity application submitted", {
      slug: payload.slug,
      name: payload.name,
      email: payload.email,
      phone: payload.phone,
      age: payload.age,
      grade: payload.grade,
      timezone: payload.timezone,
      resume: payload.resume,
      availability: payload.availability,
      interests: payload.interests,
      experience: payload.experience,
      message: payload.message,
    });

    return NextResponse.json({
      ok: true,
      message: "Thanks! Your application note has been received.",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, message: error instanceof Error ? error.message : "Unable to submit your application." },
      { status: 400 },
    );
  }
}
