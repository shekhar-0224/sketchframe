import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { fileFromForm, handle, notFound } from "@/lib/api";
import { saveImage } from "@/lib/storage";
import { ownCharacter } from "@/lib/access";

/**
 * User-supplied reference (photo, existing art, or their own sketch). It becomes the
 * anchor for sheet generation and is sent first with every panel featuring the character.
 */
export const POST = handle(async (req: Request, { params }: { params: Promise<{ cid: string }> }) => {
  const { cid } = await params;
  await ownCharacter(cid);
  const { file } = await fileFromForm(req);
  const db = await getDb();
  const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, cid));
  if (!c) throw notFound("Character not found");
  const path = await saveImage(c.projectId, `characters/${cid}`, Buffer.from(await file.arrayBuffer()), { maxSize: 1280 });
  const id = nanoid();
  await db.insert(schema.referenceImages).values({ id, projectId: c.projectId, characterId: cid, kind: "upload", path });
  return NextResponse.json({ id }, { status: 201 });
});
