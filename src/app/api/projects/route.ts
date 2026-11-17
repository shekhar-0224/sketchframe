import { NextResponse } from "next/server";

/** Background generation continues after the response (see pipeline/jobs.ts). */
export const maxDuration = 300;
import { desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { handle } from "@/lib/api";
import { fileUrl } from "@/lib/storage";
import { runBreakdown } from "@/lib/pipeline/breakdown";
import { background } from "@/lib/pipeline/jobs";
import { ASPECT_RATIOS } from "@/lib/vocab";
import { requireContext } from "@/lib/context";

const { projects } = schema;

export const GET = handle(async () => {
  const db = await getDb();
  const rows = await db
    .select({
      id: projects.id,
      title: projects.title,
      logline: projects.logline,
      status: projects.status,
      updatedAt: projects.updatedAt,
      // Raw SQL: drizzle renders single-table columns unqualified, which would bind to the subquery's table.
      shotCount: sql<number>`(select count(*) from shots s where s.project_id = projects.id)`,
      cover: sql<string | null>`(select s.image_path from shots s where s.project_id = projects.id and s.image_path is not null order by s.position limit 1)`,
    })
    .from(projects)
    .where(eq(projects.userId, requireContext().userId))
    .orderBy(desc(projects.updatedAt));
  return NextResponse.json(rows.map((r) => ({ ...r, cover: fileUrl(r.cover) })));
});

const createSchema = z.object({
  title: z.string().trim().min(1, "Give your project a title").max(120),
  mode: z.enum(["script", "idea", "poem", "blank"]).default("script"),
  text: z.string().max(400_000).default(""),
  aspectRatio: z.enum(ASPECT_RATIOS).default("16:9"),
});

export const POST = handle(async (req: Request) => {
  const body = createSchema.parse(await req.json());
  const db = await getDb();
  const id = nanoid();
  const willBreakdown = body.mode !== "blank" && body.text.trim().length > 0;
  await db.insert(projects).values({
    id,
    userId: requireContext().userId,
    title: body.title,
    scriptText: body.text,
    sourceKind: body.mode === "idea" ? "idea" : body.mode === "poem" ? "poem" : "script",
    aspectRatio: body.aspectRatio,
    status: willBreakdown ? "breaking_down" : "idle",
  });
  if (willBreakdown) background(`breakdown ${id}`, () => runBreakdown(id));
  const [row] = await db.select().from(projects).where(eq(projects.id, id));
  return NextResponse.json(row, { status: 201 });
});
