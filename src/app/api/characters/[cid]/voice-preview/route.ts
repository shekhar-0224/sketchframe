import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { previewVoice } from "@/lib/pipeline/voice";
import { ownCharacter } from "@/lib/access";

/** A short sample in the character's voice (not stored). 204 when voices are browser-only. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ cid: string }> }) => {
  const cid = (await params).cid;
  await ownCharacter(cid);
  const out = await previewVoice(cid);
  if (!out) return new NextResponse(null, { status: 204 });
  return new Response(new Uint8Array(out.wav), { headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" } });
});
