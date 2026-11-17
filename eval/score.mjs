#!/usr/bin/env node
/**
 * Score a run from eval/run.mjs with a vision model, and build a labelled contact sheet.
 *
 *   node eval/score.mjs eval/runs/<run>
 *
 * Per panel: style 1-5 (black-and-white hand-drawn sketch, no colour, no realism) and, for each
 * character meant to be in frame, identity 1-5 against that character's sheet.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const JUDGE_MODEL = process.env.EVAL_JUDGE_MODEL || "gpt-5-mini";

const JUDGE = `You are a strict art director checking storyboard and comic panels for character consistency.
You get each character's reference sheet (labelled), then ONE panel to check.
Score honestly; most AI panels drift. Return ONLY JSON:
{
  "style": 1-5,            // 5 = clean black-and-white hand-drawn ink/pencil sketch; 1 = colour, photo or 3D look
  "has_colour": boolean,   // any visible colour or tint
  "characters": [          // one entry per character listed as expected in this panel
    { "name": string,
      "present": boolean,  // can you find them in the panel at all
      "identity": 1-5,     // 5 = unmistakably the same design as their sheet (face, hair, build, outfit, props); 1 = a different person/animal
      "issues": string }   // short: what differs, or ""
  ],
  "extra_people": boolean, // recurring-looking characters that should not be there
  "notes": string          // one short sentence
}`;

async function openaiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  const env = await fs.readFile(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", ".env.local"), "utf8");
  const line = env.split("\n").find((l) => l.startsWith("OPENAI_API_KEY="));
  if (!line) throw new Error("OPENAI_API_KEY not found in env or .env.local");
  return line.slice("OPENAI_API_KEY=".length).trim().replace(/^["']|["']$/g, "");
}

const dataUrl = async (file) => `data:image/png;base64,${(await sharp(file).resize(1024, 1024, { fit: "inside" }).png().toBuffer()).toString("base64")}`;

async function judge(key, dir, run, panel) {
  const cast = run.characters.filter((c) => panel.chars.includes(c.key));
  const content = [{ type: "text", text: `Characters expected in this panel: ${cast.map((c) => c.name).join(", ") || "none"}.` }];
  for (const c of cast) {
    for (const f of c.files) {
      content.push({ type: "text", text: `Reference sheet — ${c.name} (${path.basename(f, ".png").split("-").slice(1).join("-")})` });
      content.push({ type: "image_url", image_url: { url: await dataUrl(path.join(dir, f)) } });
    }
  }
  content.push({ type: "text", text: `PANEL TO CHECK — ${panel.shotSize}: ${panel.action}` });
  content.push({ type: "image_url", image_url: { url: await dataUrl(path.join(dir, panel.file)) } });

  for (let attempt = 0; ; attempt++) {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: JUDGE_MODEL,
        reasoning_effort: "low",
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: JUDGE }, { role: "user", content }],
      }),
      signal: AbortSignal.timeout(180_000),
    });
    if (res.ok) return JSON.parse((await res.json()).choices[0].message.content);
    if (attempt >= 2 || (res.status !== 429 && res.status < 500)) throw new Error(`judge ${res.status} ${(await res.text()).slice(0, 200)}`);
    await new Promise((r) => setTimeout(r, 5000 * (attempt + 1)));
  }
}

const mean = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) / 100 : null);

async function contactSheet(dir, run, scores) {
  const W = 400, H = 225, LABEL = 46, COLS = 4, PAD = 10;
  const tiles = [];
  for (const p of run.panels) {
    const s = scores.panels.find((x) => x.n === p.n);
    const img = p.file
      ? await sharp(path.join(dir, p.file)).resize(W, H, { fit: "contain", background: "#fff" }).png().toBuffer()
      : await sharp({ create: { width: W, height: H, channels: 3, background: "#ddd" } }).png().toBuffer();
    const ids = (s?.characters ?? []).map((c) => `${c.name} ${c.present ? c.identity : "✗"}`).join("  ");
    const esc = (t) => String(t).replace(/[<&>]/g, (m) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;" })[m]);
    const label = Buffer.from(
      `<svg width="${W}" height="${LABEL}" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="#fff"/>` +
        `<text x="6" y="18" font-family="Helvetica" font-size="15" font-weight="bold">#${p.n} ${esc(p.shotSize)} · style ${s?.style ?? "–"}${s?.has_colour ? " · COLOUR" : ""}</text>` +
        `<text x="6" y="38" font-family="Helvetica" font-size="14">${esc(ids || "no characters")}</text></svg>`,
    );
    tiles.push(await sharp({ create: { width: W, height: H + LABEL, channels: 3, background: "#fff" } })
      .composite([{ input: img, top: 0, left: 0 }, { input: label, top: H, left: 0 }]).png().toBuffer());
  }
  const sheetFiles = run.characters.flatMap((c) => c.files);
  const SH = 300;
  const sheetImgs = await Promise.all(sheetFiles.map((f) => sharp(path.join(dir, f)).resize({ height: SH }).png().toBuffer()));
  const sheetWidths = await Promise.all(sheetImgs.map(async (b) => (await sharp(b).metadata()).width));
  const rows = Math.ceil(tiles.length / COLS);
  const width = COLS * (W + PAD) + PAD;
  const top = SH + PAD * 2;
  const composites = [];
  let x = PAD;
  sheetImgs.forEach((b, i) => {
    if (x + sheetWidths[i] <= width) composites.push({ input: b, top: PAD, left: x });
    x += sheetWidths[i] + PAD;
  });
  tiles.forEach((t, i) => composites.push({ input: t, top: top + Math.floor(i / COLS) * (H + LABEL + PAD), left: PAD + (i % COLS) * (W + PAD) }));
  await sharp({ create: { width, height: top + rows * (H + LABEL + PAD), channels: 3, background: "#eee" } })
    .composite(composites).png().toFile(path.join(dir, "contact.png"));
}

export async function score(dir) {
  const run = JSON.parse(await fs.readFile(path.join(dir, "run.json"), "utf8"));
  // EVAL_JUDGE=none: just the contact sheet, for eyeballing when no judge key is available.
  if (process.env.EVAL_JUDGE === "none") {
    await contactSheet(dir, run, { panels: [] });
    console.log("contact sheet only (EVAL_JUDGE=none)");
    return null;
  }
  const key = await openaiKey();
  const panels = [];
  for (const p of run.panels) {
    if (!p.file) { panels.push({ n: p.n, error: p.error ?? "not drawn", characters: [] }); continue; }
    const r = await judge(key, dir, run, p);
    panels.push({ n: p.n, model: p.model, ...r });
    console.log(`#${p.n} style ${r.style}${r.has_colour ? " colour" : ""} | ${(r.characters ?? []).map((c) => `${c.name} ${c.present ? c.identity : "missing"}`).join(", ")}`);
  }
  const pairs = panels.flatMap((p) => p.characters ?? []);
  const identity = pairs.map((c) => (c.present ? c.identity : 1));
  const summary = {
    judge: JUDGE_MODEL,
    panels_drawn: panels.filter((p) => !p.error).length,
    panels_total: panels.length,
    identity_mean: mean(identity),
    identity_pass_rate: identity.length ? Math.round((identity.filter((x) => x >= 4).length / identity.length) * 100) : null,
    missing_characters: pairs.filter((c) => !c.present).length,
    style_mean: mean(panels.filter((p) => p.style).map((p) => p.style)),
    colour_panels: panels.filter((p) => p.has_colour).length,
    extra_people_panels: panels.filter((p) => p.extra_people).length,
    by_character: Object.fromEntries(
      run.characters.map((c) => [c.name, mean(pairs.filter((x) => x.name.toUpperCase() === c.name).map((x) => (x.present ? x.identity : 1)))]),
    ),
    models: [...new Set(run.panels.map((p) => p.model).filter(Boolean))],
  };
  await fs.writeFile(path.join(dir, "scores.json"), JSON.stringify({ summary, panels }, null, 2));
  await contactSheet(dir, run, { panels });
  console.log("\nSUMMARY", JSON.stringify(summary, null, 2));
  return summary;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error("usage: node eval/score.mjs eval/runs/<run>");
  await score(path.resolve(process.argv[2]));
}
