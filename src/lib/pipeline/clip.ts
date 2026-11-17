import "server-only";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { getDb, schema } from "@/lib/db";
import { getVideoProvider } from "@/lib/ai/registry";
import { readImage, removeFile, saveFile } from "@/lib/storage";
import { artStyle } from "@/lib/ai/prompts";
import { dedupe } from "./jobs";

const { characters, shots, projects } = schema;

export async function markAnimating(shotIds: string[]) {
  if (!shotIds.length) return;
  const db = await getDb();
  await db.update(shots).set({ clipStatus: "generating", clipError: null, updatedAt: Date.now() }).where(inArray(shots.id, shotIds));
}

/**
 * Turn a finished panel into a short AI clip. The panel itself is the first frame, so
 * characters stay exactly as drawn; the prompt only describes motion.
 */
export function animateShot(shotId: string) {
  return dedupe(`clip:${shotId}`, async () => {
    const db = await getDb();
    const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
    if (!shot) return;
    try {
      const provider = getVideoProvider();
      if (!provider) throw new Error("AI animation needs a fal.ai key — add FAL_KEY to .env.local.");
      if (!shot.imagePath) throw new Error("Sketch the panel first — clips animate the finished drawing.");
      const [project] = await db.select().from(projects).where(eq(projects.id, shot.projectId));
      const cast = shot.characterIds.length ? await db.select().from(characters).where(inArray(characters.id, shot.characterIds)) : [];

      const aspectRatio = project.aspectRatio === "9:16" ? "9:16" : project.aspectRatio === "1:1" ? "1:1" : "16:9";
      const [w, h] = aspectRatio === "9:16" ? [720, 1280] : aspectRatio === "1:1" ? [1024, 1024] : [1280, 720];
      // Pad rather than crop, so nothing in the drawing is lost.
      const image = await sharp(await readImage(shot.imagePath))
        .resize(w, h, { fit: "contain", background: "#ffffff" })
        .png()
        .toBuffer();
      const seconds = shot.duration <= 5 ? 5 : 10;

      const prompt = [
        artStyle() === "film"
          ? "Animate this exact frame as a shot from a black-and-white film. Keep the look, lighting, framing and characters exactly as they are; strictly monochrome, no colour, no new characters, no on-screen text."
          : "Animate this exact storyboard panel. Keep the black-and-white pencil line-art style, the drawing, framing and characters exactly as they are; no colour, no photorealism, no new characters, no on-screen text.",
        `Action: ${shot.action || "subtle ambient motion"}.`,
        shot.dialogue ? `${shot.speaker || "The character"} speaks with natural lip and facial movement.` : "",
        `Camera: ${shot.cameraMove}${shot.cameraMove === "Static" ? " (locked off, only subtle life in the scene)" : ""}.`,
        cast.length ? `Characters: ${cast.map((c) => c.name).join(", ")}.` : "",
        "Smooth, restrained motion.",
      ]
        .filter(Boolean)
        .join(" ");

      const mp4 = await provider.animate({ image, prompt, seconds, aspectRatio });
      const rel = await saveFile(shot.projectId, "clips", mp4, "mp4");
      const [current] = await db.select().from(shots).where(eq(shots.id, shotId));
      if (!current) return removeFile(rel);
      await removeFile(current.clipPath);
      await db
        .update(shots)
        .set({ clipPath: rel, clipSeconds: seconds, clipStatus: "ready", clipError: null, updatedAt: Date.now() })
        .where(eq(shots.id, shotId));
    } catch (err) {
      await db
        .update(shots)
        .set({ clipStatus: "error", clipError: (err as Error).message.slice(0, 500), updatedAt: Date.now() })
        .where(eq(shots.id, shotId));
      throw err;
    }
  });
}

export async function removeClip(shotId: string) {
  const db = await getDb();
  const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
  if (!shot) return;
  await removeFile(shot.clipPath);
  await db.update(shots).set({ clipPath: null, clipSeconds: null, clipStatus: "empty", clipError: null }).where(eq(shots.id, shotId));
}
