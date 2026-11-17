import type { Breakdown } from "./breakdown-schema";

/**
 * Offline fallback used when no text provider is configured. It understands standard
 * screenplay formatting well enough to produce a usable shot list, so the rest of the
 * app can be exercised without API keys.
 */
const HEADING = /^(INT|EXT|INT\.?\/EXT|I\/E|EST)[.\s]/i;
const CUE = /^[A-Z][A-Z0-9 .'\-]{1,28}(\s*\((V\.O\.|O\.S\.|O\.C\.|CONT'D)\))?$/;
const TRANSITION = /^(CUT TO|FADE (IN|OUT)|DISSOLVE TO|SMASH CUT|MATCH CUT)/i;

export function heuristicBreakdown(script: string, fallbackTitle: string): Breakdown {
  // Prose (no scene headings, no character cues) needs a different reader.
  const lines = script.split("\n").map((l) => l.trim());
  if (!lines.some((l) => HEADING.test(l)) && !lines.some((l, i) => CUE.test(l) && !!lines[i + 1])) return heuristicProse(script, fallbackTitle);
  return heuristicScreenplay(script, fallbackTitle);
}

const NOT_NAMES = new Set(
  "The A An One Two Three Inside Outside They He She It We You I His Her Their Our My When Then After Before As But And So Once Later Every Each One Some Many Suddenly Finally Today Tomorrow Yesterday Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December Mr Mrs Ms Dr".split(" "),
);

/** Plain-prose stories: names from "Arjun, 15," or repeated capitalised words; paragraphs → scenes; sentences → shots. */
export function heuristicProse(story: string, fallbackTitle: string): Breakdown {
  const text = story.replace(/\r\n?/g, "\n").trim();
  const ages = new Map<string, number>();
  for (const m of text.matchAll(/\b([A-Z][a-z]{1,15}),?\s+(?:aged\s+)?(\d{1,2})\b/g)) if (!NOT_NAMES.has(m[1])) ages.set(m[1], Number(m[2]));
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/(?<![.!?]\s|^)\b([A-Z][a-z]{2,15})\b/gm)) if (!NOT_NAMES.has(m[1])) counts.set(m[1], (counts.get(m[1]) ?? 0) + 1);
  const names = [...new Set([...ages.keys(), ...[...counts].filter(([, n]) => n >= 2).map(([w]) => w)])].slice(0, 8);

  const paragraphs = text.split(/\n\s*\n/).map((p) => p.replace(/\s+/g, " ").trim()).filter(Boolean);
  const sizes = ["Establishing", "Medium", "Close-up", "Wide", "Over-the-shoulder"];
  const moves = ["Pan", "Static", "Push in", "Static", "Tracking"];
  let k = 0;
  let last: string[] = names;
  const scenes = paragraphs.slice(0, 12).map((para, i) => {
    const sentences = para.match(/[^.!?]+[.!?]+["”]?|[^.!?]+$/g)?.map((x) => x.trim()).filter(Boolean) ?? [para];
    return {
      heading: `PART ${i + 1}`,
      location: "",
      timeOfDay: "",
      summary: para.slice(0, 160),
      shots: sentences.slice(0, 6).map((sentence) => {
        const inShot = names.filter((n) => new RegExp(`\\b${n}\\b`).test(sentence));
        // "They"/"he"/"she" refer back to whoever was last on screen.
        const cast = inShot.length ? inShot : /\b(they|he|she|them|together)\b/i.test(sentence) ? last : [];
        if (inShot.length) last = inShot;
        const quote = /["“]([^"”]+)["”]/.exec(sentence)?.[1] ?? "";
        const speaker = quote ? (inShot.find((n) => new RegExp(`${n}\\s+(said|says|asked|shouted|whispered)`).test(sentence)) ?? "NARRATOR") : "";
        const shot = {
          shotSize: k === 0 ? "Establishing" : quote ? "Close-up" : sizes[k % sizes.length],
          cameraAngle: k % 4 === 3 ? "High angle" : "Eye level",
          cameraMove: moves[k % moves.length],
          action: sentence.replace(/["“][^"”]*["”]/g, "").trim().slice(0, 300) || sentence.slice(0, 300),
          speaker,
          dialogue: quote,
          characters: cast,
          duration: Math.min(8, Math.max(2, Math.round(sentence.split(/\s+/).length / 3))),
          notes: "",
        };
        k++;
        return shot;
      }),
    };
  });

  return {
    title: fallbackTitle,
    logline: paragraphs[0]?.slice(0, 200) ?? "",
    characters: names.map((n, i) => ({
      name: n,
      role: i < 2 ? "lead" : "supporting",
      description: ages.has(n) ? `${ages.get(n)} years old.` : "",
      personality: "",
    })),
    scenes,
  };
}

function heuristicScreenplay(script: string, fallbackTitle: string): Breakdown {
  const lines = script.split("\n").map((l) => l.trim());
  const scenes: Breakdown["scenes"] = [];
  const names = new Set<string>();
  let scene: Breakdown["scenes"][number] | null = null;
  let para: string[] = [];

  const ensureScene = () => {
    if (!scene) {
      scene = { heading: "SCENE 1", location: "", timeOfDay: "", summary: "", shots: [] };
      scenes.push(scene);
    }
    return scene;
  };
  const mentioned = (text: string) =>
    [...names].filter((n) => new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));

  const flushAction = () => {
    const text = para.join(" ").trim();
    para = [];
    if (!text) return;
    // Uppercase words in action lines are character introductions by convention.
    for (const m of text.matchAll(/\b([A-Z]{2,}(?: [A-Z]{2,})?)\b/g)) {
      if (!/^(INT|EXT|CONT|DAY|NIGHT|THE|AND|POV|V\.O)$/.test(m[1]) && m[1].length <= 20) names.add(m[1]);
    }
    const s = ensureScene();
    const first = s.shots.length === 0;
    s.shots.push({
      shotSize: first ? "Establishing" : s.shots.length % 3 === 0 ? "Wide" : "Medium",
      cameraAngle: first ? "High angle" : "Eye level",
      cameraMove: first ? "Pan" : "Static",
      action: text.slice(0, 400),
      speaker: "",
      dialogue: "",
      characters: mentioned(text),
      duration: first ? 4 : 3,
      notes: "",
    });
    if (!s.summary) s.summary = text.slice(0, 160);
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) {
      flushAction();
      continue;
    }
    if (HEADING.test(line)) {
      flushAction();
      const [loc, tod] = line.replace(HEADING, "").trim().split(/\s+[-–—]\s+/);
      scene = { heading: line.toUpperCase(), location: (loc || "").trim(), timeOfDay: (tod || "").trim(), summary: "", shots: [] };
      scenes.push(scene);
      continue;
    }
    if (TRANSITION.test(line)) continue;
    if (CUE.test(line) && lines[i + 1]) {
      flushAction();
      const name = line.replace(/\s*\(.*\)$/, "").trim();
      names.add(name);
      const dialogue: string[] = [];
      let j = i + 1;
      for (; j < lines.length && lines[j]; j++) if (!/^\(.*\)$/.test(lines[j])) dialogue.push(lines[j]);
      i = j - 1;
      const s = ensureScene();
      const k = s.shots.filter((x) => x.dialogue).length;
      const text = dialogue.join(" ");
      s.shots.push({
        shotSize: ["Medium close-up", "Over-the-shoulder", "Close-up"][k % 3],
        cameraAngle: k % 3 === 1 ? "Over-the-shoulder" : "Eye level",
        cameraMove: "Static",
        action: `${name} speaks.`,
        speaker: name,
        dialogue: text,
        characters: [name],
        duration: Math.min(8, Math.max(2, Math.round(text.split(/\s+/).length / 2.5))),
        notes: "",
      });
      continue;
    }
    para.push(line);
  }
  flushAction();

  const all = scenes.flatMap((s) => s.shots);
  const counts = new Map<string, number>();
  all.forEach((s) => s.characters.forEach((c) => counts.set(c, (counts.get(c) ?? 0) + 1)));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);

  return {
    title: fallbackTitle,
    logline: scenes[0]?.summary ?? "",
    characters: ranked.slice(0, 12).map(([name, n], i) => ({
      name,
      role: i < 2 ? "lead" : n > 2 ? "supporting" : "minor",
      description: "",
      personality: "",
    })),
    scenes: scenes.filter((s) => s.shots.length).slice(0, 30),
  };
}

