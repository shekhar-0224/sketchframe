import "server-only";
import { asc, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { effectsFor } from "@/lib/effects";

const { projects, scenes, shots } = schema;

/** Folders a share link may expose. Character sheets and layouts stay private. */
export const SHARED_FOLDERS = new Set(["panels", "depth", "voices", "clips"]);

export async function projectByShareToken(token: string) {
  if (!/^[\w-]{12,40}$/.test(token)) return null;
  const db = await getDb();
  const [p] = await db.select().from(projects).where(eq(projects.shareToken, token));
  return p ?? null;
}

/**
 * Everything the public player needs, with file URLs routed through the share link
 * (so viewers never touch the authenticated /api/files route).
 */
export async function sharedMovie(token: string) {
  const project = await projectByShareToken(token);
  if (!project) return null;
  const db = await getDb();
  const [sceneRows, shotRows] = await Promise.all([
    db.select().from(scenes).where(eq(scenes.projectId, project.id)),
    db.select().from(shots).where(eq(shots.projectId, project.id)).orderBy(asc(shots.position)),
  ]);
  const url = (rel: string | null, v?: number | null) => (rel ? `/api/share/${token}/f/${rel}${v ? `?v=${v}` : ""}` : null);
  const sceneById = new Map(sceneRows.map((s) => [s.id, s]));
  return {
    title: project.title,
    logline: project.logline,
    aspectRatio: project.aspectRatio,
    shots: shotRows.map((s) => {
      const sc = s.sceneId ? sceneById.get(s.sceneId) : undefined;
      return {
        id: s.id,
        sceneId: s.sceneId,
        duration: s.duration,
        cameraMove: s.cameraMove,
        speaker: s.speaker,
        dialogue: s.dialogue,
        imageUrl: url(s.imagePath, s.imageVersion),
        clipUrl: s.clipStatus === "ready" ? url(s.clipPath) : null,
        audioUrl: s.audioStatus === "ready" || s.audioStatus === "stale" ? url(s.audioPath) : null,
        depthUrl: s.depthVersion === s.imageVersion ? url(s.depthPath, s.depthVersion) : null,
        effects: effectsFor(s, sc ? `${sc.heading}\n${sc.summary}` : ""),
        interior: /^\s*INT\b/i.test(sc?.heading ?? ""),
      };
    }),
  };
}

export type SharedMovie = NonNullable<Awaited<ReturnType<typeof sharedMovie>>>;
