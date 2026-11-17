import type { Character, Project, Scene, Shot } from "@/lib/db/schema";

/**
 * The hero art style. Every image prompt starts with this so panels, sheets and
 * sketch-to-image results all read as one hand.
 */
export const SKETCH_STYLE = `ART STYLE (mandatory): professional film storyboard sketch.
Black graphite pencil and ink line art on clean white paper. High contrast, confident contour lines,
minimal hatching only for key shadows. Mostly white paper: line work first, with no dense cross-hatching
and no large dark fills. No colour, no grey wash, no painterly rendering, no photographic detail.
Clear silhouettes, readable staging, simplified backgrounds.
Never draw text, captions, speech balloons, watermarks, panel numbers or frame borders.`;

/** The default look: frames from a black-and-white film, not drawings — and never comics. */
export const FILM_STYLE = `ART STYLE (mandatory): black-and-white cinematic film still.
Shot on 35mm black-and-white film: strictly monochrome, rich deep blacks, bright highlights, full grey scale,
dramatic chiaroscuro lighting, motivated light sources, soft natural film grain, shallow depth of field.
Realistic cinematic look, like a frame from a classic black-and-white movie. Never a comic, manga, anime,
cartoon or illustration look; no colour or colour tint of any kind.
Never draw text, captions, speech balloons, watermarks, panel numbers or frame borders.`;

export type ArtStyle = "film" | "sketch";
/** Pencil sketch by default; ART_STYLE=film switches to black-and-white film stills. */
export const artStyle = (): ArtStyle => (process.env.ART_STYLE === "film" ? "film" : "sketch");
export const STYLE_TEXT = (): string => (artStyle() === "film" ? FILM_STYLE : SKETCH_STYLE);

export const BREAKDOWN_SYSTEM = `You are a veteran storyboard artist and first AD breaking a script into a shot list for a film storyboard.
Return ONLY JSON matching this TypeScript type:
{
  "title": string,
  "logline": string,            // one sentence
  "characters": Array<{
    "name": string,             // as written in the script, uppercase-insensitive unique
    "role": "lead" | "supporting" | "minor",
    "description": string,      // VISUAL bible, 40-80 words, concrete, no personality. MUST start with gender + age ("Woman, early 30s."),
                                //   then build, face, hair colour + length + style, clothing, signature props. Keep every detail the script gives.
    "personality": string       // short
  }>,
  "scenes": Array<{
    "heading": string,          // e.g. "INT. DINER - NIGHT"
    "location": string,
    "timeOfDay": string,
    "summary": string,
    "shots": Array<{
      "shotSize": string,       // one of: Establishing, Extreme wide, Wide, Full, Medium wide, Medium, Medium close-up, Close-up, Extreme close-up, Insert, Two-shot, Over-the-shoulder
      "cameraAngle": string,    // one of: Eye level, Low angle, High angle, Bird's eye, Worm's eye, Dutch tilt, Over-the-shoulder, POV, Profile
      "cameraMove": string,     // one of: Static, Pan, Tilt, Push in, Pull out, Dolly, Tracking, Crane, Handheld, Zoom
      "action": string,         // what is SEEN in the frame, present tense, 1-2 sentences, name characters explicitly
      "speaker": string,        // character name if there is dialogue, else ""
      "dialogue": string,       // the line spoken in this shot, else ""
      "characters": string[],   // names of characters visible in frame
      "duration": number,       // seconds, 1.5-8
      "notes": string           // optional staging/lighting note
    }>
  }>
}
Rules: vary shot sizes and angles like a real storyboard (establish, then coverage, then inserts/reactions).
Keep every line of dialogue attached to a shot. Aim for 3-8 shots per scene and at most 60 shots total.`;

/**
 * Compact breakdown for the free tier, whose replies are capped at a few thousand
 * characters: same JSON shape, but short strings and at most ~10 shots.
 */
export const BREAKDOWN_LITE = `You turn a story into a short film shot list. Return ONLY compact JSON (no prose):
{"title":"","logline":"","characters":[{"name":"","role":"lead|supporting|minor","description":"","personality":""}],
"scenes":[{"heading":"","location":"","timeOfDay":"","summary":"","shots":[{"shotSize":"","cameraAngle":"","cameraMove":"","action":"","speaker":"","dialogue":"","characters":[],"duration":3,"notes":""}]}]}
Rules: cover the WHOLE story from beginning to end — the last shot shows how it ends. Never stop early.
Every named person is a character; description MUST start with gender + age, then hair and clothes (max 25 words).
2-4 scenes, 2-4 shots each, max 10 shots total. action = what we SEE, max 20 words, names included.
shotSize: Establishing|Wide|Medium|Close-up|Over-the-shoulder|Insert. cameraAngle: Eye level|Low angle|High angle. cameraMove: Static|Pan|Push in|Tracking.
Quoted words go in dialogue (speaker = who says or reads it, else NARRATOR). summary max 15 words. notes "".`;

