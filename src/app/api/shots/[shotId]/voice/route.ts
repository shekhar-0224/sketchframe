import { NextResponse } from "next/server";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;
import { handle } from "@/lib/api";
import { background } from "@/lib/pipeline/jobs";
import { markVoicing, voiceShot } from "@/lib/pipeline/voice";
import { ownShot } from "@/lib/access";

export const POST = handle(async (_req: Request, { params }: { params: Promise<{ shotId: string }> }) => {
  const { shotId } = await params;
  await ownShot(shotId);
  await markVoicing([shotId]);
  background(`voice ${shotId}`, () => voiceShot(shotId));
  return NextResponse.json({ ok: true }, { status: 202 });
});
