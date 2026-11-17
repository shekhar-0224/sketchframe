import { NextResponse } from "next/server";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { handle } from "@/lib/api";
import { getSpeechProvider } from "@/lib/ai/registry";
import { background } from "@/lib/pipeline/jobs";
import { assignVoices, markVoicing, staleVoiceShots, voiceShot } from "@/lib/pipeline/voice";
import { ownProject } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** Voices available on the active provider + who is assigned which (saved or auto-picked). */
export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await ownProject(id);
  const provider = getSpeechProvider();
  const db = await getDb();
  const cast = await db.select().from(schema.characters).where(eq(schema.characters.projectId, id));
  const voices = await provider.listVoices();
  return NextResponse.json({
    provider: provider.id,
    voices,
    assignments: Object.fromEntries(assignVoices(cast, voices)),
    stale: (await staleVoiceShots(id)).length,
  });
});

/** Record every line that is missing or out of date (or all, with force). */
export const POST = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  await ownProject(id);
  const { force } = z.object({ force: z.boolean().default(false) }).parse(await req.json().catch(() => ({})));
  const targets = await staleVoiceShots(id, force);
  await markVoicing(targets.map((s) => s.id));
  for (const s of targets) background(`voice ${s.id}`, () => voiceShot(s.id));
  return NextResponse.json({ queued: targets.map((s) => s.id), provider: getSpeechProvider().id }, { status: 202 });
});
