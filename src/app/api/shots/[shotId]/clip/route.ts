import { NextResponse } from "next/server";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;
import { handle } from "@/lib/api";
import { background, isInflight } from "@/lib/pipeline/jobs";
import { animateShot, markAnimating, removeClip } from "@/lib/pipeline/clip";
import { ownShot } from "@/lib/access";

type Ctx = { params: Promise<{ shotId: string }> };

/** Opt-in AI clip (image-to-video) for one shot. Runs in the background; can take minutes. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const { shotId } = await params;
  await ownShot(shotId);
  if (!isInflight(`clip:${shotId}`)) {
    await markAnimating([shotId]);
    background(`clip ${shotId}`, () => animateShot(shotId));
  }
  return NextResponse.json({ ok: true }, { status: 202 });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const shotId = (await params).shotId;
  await ownShot(shotId);
  await removeClip(shotId);
  return NextResponse.json({ ok: true });
});
