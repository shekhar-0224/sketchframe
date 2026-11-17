import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { handle, notFound } from "@/lib/api";
import { getProjectBundle } from "@/lib/data";
import { removeProjectFiles } from "@/lib/storage";
import { ASPECT_RATIOS } from "@/lib/vocab";
import { ownProject } from "@/lib/access";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, { params }: Ctx) => {
  const id = (await params).id;
  await ownProject(id);
  const bundle = await getProjectBundle(id);
  if (!bundle) throw notFound("Project not found");
  return NextResponse.json(bundle);
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  logline: z.string().max(1000).optional(),
  scriptText: z.string().max(400_000).optional(),
  aspectRatio: z.enum(ASPECT_RATIOS).optional(),
  /** Step 2: the user checked the breakdown and wants to continue. */
  reviewed: z.boolean().optional(),
});

export const PATCH = handle(async (req: Request, { params }: Ctx) => {
  const { id } = await params;
  await ownProject(id);
  const { reviewed, ...body } = patchSchema.parse(await req.json());
  const db = await getDb();
  const res = await db
    .update(schema.projects)
    .set({ ...body, ...(reviewed !== undefined && { reviewedAt: reviewed ? Date.now() : null }), updatedAt: Date.now() })
    .where(eq(schema.projects.id, id));
  if (!res.rowsAffected) throw notFound("Project not found");
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_req: Request, { params }: Ctx) => {
  const { id } = await params;
  await ownProject(id);
  const db = await getDb();
  await db.delete(schema.projects).where(eq(schema.projects.id, id));
  await removeProjectFiles(id);
  return NextResponse.json({ ok: true });
});
