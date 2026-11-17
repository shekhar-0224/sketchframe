#!/usr/bin/env node
/**
 * Rebuild the home-page demo (public/demo) from scripts/demo-story.json:
 *   1. draw sheets + panels through the real app (start the dev server first; FLUX.2 only),
 *   2. voice every line with Deepgram Aura-2 on Cloudflare Workers AI,
 *   3. animate each panel with Wan 2.2 on a free Hugging Face Space (scripts/animate-clip.py),
 *   4. swap the finished files into public/demo.
 * Work is staged in scripts/.demo-build, so a rerun skips steps that already finished.
 *
 *   node scripts/build-demo.mjs [--base http://localhost:3210] [--python python3] [--redraw] [--no-clips]
 */
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes(name) ? args[args.indexOf(name) + 1] : fallback);
const base = opt("--base", "http://localhost:3210");
const python = opt("--python", "python3");
const story = JSON.parse(await fs.readFile(path.join(root, "scripts/demo-story.json"), "utf8"));
const stage = path.join(root, "scripts/.demo-build");
const out = path.join(root, "public/demo");
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

async function env(name) {
  if (process.env[name]) return process.env[name];
  const line = (await fs.readFile(path.join(root, ".env.local"), "utf8")).split("\n").find((l) => l.startsWith(`${name}=`));
  if (!line) throw new Error(`${name} not found in env or .env.local`);
  return line.slice(name.length + 1).trim().replace(/^["']|["']$/g, "");
}

let cookie = "";
async function api(method, url, body) {
  const res = await fetch(base + url, { method, headers: { "content-type": "application/json", cookie }, body: body === undefined ? undefined : JSON.stringify(body) });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.headers.get("content-type")?.includes("json") ? res.json() : res.arrayBuffer();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(id, done, what) {
  for (const t0 = Date.now(); ; await sleep(4000)) {
    const b = await api("GET", `/api/projects/${id}`);
    if (done(b)) return b;
    if (Date.now() - t0 > 15 * 60_000) throw new Error(`Timed out waiting for ${what}`);
  }
}

async function speak(text, speaker) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${await env("CLOUDFLARE_ACCOUNT_ID")}/ai/run/@cf/deepgram/aura-2-en`, {
    method: "POST",
    headers: { Authorization: `Bearer ${await env("CLOUDFLARE_API_TOKEN")}`, "content-type": "application/json" },
    body: JSON.stringify({ text, speaker }),
  });
  if (!res.ok) throw new Error(`voice ${speaker} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return Buffer.from(await res.arrayBuffer());
}
const seconds = (file) => Number(execFileSync("afinfo", [file]).toString().match(/estimated duration: ([\d.]+)/)?.[1] ?? 3);
const panel = (i) => path.join(stage, `panel-${i}.jpg`);

// 1. Draw through the app. Every panel must come from FLUX.2: a fallback drawing would undo the point of the demo.
if (args.includes("--redraw")) await fs.rm(stage, { recursive: true, force: true });
await fs.mkdir(stage, { recursive: true });
if (!story.shots.every((_, i) => existsSync(panel(i)))) {
  await api("POST", "/api/auth/guest");
  const project = await api("POST", "/api/projects", { title: story.title, mode: "blank", aspectRatio: story.aspectRatio });
  log("project", project.id);
  try {
    const ids = {};
    for (const c of story.characters) {
      const row = await api("POST", `/api/projects/${project.id}/characters`, { name: c.name, role: c.role, description: c.description });
      ids[c.key] = row.id;
      await api("POST", `/api/characters/${row.id}/sheet`);
    }
    await waitFor(project.id, (b) => b.characters.every((c) => c.sheetStatus === "ready" || c.sheetStatus === "error"), "sheets");
    const shotIds = [];
    for (const s of story.shots) {
      const row = await api("POST", `/api/projects/${project.id}/shots`, {});
      await api("PATCH", `/api/shots/${row.id}`, {
        shotSize: s.shotSize,
        cameraAngle: s.cameraAngle,
        cameraMove: s.cameraMove,
        action: `${s.scene} ${s.action}`,
        characterIds: s.chars.map((k) => ids[k]),
      });
      shotIds.push(row.id);
    }
    await api("POST", `/api/projects/${project.id}/generate`, { shotIds, force: true });
    const bundle = await waitFor(project.id, (b) => b.shots.every((s) => s.imageStatus === "ready" || s.imageStatus === "error"), "panels");
    const drawn = shotIds.map((id) => bundle.shots.find((x) => x.id === id));
    const off = drawn.map((b, i) => (!b.imageUrl || !/flux/.test(b.lastModel ?? "") ? `#${i + 1} ${b.lastModel ?? b.imageError}` : null)).filter(Boolean);
    if (off.length) throw new Error(`Not drawn by FLUX.2 (today's free allowance may be used up; it resets 00:00 UTC): ${off.join(", ")}`);
    for (const [i, b] of drawn.entries()) await sharp(Buffer.from(await api("GET", b.imageUrl))).jpeg({ quality: 86 }).toFile(panel(i));
    log("panels drawn");
  } finally {
    await api("DELETE", `/api/projects/${project.id}`);
  }
}

// 2 + 3. Voice and animate each shot (skipping what's already staged).
const shots = [];
for (const [i, s] of story.shots.entries()) {
  const voice = path.join(stage, `voice-${i}.mp3`);
  if (!existsSync(voice)) await fs.writeFile(voice, await speak(s.dialogue, story.voices[s.speaker]));
  const talk = seconds(voice);
  const clip = path.join(stage, `clip-${i}.mp4`);
  if (!args.includes("--no-clips") && !existsSync(clip)) {
    try {
      const HF_TOKEN = await env("HF_TOKEN").catch(() => "");
      execFileSync(python, [path.join(root, "scripts/animate-clip.py"), panel(i), clip, String(Math.max(3.5, talk + 0.8)), s.motion], {
        stdio: "inherit",
        env: { ...process.env, HF_TOKEN },
      });
      log(`clip ${i + 1} animated`);
    } catch {
      log(`clip ${i + 1} failed (free GPU quota?) — it stays a still panel; rerun later to retry`);
    }
  }
  shots.push({
    id: `demo-${i}`,
    sceneId: s.scene.split(".")[0],
    duration: Math.max(3.5, Math.round((talk + 1.2) * 10) / 10),
    cameraMove: s.cameraMove,
    speaker: s.speaker === "NARRATOR" ? "" : s.speaker[0] + s.speaker.slice(1).toLowerCase(),
    dialogue: s.dialogue,
    imageUrl: `/demo/panel-${i}.jpg`,
    clipUrl: existsSync(clip) ? `/demo/clip-${i}.mp4` : null,
    audioUrl: `/demo/voice-${i}.mp3`,
    depthUrl: null,
    effects: null,
    scene: s.scene,
    action: s.action,
    notes: "",
    promptExtra: "",
    interior: s.interior,
    voiceGender: s.speaker === "OTTO" || s.speaker === "NARRATOR" ? "male" : "female",
  });
}

// 4. Swap the finished set into public/demo.
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
for (const f of await fs.readdir(stage)) await fs.copyFile(path.join(stage, f), path.join(out, f));
await fs.writeFile(path.join(out, "demo.json"), JSON.stringify({ title: story.title, logline: story.logline, aspectRatio: story.aspectRatio, shots }, null, 1));
log(`wrote ${shots.length} shots (${shots.filter((s) => s.clipUrl).length} animated), ${shots.reduce((a, s) => a + s.duration, 0).toFixed(1)}s`);
