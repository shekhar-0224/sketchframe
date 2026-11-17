import { NextResponse } from "next/server";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { HttpError, handle, notFound } from "@/lib/api";
import { background, isInflight } from "@/lib/pipeline/jobs";
import { generateSheet } from "@/lib/pipeline/references";
import { ownCharacter } from "@/lib/access";

/** Generate (or redraw) the multi-view reference sheet. Locked characters are protected. */
export const POST = handle(async (_req: Request, { params }: { params: Promise<{ cid: string }> }) => {
  const { cid } = await params;
  await ownCharacter(cid);
  const db = await getDb();
  const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, cid));
  if (!c) throw notFound("Character not found");
  if (c.locked) throw new HttpError(409, `${c.name}'s sheet is locked — unlock it to redraw.`);
  if (!isInflight(`sheet:${cid}`)) {
    await db.update(schema.characters).set({ sheetStatus: "generating", sheetError: null, updatedAt: Date.now() }).where(eq(schema.characters.id, cid));
    background(`sheet ${cid}`, () => generateSheet(cid));
  }
  return NextResponse.json({ ok: true }, { status: 202 });
});
