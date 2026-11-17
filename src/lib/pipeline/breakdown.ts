import "server-only";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import { getTextProvider } from "@/lib/ai/registry";
import { BREAKDOWN_LITE, BREAKDOWN_SYSTEM, IDEA_SYSTEM, POEM_SYSTEM } from "@/lib/ai/prompts";
import { breakdownSchema, parseJsonLoose, type Breakdown } from "./breakdown-schema";
import { heuristicBreakdown, heuristicExpandIdea, heuristicPoem } from "./heuristic-breakdown";

const { projects, characters, scenes, shots } = schema;
const MAX_SCRIPT_CHARS = 60_000;

const norm = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

async function runModel(script: string, title: string, poem: boolean): Promise<Breakdown> {
  const provider = getTextProvider();
  const offline = () => (poem ? heuristicPoem(script, title) : heuristicBreakdown(script, title));
  if (provider.id === "mock") return offline();
  // Poems keep their exact lines with the offline stager on the free tier (its replies are short).
  if (provider.id === "free" && poem) return offline();
  const free = provider.id === "free";
  const ask = async () => {
    const raw = parseJsonLoose(
      await provider.generateText({
        system: free ? BREAKDOWN_LITE : poem ? POEM_SYSTEM : BREAKDOWN_SYSTEM,
        prompt: `Project title: ${title}\n\n${poem ? "POEM" : free ? "STORY" : "SCRIPT"}:\n${script.slice(0, free ? 8_000 : MAX_SCRIPT_CHARS)}`,
        json: true,
        temperature: 0.4,
      }),
    ) as { scenes?: unknown[] };
    const parsed = breakdownSchema.parse(raw);
    // How much of the answer was malformed and had to be dropped.
    const dropped = (Array.isArray(raw.scenes) ? raw.scenes.length : 0) - parsed.scenes.length;
    return { parsed, dropped };
  };
  if (!free) return (await ask()).parsed;
  // The free service is best-effort: retry incomplete answers, keep the best, never return nothing.
  // "Complete" = roughly as many scenes as paragraphs and shots as half the sentences (capped).
  const paragraphs = script.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const sentences = (script.match(/[.!?]+["”]?(\s|$)/g) ?? []).length;
  const wantScenes = Math.min(3, Math.max(1, paragraphs - 1));
  const wantShots = Math.min(8, Math.max(3, Math.ceil(sentences / 2)));
  let best: Breakdown | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { parsed, dropped } = await ask();
      const shots = (b: Breakdown) => b.scenes.reduce((n, s) => n + s.shots.length, 0);
      if (!best || shots(parsed) > shots(best)) best = parsed;
      if (dropped === 0 && parsed.scenes.length >= wantScenes && shots(parsed) >= wantShots) break;
    } catch (err) {
      console.warn("[sketchframe] free breakdown attempt failed:", (err as Error).message);
    }
  }
  return best && best.scenes.some((s) => s.shots.length) ? best : offline();
}

async function expandIdea(idea: string) {
  const provider = getTextProvider();
  if (provider.id === "mock") return heuristicExpandIdea(idea);
  return (await provider.generateText({ system: IDEA_SYSTEM, prompt: idea, temperature: 0.9 })).trim();
}

/**
 * Script → characters + scenes + shot list. Replaces the board's scenes/shots but
 * merges characters by name so existing reference sheets (and locks) survive a re-run.
 */
export async function runBreakdown(projectId: string) {
  const db = await getDb();
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) throw new Error("Project not found");

  try {
    let script = project.scriptText;
    if (project.sourceKind === "idea") {
      script = await expandIdea(script);
      await db.update(projects).set({ scriptText: script, sourceKind: "idea_expanded" }).where(eq(projects.id, projectId));
    }
    if (!script.trim()) throw new Error("The script is empty.");

    const result = await runModel(script, project.title, project.sourceKind === "poem");

    const existing = await db.select().from(characters).where(eq(characters.projectId, projectId));
    const byName = new Map(existing.map((c) => [norm(c.name), c]));
    for (const c of result.characters) {
      const key = norm(c.name);
      const prev = byName.get(key);
      if (prev) {
        // Replace an empty or placeholder description (e.g. "15 years old.") with a richer one.
        if (!prev.locked && c.description && prev.description.length < 30 && c.description.length > prev.description.length) {
          await db.update(characters).set({ description: c.description, personality: c.personality }).where(eq(characters.id, prev.id));
        }
      } else {
        const row = {
          id: nanoid(),
          projectId,
          name: c.name.trim(),
          role: ["lead", "supporting", "minor"].includes(c.role) ? c.role : "supporting",
          description: c.description,
          personality: c.personality,
        };
        await db.insert(characters).values(row);
        byName.set(key, { ...row, locked: false } as never);
      }
    }

    // Resolve shot cast names to ids; tolerate "MAYA" vs "Maya Chen".
    const resolve = (name: string) => {
      const k = norm(name);
      if (byName.has(k)) return byName.get(k)!.id;
      for (const [n, c] of byName) if (n.split(" ")[0] === k.split(" ")[0]) return c.id;
      return null;
    };

    await db.delete(shots).where(eq(shots.projectId, projectId));
    await db.delete(scenes).where(eq(scenes.projectId, projectId));

    let pos = 0;
    for (const [si, sc] of result.scenes.entries()) {
      const sceneId = nanoid();
      await db.insert(scenes).values({
        id: sceneId,
        projectId,
        position: si,
        heading: sc.heading || `SCENE ${si + 1}`,
        location: sc.location,
        timeOfDay: sc.timeOfDay,
        summary: sc.summary,
      });
      const rows = sc.shots.map((s) => {
        const ids = new Set(s.characters.map(resolve).filter(Boolean) as string[]);
        const sp = s.speaker && resolve(s.speaker);
        if (sp) ids.add(sp);
        return {
          id: nanoid(),
          projectId,
          sceneId,
          position: pos++,
          shotSize: s.shotSize || "Medium",
          cameraAngle: s.cameraAngle || "Eye level",
          cameraMove: s.cameraMove || "Static",
          action: s.action,
          // Models sometimes wrap lines in their own quotes; captions add quotes already.
          dialogue: cleanLine(s.dialogue),
          speaker: s.speaker,
          notes: s.notes,
          duration: Math.min(12, Math.max(2, Number(s.duration) || 3)),
          characterIds: [...ids],
        };
      });
      if (rows.length) await db.insert(shots).values(rows);
    }

    await db
      .update(projects)
      .set({
        status: "idle",
        statusError: null,
        reviewedAt: null,
        logline: project.logline || result.logline,
        updatedAt: Date.now(),
      })
      .where(eq(projects.id, projectId));
  } catch (err) {
    await db
      .update(projects)
      .set({ status: "error", statusError: (err as Error).message.slice(0, 500), updatedAt: Date.now() })
      .where(eq(projects.id, projectId));
    throw err;
  }
}

/** Models sometimes copy the attribution too: `Dinner is served," Jerry whispers.` → `Dinner is served`. */
function cleanLine(text: string) {
  return text
    .replace(/["”’]\s*,?\s+[\w' ]{1,40}?\b(says|said|whispers|whispered|shouts|shouted|asks|asked|yells|yelled|replies|replied|mutters|muttered|cries|cried|calls|called)\b.*$/i, "")
    .replace(/^[\s"“”'‘’,]+|[\s"“”'‘’,]+$/g, "")
    .trim();
}
