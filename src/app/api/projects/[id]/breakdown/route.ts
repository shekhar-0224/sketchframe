import { NextResponse } from "next/server";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { HttpError, handle, notFound } from "@/lib/api";
import { runBreakdown } from "@/lib/pipeline/breakdown";
import { background } from "@/lib/pipeline/jobs";
import { ownProject } from "@/lib/access";

/** Re-run script → shot list. Runs in the background; the client polls the project. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await ownProject(id);
  const db = await getDb();
  const [p] = await db.select().from(schema.projects).where(eq(schema.projects.id, id));
  if (!p) throw notFound("Project not found");
  if (p.status === "breaking_down") throw new HttpError(409, "A breakdown is already running");
  if (!p.scriptText.trim()) throw new HttpError(400, "Add a script or idea first");
  await db.update(schema.projects).set({ status: "breaking_down", statusError: null, updatedAt: Date.now() }).where(eq(schema.projects.id, id));
  background(`breakdown ${id}`, () => runBreakdown(id));
  return NextResponse.json({ ok: true }, { status: 202 });
});
