import { NextResponse } from "next/server";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fileFromForm, handle, notFound } from "@/lib/api";
import { fileUrl, removeFile, saveImage } from "@/lib/storage";
import { background } from "@/lib/pipeline/jobs";
import { generatePanel, markGenerating } from "@/lib/pipeline/panel";
import { ownShot } from "@/lib/access";

type Ctx = { params: Promise<{ shotId: string }> };

/**
 * Sketch-to-image: store a rough sketch as the shot's layout guide and immediately
 * redraw the panel from it (with character sheets still attached).
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { shotId } = await params;
  await ownShot(shotId);
  const { file, form } = await fileFromForm(req);
  const db = await getDb();
  const [shot] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  if (!shot) throw notFound("Shot not found");

  const layoutPath = await saveImage(shot.projectId, "layouts", Buffer.from(await file.arrayBuffer()), { maxSize: 1600 });
  if (shot.layoutPath && shot.layoutPath !== shot.imagePath) await removeFile(shot.layoutPath);
  const updatedAt = Date.now();
  await db.update(schema.shots).set({ layoutPath, updatedAt }).where(eq(schema.shots.id, shotId));

  if (form.get("generate") !== "false") {
    await markGenerating([shotId]);
    background(`panel ${shotId}`, () => generatePanel(shotId));
  }
  return NextResponse.json({ layoutUrl: fileUrl(layoutPath, updatedAt) }, { status: 202 });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { shotId } = await params;
  await ownShot(shotId);
  const db = await getDb();
  const [shot] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  if (!shot) throw notFound("Shot not found");
  if (shot.layoutPath !== shot.imagePath) await removeFile(shot.layoutPath);
  await db.update(schema.shots).set({ layoutPath: null }).where(eq(schema.shots.id, shotId));
  return NextResponse.json({ ok: true });
});
