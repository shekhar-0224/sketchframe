#!/usr/bin/env node
/**
 * Consistency eval, step 1: draw the fixed set (eval/set.json) through the real app API,
 * exactly as a free-plan guest would, then score it (eval/score.mjs).
 *
 *   node eval/run.mjs [label] [--base http://localhost:3210]
 *
 * Writes eval/runs/<date>-<label>/ with sheets/, panels/, run.json, scores.json, contact.png.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { score } from "./score.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith("--")) ?? "run";
const base = args.includes("--base") ? args[args.indexOf("--base") + 1] : "http://localhost:3210";
const set = JSON.parse(await fs.readFile(path.join(here, "set.json"), "utf8"));
const out = path.join(here, "runs", `${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "")}-${label}`);
await fs.mkdir(path.join(out, "sheets"), { recursive: true });
await fs.mkdir(path.join(out, "panels"), { recursive: true });

let cookie = "";
async function api(method, url, body) {
  const res = await fetch(base + url, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${(await res.text()).slice(0, 200)}`);
  return res.headers.get("content-type")?.includes("json") ? res.json() : res.arrayBuffer();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...m) => console.log(new Date().toISOString().slice(11, 19), ...m);

async function waitFor(projectId, done, what, timeoutMs = 15 * 60_000) {
  const t0 = Date.now();
  for (;;) {
    const b = await api("GET", `/api/projects/${projectId}`);
    if (done(b)) return b;
    if (Date.now() - t0 > timeoutMs) throw new Error(`Timed out waiting for ${what}`);
    await sleep(5000);
  }
}

await api("POST", "/api/auth/guest");
const project = await api("POST", "/api/projects", { title: `Eval ${set.name} ${label}`, mode: "blank", aspectRatio: set.aspectRatio });
log("project", project.id);

// Characters, then their sheets (drawn first, like the app's Cast step).
const ids = {};
for (const c of set.characters) {
  const row = await api("POST", `/api/projects/${project.id}/characters`, { name: c.name, role: c.role, description: c.description });
  ids[c.key] = row.id;
  await api("POST", `/api/characters/${row.id}/sheet`);
}
log("drawing sheets…");
let bundle = await waitFor(project.id, (b) => b.characters.every((c) => c.sheetStatus === "ready" || c.sheetStatus === "error"), "sheets");

// Shots.
const shotIds = [];
for (const s of set.shots) {
  const row = await api("POST", `/api/projects/${project.id}/shots`, {});
  await api("PATCH", `/api/shots/${row.id}`, {
    shotSize: s.shotSize,
    cameraAngle: s.cameraAngle,
    cameraMove: s.cameraMove,
    action: s.action,
    characterIds: s.chars.map((k) => ids[k]),
  });
  shotIds.push(row.id);
}
await api("POST", `/api/projects/${project.id}/generate`, { shotIds, force: true });
log("drawing", shotIds.length, "panels…");
bundle = await waitFor(project.id, (b) => b.shots.every((s) => s.imageStatus === "ready" || s.imageStatus === "error"), "panels");

// Save everything locally so scoring and the contact sheet don't depend on the server.
const record = { label, base, project: project.id, set: set.name, at: new Date().toISOString(), characters: [], panels: [] };
for (const c of set.characters) {
  const ch = bundle.characters.find((x) => x.id === ids[c.key]);
  const refs = ch.references.filter((r) => r.kind !== "upload");
  const files = [];
  for (const r of refs) {
    const f = `sheets/${c.key}-${r.kind}.png`;
    await fs.writeFile(path.join(out, f), Buffer.from(await api("GET", r.url)));
    files.push(f);
  }
  record.characters.push({ key: c.key, name: c.name, status: ch.sheetStatus, error: ch.sheetError, files });
}
for (const [i, id] of shotIds.entries()) {
  const s = bundle.shots.find((x) => x.id === id);
  const f = s.imageUrl ? `panels/${String(i + 1).padStart(2, "0")}.png` : null;
  if (f) await fs.writeFile(path.join(out, f), Buffer.from(await api("GET", s.imageUrl)));
  record.panels.push({ n: i + 1, ...set.shots[i], file: f, model: s.lastModel, status: s.imageStatus, error: s.imageError });
}
await fs.writeFile(path.join(out, "run.json"), JSON.stringify(record, null, 2));
log("saved to", path.relative(process.cwd(), out));

await score(out);
