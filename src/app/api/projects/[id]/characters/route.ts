import { NextResponse } from "next/server";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { handle } from "@/lib/api";
import { ownProject } from "@/lib/access";

const bodySchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  role: z.enum(["lead", "supporting", "minor"]).default("supporting"),
  description: z.string().max(4000).default(""),
  personality: z.string().max(2000).default(""),
});

export const POST = handle(async (req: Request, { params }: { params: Promise<{ id: string }> }) => {
  const { id: projectId } = await params;
  await ownProject(projectId);
  const body = bodySchema.parse(await req.json());
  const db = await getDb();
  const id = nanoid();
  await db.insert(schema.characters).values({ id, projectId, ...body });
  return NextResponse.json({ id }, { status: 201 });
});
