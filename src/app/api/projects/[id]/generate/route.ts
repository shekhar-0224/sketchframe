import { NextResponse } from "next/server";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { handle } from "@/lib/api";
import { background } from "@/lib/pipeline/jobs";
import { generatePanel, markGenerating } from "@/lib/pipeline/panel";
import { ownProject } from "@/lib/access";
import { imageProviderId } from "@/lib/ai/registry";
import { hasCloudflare } from "@/lib/ai/providers/cloudflare";

/** Free pictures go out one per ~45 s; a batch must finish inside one 5-minute background run. */
const FREE_BATCH = 4;

const bodySchema = z.object({
  shotIds: z.array(z.string()).optional(),
  /** Also redraw panels that already have an image. */
  force: z.boolean().default(false),
});

/** Batch generation: queues panels (default: every shot without a finished image). */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;
  await ownProject(projectId);
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  const db = await getDb();
  const rows = await db
    .select()
    .from(schema.shots)
    .where(
      and(eq(schema.shots.projectId, projectId), body.shotIds ? inArray(schema.shots.id, body.shotIds) : undefined),
    )
    .orderBy(schema.shots.position);
  const all = rows.filter((s) => s.imageStatus !== "generating" && (body.force || s.imageStatus !== "ready"));
  const targets = imageProviderId() === "free" && !hasCloudflare() ? all.slice(0, FREE_BATCH) : all;
  await markGenerating(targets.map((s) => s.id));
  for (const s of targets) background(`panel ${s.id}`, () => generatePanel(s.id));
  return NextResponse.json({ queued: targets.map((s) => s.id), remaining: all.length - targets.length }, { status: 202 });
});
