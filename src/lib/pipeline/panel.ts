import "server-only";
import { eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { getImageProvider } from "@/lib/ai/registry";
import { artStyle, panelPrompt } from "@/lib/ai/prompts";
import type { ImageRequest } from "@/lib/ai/types";
import { readImage, removeFile, saveImage } from "@/lib/storage";
import { recordTake } from "@/lib/takes";
import { abbr } from "@/lib/vocab";
import { panelTier } from "@/lib/tiers";
import { dedupe, withSlot } from "./jobs";
import { ensureSheets, panelReferences } from "./references";

const { projects, characters, scenes, shots } = schema;

/** Mark a shot as generating right away so the UI flips state before the work starts. */
export async function markGenerating(shotIds: string[]) {
  if (!shotIds.length) return;
  const db = await getDb();
  await db
    .update(shots)
    .set({ imageStatus: "generating", imageError: null, updatedAt: Date.now() })
    .where(inArray(shots.id, shotIds));
}

/**
 * One storyboard panel. Character sheets are always attached — if a character in
 * frame has none yet, it is generated first rather than drawing the panel blind.
 */
export function generatePanel(shotId: string, opts?: { more?: boolean }) {
  return dedupe(`panel:${shotId}`, async () => {
    const db = await getDb();
    const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
    if (!shot) return;
    try {
      const [[project], scene, cast] = await Promise.all([
        db.select().from(projects).where(eq(projects.id, shot.projectId)),
        shot.sceneId ? db.select().from(scenes).where(eq(scenes.id, shot.sceneId)).then((r) => r[0] ?? null) : null,
        shot.characterIds.length
          ? db.select().from(characters).where(inArray(characters.id, shot.characterIds))
          : Promise.resolve([]),
      ]);

      await ensureSheets(cast);
      const refs = await panelReferences(cast, shot.shotSize);
      const layout = shot.layoutPath
        ? { label: "rough layout sketch to follow for composition", data: await readImage(shot.layoutPath), mimeType: "image/png" as const }
        : undefined;

      const index = (await db.select({ id: shots.id }).from(shots).where(eq(shots.projectId, shot.projectId)).orderBy(shots.position))
        .findIndex((s) => s.id === shotId) + 1;

      const provider = getImageProvider();
      const tier = panelTier(shot);
      const buf = await withSlot(() =>
        provider.generateImage({
          prompt: panelPrompt({ project, scene, shot, cast, hasLayout: !!layout }),
          tier,
          references: refs.map((r) => r.img),
          layout,
          aspectRatio: project.aspectRatio as ImageRequest["aspectRatio"],
          meta: {
            kind: "panel",
            title: `${index} · ${abbr(shot.shotSize)}`,
            names: cast.map((c) => c.name),
            shotSize: shot.shotSize,
            angle: shot.cameraAngle,
            action: shot.action,
            setting: scene ? `${scene.heading}. ${scene.summary}` : "",
            castLines: cast.map((c) => `${c.name}: ${c.description}`),
          },
        }),
      );

      const rel = await saveImage(shot.projectId, "panels", buf, { maxSize: 1600, look: artStyle() });
      // Re-read: the user may have edited fields while we were drawing.
      const [current] = await db.select().from(shots).where(eq(shots.id, shotId));
      if (!current) return removeFile(rel);
      const model = provider.modelFor(tier);
      // The old picture stays as a take the user can switch back to.
      await recordTake(current, rel, model);
      await db
        .update(shots)
        .set({
          imagePath: rel,
          // More versions queued: stay "generating" so the UI keeps watching.
          imageStatus: opts?.more ? "generating" : "ready",
          imageError: null,
          imageVersion: current.imageVersion + 1,
          lastReferenceIds: refs.map((r) => r.ref.id),
          lastModel: model,
          updatedAt: Date.now(),
        })
        .where(eq(shots.id, shotId));
    } catch (err) {
      await db
        .update(shots)
        .set({ imageStatus: "error", imageError: (err as Error).message.slice(0, 500), updatedAt: Date.now() })
        .where(eq(shots.id, shotId));
      throw err;
    }
  });
}
