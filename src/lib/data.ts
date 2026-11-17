import "server-only";
import { and, asc, eq, inArray, lt } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { fileUrl } from "@/lib/storage";

const { projects, characters, scenes, shots, referenceImages, shotTakes, sheetTakes } = schema;

/** A generation that has been "generating" this long was lost to a server restart. */
const STALE_MS = 6 * 60 * 1000; // free batches are capped at 4 (~4 min); paid calls time out at 3 min

export async function recoverStale(projectId: string) {
  const db = await getDb();
  const cutoff = Date.now() - STALE_MS;
  const msg = "Generation was interrupted — try again.";
  await db
    .update(shots)
    .set({ imageStatus: "error", imageError: msg })
    .where(and(eq(shots.projectId, projectId), eq(shots.imageStatus, "generating"), lt(shots.updatedAt, cutoff)));
  await db
    .update(shots)
    .set({ clipStatus: "error", clipError: msg })
    .where(and(eq(shots.projectId, projectId), eq(shots.clipStatus, "generating"), lt(shots.updatedAt, Date.now() - 15 * 60 * 1000)));
  await db
    .update(characters)
    .set({ sheetStatus: "error", sheetError: msg })
    .where(and(eq(characters.projectId, projectId), eq(characters.sheetStatus, "generating"), lt(characters.updatedAt, cutoff)));
  await db
    .update(projects)
    .set({ status: "error", statusError: msg })
    .where(and(eq(projects.id, projectId), eq(projects.status, "breaking_down"), lt(projects.updatedAt, cutoff)));
}

/** Everything the workspace needs in one payload, with servable image URLs. */
export async function getProjectBundle(projectId: string) {
  const db = await getDb();
  await recoverStale(projectId);
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const [chars, sceneRows, shotRows, takeRows] = await Promise.all([
    db.select().from(characters).where(eq(characters.projectId, projectId)).orderBy(asc(characters.createdAt)),
    db.select().from(scenes).where(eq(scenes.projectId, projectId)).orderBy(asc(scenes.position)),
    db.select().from(shots).where(eq(shots.projectId, projectId)).orderBy(asc(shots.position)),
    db.select().from(shotTakes).where(eq(shotTakes.projectId, projectId)).orderBy(asc(shotTakes.createdAt)),
  ]);
  const [refs, sheetRows] = chars.length
    ? await Promise.all([
        db.select().from(referenceImages).where(inArray(referenceImages.characterId, chars.map((c) => c.id))),
        db.select().from(sheetTakes).where(eq(sheetTakes.projectId, projectId)).orderBy(asc(sheetTakes.createdAt)),
      ])
    : [[], []];

  return {
    project,
    characters: chars.map((c) => ({
      ...c,
      references: refs
        .filter((r) => r.characterId === c.id)
        .map((r) => ({ id: r.id, kind: r.kind, url: fileUrl(r.path, r.createdAt)! })),
      /** Every sheet this character has had, oldest first; `current` is the live one. */
      sheetTakes: sheetRows
        .filter((t) => t.characterId === c.id)
        .map((t) => {
          const front = t.views.find((v) => v.kind === "front") ?? t.views[0];
          const live = refs.find((r) => r.characterId === c.id && r.kind === front?.kind);
          return { id: t.id, url: fileUrl(front?.path, t.createdAt)!, current: !!live && live.path === front?.path };
        }),
    })),
    scenes: sceneRows,
    shots: shotRows.map((s) => ({
      ...s,
      imageUrl: fileUrl(s.imagePath, s.imageVersion),
      layoutUrl: fileUrl(s.layoutPath, s.updatedAt),
      audioUrl: fileUrl(s.audioPath),
      clipUrl: fileUrl(s.clipPath),
      // Only hand out depth that matches the current drawing.
      depthUrl: s.depthVersion === s.imageVersion ? fileUrl(s.depthPath, s.depthVersion ?? 0) : null,
      /** Every picture this shot has had, oldest first; `current` marks the one on the board. */
      takes: takeRows
        .filter((t) => t.shotId === s.id)
        .map((t) => ({ id: t.id, url: fileUrl(t.path, t.createdAt)!, model: t.model, current: t.path === s.imagePath })),
    })),
  };
}

export type ProjectBundle = NonNullable<Awaited<ReturnType<typeof getProjectBundle>>>;
export type CharacterView = ProjectBundle["characters"][number];
export type ShotView = ProjectBundle["shots"][number];

export async function touchProject(projectId: string) {
  const db = await getDb();
  await db.update(projects).set({ updatedAt: Date.now() }).where(eq(projects.id, projectId));
}
