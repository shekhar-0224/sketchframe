import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { requireContext } from "@/lib/context";
import { notFound } from "@/lib/api";

/**
 * Ownership checks. Every project-scoped route resolves its resource through one of
 * these, so one user can never read or change another user's boards (a foreign id
 * simply 404s).
 */
const { projects, shots, characters, referenceImages } = schema;

export async function ownProject(projectId: string) {
  const db = await getDb();
  const [p] = await db
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, requireContext().userId)));
  if (!p) throw notFound("Project not found");
  return p;
}

export async function ownShot(shotId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ shot: shots })
    .from(shots)
    .innerJoin(projects, eq(projects.id, shots.projectId))
    .where(and(eq(shots.id, shotId), eq(projects.userId, requireContext().userId)));
  if (!row) throw notFound("Shot not found");
  return row.shot;
}

export async function ownCharacter(characterId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ character: characters })
    .from(characters)
    .innerJoin(projects, eq(projects.id, characters.projectId))
    .where(and(eq(characters.id, characterId), eq(projects.userId, requireContext().userId)));
  if (!row) throw notFound("Character not found");
  return row.character;
}

export async function ownReference(refId: string) {
  const db = await getDb();
  const [row] = await db
    .select({ ref: referenceImages })
    .from(referenceImages)
    .innerJoin(projects, eq(projects.id, referenceImages.projectId))
    .where(and(eq(referenceImages.id, refId), eq(projects.userId, requireContext().userId)));
  if (!row) throw notFound("Reference not found");
  return row.ref;
}
