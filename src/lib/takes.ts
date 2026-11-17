import "server-only";
import { and, asc, eq, ne } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import type { Shot } from "@/lib/db/schema";
import { removeFile } from "@/lib/storage";

const { shotTakes, sheetTakes, referenceImages } = schema;

/** How many pictures each shot remembers. Older ones are deleted, files and all. */
export const MAX_TAKES = 6;

/**
 * Remember a shot's new picture as a take. Pictures drawn before takes existed are
 * recorded on the way, so the one being replaced can always be brought back.
 * Callers must no longer delete the old imagePath: it now belongs to a take.
 */
export async function recordTake(shot: Shot, path: string, model: string | null) {
  const db = await getDb();
  const takes = await db.select().from(shotTakes).where(eq(shotTakes.shotId, shot.id)).orderBy(asc(shotTakes.createdAt));
  const now = Date.now();
  if (shot.imagePath && !takes.some((t) => t.path === shot.imagePath)) {
    const old = { id: nanoid(), projectId: shot.projectId, shotId: shot.id, path: shot.imagePath, model: shot.lastModel, createdAt: now - 1 };
    await db.insert(shotTakes).values(old);
    takes.push(old);
  }
  const fresh = { id: nanoid(), projectId: shot.projectId, shotId: shot.id, path, model, createdAt: now };
  await db.insert(shotTakes).values(fresh);
  takes.push(fresh);

  // Prune the oldest, never the new picture or the layout guide.
  const spare = takes.filter((t) => t.path !== path && t.path !== shot.layoutPath);
  for (const t of spare.slice(0, Math.max(0, takes.length - MAX_TAKES))) {
    await db.delete(shotTakes).where(eq(shotTakes.id, t.id));
    await removeFile(t.path);
  }
}

/** Keep the current picture as a take before it's cleared, so "remove picture" can be undone. */
export async function keepAsTake(shot: Shot) {
  if (!shot.imagePath) return;
  const db = await getDb();
  const takes = await db.select().from(shotTakes).where(eq(shotTakes.shotId, shot.id));
  if (takes.some((t) => t.path === shot.imagePath)) return;
  await db.insert(shotTakes).values({ id: nanoid(), projectId: shot.projectId, shotId: shot.id, path: shot.imagePath, model: shot.lastModel });
}

/** Delete every take file of a shot (rows go with the shot via cascade). Skips paths listed in `keep`. */
export async function removeTakeFiles(shotId: string, keep: (string | null)[]) {
  const db = await getDb();
  const takes = await db.select().from(shotTakes).where(eq(shotTakes.shotId, shotId));
  for (const t of takes) if (!keep.includes(t.path)) await removeFile(t.path);
}

type View = { kind: string; path: string };
const frontOf = (views: View[]) => views.find((v) => v.kind === "front")?.path ?? views[0]?.path;

/**
 * Remember a freshly drawn character sheet, plus the one it replaces (if it predates takes).
 * Callers must no longer delete the old sheet's files: they now belong to a take.
 */
export async function recordSheetTake(c: { id: string; projectId: string }, views: View[], replaced: View[]) {
  const db = await getDb();
  const takes = await db.select().from(sheetTakes).where(eq(sheetTakes.characterId, c.id)).orderBy(asc(sheetTakes.createdAt));
  const now = Date.now();
  if (replaced.length && !takes.some((t) => frontOf(t.views) === frontOf(replaced))) {
    const old = { id: nanoid(), projectId: c.projectId, characterId: c.id, views: replaced, createdAt: now - 1 };
    await db.insert(sheetTakes).values(old);
    takes.push(old);
  }
  const fresh = { id: nanoid(), projectId: c.projectId, characterId: c.id, views, createdAt: now };
  await db.insert(sheetTakes).values(fresh);
  takes.push(fresh);

  const drop = takes.filter((t) => t.id !== fresh.id).slice(0, Math.max(0, takes.length - MAX_TAKES));
  const kept = new Set(takes.filter((t) => !drop.includes(t)).flatMap((t) => t.views.map((v) => v.path)));
  for (const t of drop) {
    await db.delete(sheetTakes).where(eq(sheetTakes.id, t.id));
    for (const v of t.views) if (!kept.has(v.path)) await removeFile(v.path);
  }
}

/** Make an earlier sheet the live one. Uploads are untouched, and the replaced sheet stays a take. */
export async function pickSheetTake(c: { id: string; projectId: string }, takeId: string) {
  const db = await getDb();
  const [take] = await db.select().from(sheetTakes).where(and(eq(sheetTakes.id, takeId), eq(sheetTakes.characterId, c.id)));
  if (!take) return false;
  await db.delete(referenceImages).where(and(eq(referenceImages.characterId, c.id), ne(referenceImages.kind, "upload")));
  for (const v of take.views) await db.insert(referenceImages).values({ id: nanoid(), projectId: c.projectId, characterId: c.id, kind: v.kind, path: v.path });
  return true;
}

/** Delete every sheet-take file of a character (rows go with it via cascade). Skips paths in `keep`. */
export async function removeSheetTakeFiles(characterId: string, keep: string[]) {
  const db = await getDb();
  const takes = await db.select().from(sheetTakes).where(eq(sheetTakes.characterId, characterId));
  const paths = new Set(takes.flatMap((t) => t.views.map((v) => v.path)));
  for (const p of paths) if (!keep.includes(p)) await removeFile(p);
}
