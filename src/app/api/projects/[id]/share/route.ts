import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { handle } from "@/lib/api";
import { ownProject } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

/** Turn on a public read-only movie link (idempotent: keeps an existing token). */
export const POST = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  const project = await ownProject(id);
  const token = project.shareToken ?? nanoid(18);
  if (!project.shareToken) {
    const db = await getDb();
    await db.update(schema.projects).set({ shareToken: token }).where(eq(schema.projects.id, id));
  }
  return NextResponse.json({ token, path: `/s/${token}` });
});

/** Turn the link off; the old URL stops working immediately. */
export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await ownProject(id);
  const db = await getDb();
  await db.update(schema.projects).set({ shareToken: null }).where(eq(schema.projects.id, id));
  return NextResponse.json({ ok: true });
});
