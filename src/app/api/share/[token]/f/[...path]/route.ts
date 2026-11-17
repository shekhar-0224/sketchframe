import { contentTypeFor, readFile } from "@/lib/storage";
import { SHARED_FOLDERS, projectByShareToken } from "@/lib/share";

/**
 * Public files behind a share link: only that project's panels, depth maps, voices and
 * clips. Anything else (other projects, character sheets, layouts) is a 404.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; path: string[] }> }) {
  const { token, path } = await params;
  const project = await projectByShareToken(token);
  if (!project || path[0] !== project.id || !SHARED_FOLDERS.has(path[1]) || path.some((p) => p === ".." || p.includes("\\"))) {
    return new Response("Not found", { status: 404 });
  }
  const rel = path.join("/");
  try {
    return new Response(new Uint8Array(await readFile(rel)), {
      headers: { "Content-Type": contentTypeFor(rel), "Cache-Control": "public, max-age=86400" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
