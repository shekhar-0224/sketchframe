import fs from "node:fs/promises";
import { get } from "@vercel/blob";
import { handle, notFound } from "@/lib/api";
import { ownProject } from "@/lib/access";
import { BLOB, absPath, contentTypeFor } from "@/lib/storage";

/**
 * Serves stored panels, sheets, voices and clips. Paths start with the project id, so
 * one ownership check covers everything; another user's files simply 404.
 */
export const GET = handle(async (req: Request, { params }: { params: Promise<{ path: string[] }> }) => {
  const { path } = await params;
  const rel = path.join("/");
  await ownProject(path[0]);

  const download = new URL(req.url).searchParams.get("download");
  const headers: Record<string, string> = {
    "Content-Type": contentTypeFor(rel),
    // Filenames are unique per write and URLs carry a version, so cache hard (privately).
    "Cache-Control": "private, max-age=31536000, immutable",
    ...(download && { "Content-Disposition": `attachment; filename="${download.replace(/[^\w.\- ]/g, "")}"` }),
  };

  if (BLOB) {
    const blob = await get(rel, { access: "private" });
    if (!blob?.stream) throw notFound();
    return new Response(blob.stream, { headers });
  }
  try {
    return new Response(new Uint8Array(await fs.readFile(absPath(rel))), { headers });
  } catch {
    throw notFound();
  }
});
