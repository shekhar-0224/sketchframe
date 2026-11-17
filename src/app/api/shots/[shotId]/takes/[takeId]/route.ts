import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { handle, notFound } from "@/lib/api";
import { ownShot } from "@/lib/access";

type Ctx = { params: Promise<{ shotId: string; takeId: string }> };

/** Put an earlier take back on the board. The current picture stays a take, so this is undoable. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const { shotId, takeId } = await params;
  await ownShot(shotId);
  const db = await getDb();
  const [shot] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  const [take] = await db.select().from(schema.shotTakes).where(and(eq(schema.shotTakes.id, takeId), eq(schema.shotTakes.shotId, shotId)));
  if (!shot || !take) throw notFound("Take not found");
  if (shot.imageStatus === "generating") return NextResponse.json({ error: "Wait for the drawing to finish." }, { status: 409 });
  await db
    .update(schema.shots)
    .set({ imagePath: take.path, imageStatus: "ready", imageError: null, imageVersion: shot.imageVersion + 1, lastModel: take.model, updatedAt: Date.now() })
    .where(eq(schema.shots.id, shotId));
  return NextResponse.json({ ok: true });
});
