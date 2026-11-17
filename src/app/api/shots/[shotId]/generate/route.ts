import { NextResponse } from "next/server";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;
import { handle } from "@/lib/api";
import { background, isInflight } from "@/lib/pipeline/jobs";
import { generatePanel, markGenerating } from "@/lib/pipeline/panel";
import { ownShot } from "@/lib/access";
import { z } from "zod";

const bodySchema = z.object({ versions: z.number().int().min(1).max(3).default(1) });

/**
 * Single-panel (re)generation: flips status synchronously, draws in the background.
 * `versions` > 1 draws several in a row; each is kept as a take to pick from.
 */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ shotId: string }> }) => {
  const { shotId } = await params;
  await ownShot(shotId);
  const { versions } = bodySchema.parse(await req.json().catch(() => ({})));
  if (!isInflight(`panel:${shotId}`)) {
    await markGenerating([shotId]);
    background(`panel ${shotId}`, async () => {
      for (let i = 0; i < versions; i++) await generatePanel(shotId, { more: i < versions - 1 });
    });
  }
  return NextResponse.json({ ok: true }, { status: 202 });
});
