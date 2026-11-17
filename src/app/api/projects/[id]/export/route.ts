import { handle, notFound } from "@/lib/api";
import { getProjectBundle } from "@/lib/data";
import { ownProject } from "@/lib/access";
import { buildStoryboardPdf } from "@/lib/pdf/export";

export const GET = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const inline = new URL(req.url).searchParams.has("inline");
  const { id } = await params;
  await ownProject(id);
  const bundle = await getProjectBundle(id);
  if (!bundle) throw notFound("Project not found");
  const bytes = await buildStoryboardPdf(bundle);
  const name = bundle.project.title.replace(/[^\w\- ]+/g, "").trim() || "storyboard";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${name} - storyboard.pdf"`,
    },
  });
});