/**
 * Poems / lyrics: there is no dialogue, so every line becomes a visual beat read by a
 * narrator. Same JSON shape as BREAKDOWN_SYSTEM so the rest of the pipeline is unchanged.
 */
export const POEM_SYSTEM = `You are a director adapting a POEM into a short black-and-white film.
Return ONLY JSON with exactly the same shape as a screenplay breakdown:
{ "title", "logline", "characters": [{ "name", "role", "description", "personality" }],
  "scenes": [{ "heading", "location", "timeOfDay", "summary", "shots": [{ "shotSize", "cameraAngle", "cameraMove",
  "action", "speaker", "dialogue", "characters", "duration", "notes" }] }] }
Rules:
- Each STANZA becomes one scene. "heading" is a short visual setting (e.g. "EXT. WINTER FIELD - DUSK"), "summary" its mood.
- Each LINE (or tightly linked couplet) becomes one shot. "dialogue" is that line copied VERBATIM; "speaker" is "NARRATOR".
- "action" describes the concrete IMAGE that embodies the line (visual metaphor, not the words), present tense.
- Invent 1-3 recurring figures the poem implies (the speaker, a lover, a child…) as characters with a VISUAL bible
  (MUST start with gender + age, then hair, clothing, props). Use them for continuity across shots.
- Vary shot sizes; favour slow camera moves (Push in, Pan, Crane, Static). duration = time to read the line slowly + 1s (3-9 s).`;

export const IDEA_SYSTEM = `You are a screenwriter. Expand the user's idea into a short, filmable screenplay excerpt
(2-4 scenes, 1-2 pages) in standard screenplay format: scene headings (INT./EXT.), action lines,
CHARACTER NAMES in caps above dialogue. Give every character a vivid visual introduction. Return only the screenplay text.`;

export function viewPrompt(c: Character, view: string, hasAnchor: boolean) {
  const viewText: Record<string, string> = {
    front: "full-body FRONT view, standing neutral A-pose",
    three_quarter: "full-body THREE-QUARTER view (turned 45° to the right), standing",
    side: "full-body SIDE PROFILE view facing right, standing",
    expressions:
      "EXPRESSION SHEET: four head-and-shoulders drawings of the same character in a 2x2 grid — neutral, happy, angry, worried",
  };
  return `${STYLE_TEXT()}

Character model sheet for "${c.name}". ${viewText[view] ?? view}.
Plain white background, no scenery.
${view === "expressions" ? "" : "Frame the ENTIRE figure: top of the head to the soles of the feet fully inside the image, centered, with clear white margin above the head and below the feet. Never crop the head or feet."}
Character description: ${c.description || "(none given)"}
${
  hasAnchor
    ? "The attached reference shows this exact character. Match face, hairstyle, body proportions, clothing and accessories EXACTLY — only the viewing angle changes."
    : "This drawing becomes the canonical design that every later panel must match, so make the design clear and distinctive."
}`;
}

export function panelPrompt(opts: {
  project: Project;
  scene: Scene | null;
  shot: Shot;
  cast: Character[];
  hasLayout: boolean;
}) {
  const { project, scene, shot, cast, hasLayout } = opts;
  const castLines = cast.map((c) => `- ${c.name}: ${c.description}`).join("\n");
  return `${STYLE_TEXT()}

${artStyle() === "film" ? "FILM FRAME" : "STORYBOARD PANEL"}, ${project.aspectRatio} frame.
Shot: ${shot.shotSize} | Angle: ${shot.cameraAngle} | Camera: ${shot.cameraMove}
${scene ? `Scene: ${scene.heading}${scene.timeOfDay ? ` (${scene.timeOfDay})` : ""}. ${scene.summary}` : ""}
Action in frame: ${shot.action || "(establishing frame)"}
${
  !shot.dialogue
    ? ""
    : /narrator|v\.?o\.?/i.test(shot.speaker)
      ? `Narration over this shot (do NOT draw the words): "${shot.dialogue}" — illustrate its imagery and mood.`
      : `Moment: ${shot.speaker || "someone"} says "${shot.dialogue}" — show the acting, do NOT draw the words.`
}
${shot.notes ? `Staging notes: ${shot.notes}` : ""}
${cast.length ? `Characters in frame (each has a labelled reference sheet above — reproduce face, hair, build, costume and props EXACTLY as in their sheet; do not invent other recurring characters):\n${castLines}` : "No named characters in frame."}
${hasLayout ? "LAYOUT: follow the attached rough sketch's composition, camera position, character placement and poses closely, but render it fully in the art style above." : ""}
${shot.promptExtra ? `Additional direction: ${shot.promptExtra}` : ""}`.replace(/\n{3,}/g, "\n\n");
}
