import path from "path";
import { NextResponse } from "next/server";
import { Templates } from "@prisma/client";

import { db } from "@/lib/db";
import { templatePaths } from "@/lib/template";
import { scanTemplateDirectory } from "@/modules/playground/lib/path-to-json";

interface SeedResult {
  status: "seeded" | "failed";
  error?: string;
}

// Seeds the StarterTemplate bucket collection by parsing each starter folder
// in vibecode-starters into JSON and upserting it keyed by template enum.
// Run once from a dev machine (the folders don't exist on deployed hosts).
// To seed a production database, point DATABASE_URL at it and run locally.
export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      {
        error:
          "Seeding is disabled in production. Run this locally with DATABASE_URL pointed at the target database.",
      },
      { status: 403 },
    );
  }

  const results: Record<string, SeedResult> = {};

  for (const [template, templatePath] of Object.entries(templatePaths)) {
    try {
      const inputPath = path.join(process.cwd(), templatePath);
      const structure = await scanTemplateDirectory(inputPath);
      const content = JSON.stringify(structure);

      await db.starterTemplate.upsert({
        where: { template: template as Templates },
        update: { content },
        create: { template: template as Templates, content },
      });

      results[template] = { status: "seeded" };
    } catch (error) {
      console.error(`Failed to seed template ${template}:`, error);
      results[template] = {
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  const hasFailures = Object.values(results).some(
    (r) => r.status === "failed",
  );

  return NextResponse.json(
    { success: !hasFailures, results },
    { status: hasFailures ? 500 : 200 },
  );
}
