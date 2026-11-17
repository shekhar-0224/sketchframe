import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { handle } from "@/lib/api";
import { ownProject } from "@/lib/access";

const bodySchema = z.object({
  ids: z.array(z.string()).min(1),
  /** When a shot is dropped next to another scene's shots, it joins that scene. */
  sceneChanges: z.record(z.string(), z.string().nullable()).optional(),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;
  await ownProject(projectId);
  const { ids, sceneChanges } = bodySchema.parse(await req.json());
  const db = await getDb();
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      await tx
        .update(schema.shots)
        .set({ position: i, ...(sceneChanges && id in sceneChanges && { sceneId: sceneChanges[id] }) })
        .where(and(eq(schema.shots.id, id), eq(schema.shots.projectId, projectId)));
    }
  });
  return NextResponse.json({ ok: true });
});
