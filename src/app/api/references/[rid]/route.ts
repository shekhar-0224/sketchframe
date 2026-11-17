import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { HttpError, handle } from "@/lib/api";
import { removeFile } from "@/lib/storage";
import { ownReference } from "@/lib/access";

export const DELETE = handle(async (_req: Request, { params }: { params: Promise<{ rid: string }> }) => {
  const { rid } = await params;
  await ownReference(rid);
  const db = await getDb();
  const [ref] = await db.select().from(schema.referenceImages).where(eq(schema.referenceImages.id, rid));
  if (!ref) return NextResponse.json({ ok: true });
  if (ref.characterId) {
    const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, ref.characterId));
    if (c?.locked) throw new HttpError(409, "Unlock the character to change its references");
  }
  await db.delete(schema.referenceImages).where(eq(schema.referenceImages.id, rid));
  await removeFile(ref.path);
  return NextResponse.json({ ok: true });
});
