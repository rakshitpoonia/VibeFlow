import { db } from "@/lib/db";
import { NextRequest } from "next/server";

// uses playground id to get template type and then returns the template JSON
// from the StarterTemplate bucket collection (seeded via POST /api/template/seed).
// Fallback for playgrounds that have no TemplateFile row yet — new playgrounds
// get their template copied into their account at creation time.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  if (!id) {
    return Response.json({ error: "Missing playground ID" }, { status: 400 });
  }

  const playground = await db.playground.findUnique({
    where: { id },
  });

  if (!playground) {
    return Response.json({ error: "Playground not found" }, { status: 404 });
  }

  const starterTemplate = await db.starterTemplate.findUnique({
    where: { template: playground.template },
  });

  if (!starterTemplate) {
    return Response.json(
      {
        error: `Template ${playground.template} is not seeded in the database. Run POST /api/template/seed from a dev machine first.`,
      },
      { status: 404 },
    );
  }

  try {
    const templateJson = JSON.parse(starterTemplate.content);

    return Response.json(
      { success: true, templateJson },
      { status: 200 },
    );
  } catch (error) {
    console.error("Error parsing stored template JSON:", error);
    return Response.json(
      { error: "Stored template data is corrupted" },
      { status: 500 },
    );
  }
}