export function heuristicExpandIdea(idea: string) {
  return `INT. STUDIO - DAY

${idea.trim()}

HERO
This is where it starts.

EXT. CITY ROOFTOP - NIGHT

HERO stands at the edge, looking out over the lights.

HERO
No turning back now.`;
}

/** Offline poem staging: stanzas → scenes, lines → narrated shots with slow camera moves. */
export function heuristicPoem(poem: string, fallbackTitle: string): Breakdown {
  const stanzas = poem
    .replace(/\r\n?/g, "\n")
    .split(/\n\s*\n/)
    .map((st) => st.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((st) => st.length);
  const moves = ["Push in", "Pan", "Static", "Crane", "Pull out"];
  const sizes = ["Wide", "Medium", "Close-up", "Extreme wide", "Medium close-up"];
  let k = 0;
  return {
    title: fallbackTitle,
    logline: stanzas[0]?.[0] ?? "",
    characters: [],
    scenes: stanzas.slice(0, 30).map((lines, i) => ({
      heading: `STANZA ${i + 1}`,
      location: "",
      timeOfDay: "",
      summary: lines.join(" ").slice(0, 160),
      shots: lines.slice(0, 16).map((line) => {
        k++;
        return {
          shotSize: sizes[k % sizes.length],
          cameraAngle: k % 4 === 0 ? "Low angle" : "Eye level",
          cameraMove: moves[k % moves.length],
          action: `A quiet image that embodies: ${line}`,
          speaker: "NARRATOR",
          dialogue: line,
          characters: [],
          duration: Math.min(9, Math.max(3, Math.round(line.split(/\s+/).length / 2 + 1.5))),
          notes: "",
        };
      }),
    })),
  };
}
