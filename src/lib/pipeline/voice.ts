import "server-only";
import crypto from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import type { Character, Shot } from "@/lib/db/schema";
import { getSpeechProvider } from "@/lib/ai/registry";
import { defaultVoice, inferVoiceTraits, type SpeechProvider, type Voice } from "@/lib/ai/speech";
import { removeFile, saveFile } from "@/lib/storage";
import { dedupe, withSlot } from "./jobs";

const { characters, shots } = schema;
const norm = (s: string) => s.trim().toUpperCase().replace(/\s*\(.*\)\s*$/, "");

/** Pause after a line before the cut, so dialogue never feels clipped. */
const TAIL_SECONDS = 0.6;

/** Match "MAYA (V.O.)" / "Maya" / "MAYA CHEN" to a character. */
export function findSpeaker(speaker: string, cast: Character[]) {
  const k = norm(speaker);
  if (!k) return null;
  return cast.find((c) => norm(c.name) === k) ?? cast.find((c) => norm(c.name).split(" ")[0] === k.split(" ")[0]) ?? null;
}

/**
 * Voice assignment for every character on the current provider. A character's saved voice
 * is used if the provider has it; otherwise one is picked from the description
 * (gender/age), spreading characters across different voices.
 */
export function assignVoices(cast: Character[], voices: Voice[]) {
  const out = new Map<string, string>();
  const taken: string[] = [];
  for (const c of cast) {
    if (c.voice && voices.some((v) => v.id === c.voice)) {
      out.set(c.id, c.voice);
      taken.push(c.voice);
    }
  }
  for (const c of cast) {
    if (out.has(c.id)) continue;
    const v = defaultVoice(voices, inferVoiceTraits(`${c.description} ${c.personality}`), c.id, taken);
    out.set(c.id, v);
    taken.push(v);
  }
  return out;
}

const isNarrator = (speaker: string) => !speaker.trim() || /narrator|v\.?o\.?/i.test(speaker);

function acting(c: Character | null, shot: Shot) {
  const who = c
    ? c.voiceStyle || `${c.description.split(/(?<=\.)\s/)[0] ?? ""} ${c.personality}`.trim()
    : "A warm, measured storyteller reading aloud. Let each line breathe, with natural pauses at line breaks.";
  return `Character voice: ${who}\nIn this moment: ${shot.action}`.slice(0, 900);
}

async function context(projectId: string, provider: SpeechProvider) {
  const db = await getDb();
  const cast = await db.select().from(characters).where(eq(characters.projectId, projectId));
  const voices = await provider.listVoices();
  return { cast, voices, assigned: assignVoices(cast, voices) };
}

function lineFor(shot: Shot, ctx: Awaited<ReturnType<typeof context>>, provider: SpeechProvider) {
  const speaker = isNarrator(shot.speaker) ? null : findSpeaker(shot.speaker, ctx.cast);
  // Narration (poems, V.O.) prefers a voice tagged as a storyteller.
  const narratorVoice = ctx.voices.find((v) => /storyteller/i.test(v.note ?? ""))?.id ?? defaultVoice(ctx.voices, { gender: "neutral", old: false }, "narrator");
  const voice = speaker ? ctx.assigned.get(speaker.id)! : narratorVoice;
  const instructions = acting(speaker, shot);
  const text = shot.dialogue.trim();
  const key = crypto.createHash("sha1").update([provider.id, voice, text, speaker?.voiceStyle ?? ""].join("\u0000")).digest("hex").slice(0, 16);
  return { text, voice, instructions, key };
}

export async function markVoicing(shotIds: string[]) {
  if (!shotIds.length) return;
  const db = await getDb();
  await db.update(shots).set({ audioStatus: "generating", audioError: null }).where(inArray(shots.id, shotIds));
}

/** Speak one shot's dialogue and stretch the shot so the line fits. */
export function voiceShot(shotId: string) {
  return dedupe(`voice:${shotId}`, async () => {
    const db = await getDb();
    const [shot] = await db.select().from(shots).where(eq(shots.id, shotId));
    if (!shot) return;
    try {
      const provider = getSpeechProvider();
      if (!shot.dialogue.trim() || provider.id === "browser") {
        // Nothing to render server-side: no line, or the browser speaks it live.
        await removeFile(shot.audioPath);
        await db
          .update(shots)
          .set({ audioPath: null, audioSeconds: null, audioKey: null, audioStatus: "empty", audioError: null })
          .where(eq(shots.id, shotId));
        return;
      }
      const line = lineFor(shot, await context(shot.projectId, provider), provider);
      const { wav, seconds } = await withSlot(() => provider.synthesize(line));
      const rel = await saveFile(shot.projectId, "voices", wav, "wav");
      const [current] = await db.select().from(shots).where(eq(shots.id, shotId));
      if (!current) return removeFile(rel);
      await removeFile(current.audioPath);
      await db
        .update(shots)
        .set({
          audioPath: rel,
          audioSeconds: seconds,
          audioKey: line.key,
          audioStatus: "ready",
          audioError: null,
          duration: Math.max(current.duration, Math.round((seconds + TAIL_SECONDS) * 4) / 4),
        })
        .where(eq(shots.id, shotId));
    } catch (err) {
      await db
        .update(shots)
        .set({ audioStatus: "error", audioError: (err as Error).message.slice(0, 500) })
        .where(eq(shots.id, shotId));
      throw err;
    }
  });
}

/** Shots whose dialogue has no audio yet, or whose text/voice changed since it was recorded. */
export async function staleVoiceShots(projectId: string, force = false) {
  const db = await getDb();
  const provider = getSpeechProvider();
  const rows = await db.select().from(shots).where(and(eq(shots.projectId, projectId)));
  if (provider.id === "browser") return [];
  const ctx = await context(projectId, provider);
  return rows.filter(
    (s) => s.dialogue.trim() && s.audioStatus !== "generating" && (force || s.audioKey !== lineFor(s, ctx, provider).key),
  );
}

/** Synthesize a short sample in a character's voice for the bible page. */
export async function previewVoice(characterId: string) {
  const db = await getDb();
  const [c] = await db.select().from(characters).where(eq(characters.id, characterId));
  if (!c) throw new Error("Character not found");
  const provider = getSpeechProvider();
  if (provider.id === "browser") return null;
  const ctx = await context(c.projectId, provider);
  // Preview with the character's own first line when they have one.
  const rows = await db.select().from(shots).where(eq(shots.projectId, c.projectId)).orderBy(shots.position);
  const sample = rows.find((s) => s.dialogue.trim() && findSpeaker(s.speaker, [c]))?.dialogue ?? "";
  const text = sample || `Hi. I'm ${c.name.charAt(0) + c.name.slice(1).toLowerCase()}.`;
  return withSlot(() =>
    provider.synthesize({ text, voice: ctx.assigned.get(c.id)!, instructions: c.voiceStyle || c.description.split(/(?<=\.)\s/)[0] }),
  );
}
