import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { handle, notFound } from "@/lib/api";
import { removeFile } from "@/lib/storage";
import { touchProject } from "@/lib/data";
import { ownShot } from "@/lib/access";
import { removeTakeFiles } from "@/lib/takes";

type Ctx = { params: Promise<{ shotId: string }> };

const patchSchema = z
  .object({
    shotSize: z.string().max(60),
    cameraAngle: z.string().max(60),
    cameraMove: z.string().max(60),
    action: z.string().max(4000),
    dialogue: z.string().max(4000),
    speaker: z.string().max(120),
    notes: z.string().max(4000),
    promptExtra: z.string().max(4000),
    duration: z.number().min(0.25).max(60),
    characterIds: z.array(z.string()).max(12),
    sceneId: z.string().nullable(),
    tier: z.enum(["auto", "cast", "filler"]),
    /** null = auto-detect from the script. */
    effects: z.array(z.string().max(20)).max(10).nullable(),
  })
  .partial();

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { shotId } = await params;
  await ownShot(shotId);
  const body = patchSchema.parse(await req.json());
  const db = await getDb();
  const [shot] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  if (!shot) throw notFound("Shot not found");
  // updatedAt deliberately untouched while generating, so stale-job recovery keeps working.
  const lineChanged =
    (body.dialogue !== undefined && body.dialogue !== shot.dialogue) || (body.speaker !== undefined && body.speaker !== shot.speaker);
  await db
    .update(schema.shots)
    .set({ ...body, ...(lineChanged && shot.audioPath && { audioStatus: "stale" }) })
    .where(eq(schema.shots.id, shotId));
  await touchProject(shot.projectId);
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { shotId } = await params;
  await ownShot(shotId);
  const db = await getDb();
  const [shot] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  if (!shot) return NextResponse.json({ ok: true });
  await removeTakeFiles(shotId, [shot.imagePath, shot.layoutPath]);
  await db.delete(schema.shots).where(eq(schema.shots.id, shotId));
  await removeFile(shot.imagePath);
  await removeFile(shot.audioPath);
  await removeFile(shot.clipPath);
  if (shot.layoutPath !== shot.imagePath) await removeFile(shot.layoutPath);
  await touchProject(shot.projectId);
  return NextResponse.json({ ok: true });
});
