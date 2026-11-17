import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { handle, notFound } from "@/lib/api";
import { removeFile } from "@/lib/storage";
import { ownCharacter } from "@/lib/access";
import { removeSheetTakeFiles } from "@/lib/takes";

type Ctx = { params: Promise<{ cid: string }> };

const patchSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    role: z.enum(["lead", "supporting", "minor"]),
    description: z.string().max(4000),
    personality: z.string().max(2000),
    locked: z.boolean(),
    voice: z.string().max(80),
    voiceStyle: z.string().max(500),
  })
  .partial();

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { cid } = await params;
  await ownCharacter(cid);
  const body = patchSchema.parse(await req.json());
  const db = await getDb();
  const res = await db.update(schema.characters).set(body).where(eq(schema.characters.id, cid));
  if (!res.rowsAffected) throw notFound("Character not found");
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { cid } = await params;
  await ownCharacter(cid);
  const db = await getDb();
  const [c] = await db.select().from(schema.characters).where(eq(schema.characters.id, cid));
  if (!c) return NextResponse.json({ ok: true });
  const refs = await db.select().from(schema.referenceImages).where(eq(schema.referenceImages.characterId, cid));
  await removeSheetTakeFiles(cid, refs.map((r) => r.path));
  await db.delete(schema.characters).where(eq(schema.characters.id, cid));
  await Promise.all(refs.map((r) => removeFile(r.path)));
  // Drop the id from any shot cast lists.
  const shots = await db.select().from(schema.shots).where(eq(schema.shots.projectId, c.projectId));
  for (const s of shots.filter((s) => s.characterIds.includes(cid))) {
    await db.update(schema.shots).set({ characterIds: s.characterIds.filter((x) => x !== cid) }).where(eq(schema.shots.id, s.id));
  }
  return NextResponse.json({ ok: true });
});
