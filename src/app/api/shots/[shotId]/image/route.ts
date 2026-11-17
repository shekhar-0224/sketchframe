import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { fileFromForm, handle, notFound } from "@/lib/api";
import { dataUrlToBuffer, fileUrl, removeFile, saveImage } from "@/lib/storage";
import { ownShot } from "@/lib/access";
import { keepAsTake, recordTake } from "@/lib/takes";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;

type Ctx = { params: Promise<{ shotId: string }> };

const editSchema = z.object({
  dataUrl: z.string().startsWith("data:image/"),
  /** Also use the edited panel as the composition guide for future regenerations. */
  useAsLayout: z.boolean().default(false),
});

/**
 * Replace a panel's image: multipart upload ("replace image") or a JSON data URL
 * from the panel editor.
 */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { shotId } = await params;
  await ownShot(shotId);
  const db = await getDb();
  const [shot] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  if (!shot) throw notFound("Shot not found");

  let buf: Buffer;
  let useAsLayout = false;
  if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
    buf = Buffer.from(await (await fileFromForm(req)).file.arrayBuffer());
  } else {
    const body = editSchema.parse(await req.json());
    buf = dataUrlToBuffer(body.dataUrl);
    useAsLayout = body.useAsLayout;
  }

  const imagePath = await saveImage(shot.projectId, "panels", buf, { maxSize: 1600 });
  // Layout gets its own copy so regenerating (which replaces imagePath) never deletes it.
  const layoutPath = useAsLayout ? await saveImage(shot.projectId, "layouts", buf, { maxSize: 1600 }) : shot.layoutPath;
  await recordTake(shot, imagePath, "you");
  if (useAsLayout && shot.layoutPath) await removeFile(shot.layoutPath);

  const version = shot.imageVersion + 1;
  const updatedAt = Date.now();
  await db
    .update(schema.shots)
    .set({ imagePath, layoutPath, imageStatus: "ready", imageError: null, imageVersion: version, lastModel: "you", updatedAt })
    .where(eq(schema.shots.id, shotId));
  return NextResponse.json({
    imageUrl: fileUrl(imagePath, version),
    layoutUrl: fileUrl(layoutPath, updatedAt),
    imageVersion: version,
  });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { shotId } = await params;
  await ownShot(shotId);
  const db = await getDb();
  const [shot] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  if (!shot) throw notFound("Shot not found");
  // Cleared, not deleted: the picture stays as a take.
  await keepAsTake(shot);
  await db
    .update(schema.shots)
    .set({ imagePath: null, imageStatus: "empty", imageError: null, imageVersion: shot.imageVersion + 1 })
    .where(eq(schema.shots.id, shotId));
  return NextResponse.json({ ok: true });
});
