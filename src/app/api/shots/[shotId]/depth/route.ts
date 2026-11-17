import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { HttpError, fileFromForm, handle, notFound } from "@/lib/api";
import { fileUrl, removeFile, saveImage } from "@/lib/storage";
import { ownShot } from "@/lib/access";

/**
 * Stores a depth map computed in the browser (see lib/movie/depth-client.ts). Doing the
 * inference client-side keeps the ~26 MB model and ONNX runtime out of the server bundle.
 * `version` is the panel's imageVersion the depth was computed from; stale uploads are rejected.
 */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ shotId: string }> }) => {
  const { shotId } = await params;
  await ownShot(shotId);
  const { file, form } = await fileFromForm(req);
  const version = Number(form.get("version"));
  const db = await getDb();
  const [shot] = await db.select().from(schema.shots).where(eq(schema.shots.id, shotId));
  if (!shot) throw notFound("Shot not found");
  if (version !== shot.imageVersion) throw new HttpError(409, "The panel changed — depth is out of date");

  const depthPath = await saveImage(shot.projectId, "depth", Buffer.from(await file.arrayBuffer()), { maxSize: 768 });
  await removeFile(shot.depthPath);
  await db.update(schema.shots).set({ depthPath, depthVersion: version }).where(eq(schema.shots.id, shotId));
  return NextResponse.json({ depthUrl: fileUrl(depthPath, version) });
});
