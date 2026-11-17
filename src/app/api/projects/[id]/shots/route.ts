import { NextResponse } from "next/server";
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { handle, notFound } from "@/lib/api";
import { touchProject } from "@/lib/data";
import { ownProject } from "@/lib/access";

const { shots } = schema;

const bodySchema = z.object({
  /** Insert right after this shot (defaults to the end). */
  afterShotId: z.string().optional(),
  /** Copy fields (not the image) from this shot — Storyboarder-style "duplicate then vary". */
  duplicateOf: z.string().optional(),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;
  await ownProject(projectId);
  const body = bodySchema.parse(await req.json().catch(() => ({})));
  const db = await getDb();
  const all = await db.select().from(shots).where(eq(shots.projectId, projectId)).orderBy(asc(shots.position));
  const anchorId = body.afterShotId ?? body.duplicateOf;
  const anchor = anchorId ? all.find((s) => s.id === anchorId) : all.at(-1);
  if (anchorId && !anchor) throw notFound("Shot not found");
  const source = body.duplicateOf ? anchor : undefined;
  const position = anchor ? anchor.position + 1 : 0;

  await db.update(shots).set({ position: sql`${shots.position} + 1` }).where(and(eq(shots.projectId, projectId), gt(shots.position, position - 1)));
  const row = {
    id: nanoid(),
    projectId,
    position,
    sceneId: anchor?.sceneId ?? null,
    ...(source && {
      shotSize: source.shotSize,
      cameraAngle: source.cameraAngle,
      cameraMove: source.cameraMove,
      action: source.action,
      dialogue: source.dialogue,
      speaker: source.speaker,
      notes: source.notes,
      duration: source.duration,
      characterIds: source.characterIds,
      promptExtra: source.promptExtra,
      tier: source.tier,
    }),
  };
  await db.insert(shots).values(row);
  await touchProject(projectId);
  const [created] = await db.select().from(shots).where(eq(shots.id, row.id));
  return NextResponse.json({ ...created, imageUrl: null, layoutUrl: null, takes: [] }, { status: 201 });
});
