import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { HttpError, handle, notFound } from "@/lib/api";
import { ownCharacter } from "@/lib/access";
import { pickSheetTake } from "@/lib/takes";

type Ctx = { params: Promise<{ cid: string; takeId: string }> };

/** Bring back an earlier character sheet. Locked characters are protected, like redraws. */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const { cid, takeId } = await params;
  await ownCharacter(cid);
  const db = await getDb();
  const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, cid));
  if (!c) throw notFound("Character not found");
  if (c.locked) throw new HttpError(409, `${c.name} is locked — unlock to change the drawing.`);
  if (c.sheetStatus === "generating") throw new HttpError(409, "Wait for the drawing to finish.");
  if (!(await pickSheetTake(c, takeId))) throw notFound("Take not found");
  await db.update(schema.characters).set({ updatedAt: Date.now() }).where(eq(schema.characters.id, cid));
  return NextResponse.json({ ok: true });
});
