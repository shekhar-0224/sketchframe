"use client";

import type { EffectId } from "@/lib/effects";
import { drawEffects, FilmFinish } from "./overlays";
import { ParallaxRenderer, parallaxFor } from "./parallax";

/**
 * Comic-movie engine. One renderer drives both the on-screen player and the video
 * export, so the export is exactly what you previewed.
 *
 * Per shot it draws either the AI clip (if animated) or the still panel as a 2.5D
 * "motion comic" shot: depth-based parallax along the shot's camera move, plus subtle
 * breathing. Weather/light overlays, dialogue captions and a paper-grain finish go on
 * top, and shots blend with a dissolve (same scene) or a dip to black (scene change).
 */

export type MovieShot = {
  id: string;
  sceneId: string | null;
  duration: number;
  cameraMove: string;
  speaker: string;
  dialogue: string;
  imageUrl: string | null;
  clipUrl: string | null;
  audioUrl: string | null;
  /** Depth map (near = white) for 2.5D parallax; null = flat camera move. */
  depthUrl: string | null;
  effects: EffectId[];
  /** Interior shots get lighter weather (rain on the windows, not in the room). */
  interior: boolean;
  /** For free browser voices: rough voice character of the speaker. */
  voiceGender?: "female" | "male" | "neutral";
};

type Assets = { img?: HTMLImageElement; depth?: HTMLImageElement; video?: HTMLVideoElement; audio?: AudioBuffer };

const DISSOLVE = 0.35;
const DIP = 0.3;

const ease = (x: number) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Camera move → scale + offset (fractions of the frame) at progress p. Free "animation". */
function camera(move: string, p: number, seed: number) {
  const e = ease(p);
  const m = move.toLowerCase();
  if (/push|dolly|zoom/.test(m)) return { s: lerp(1.03, 1.17, e), x: 0, y: lerp(0, -0.02, e) };
  if (/pull/.test(m)) return { s: lerp(1.17, 1.03, e), x: 0, y: lerp(-0.02, 0, e) };
  if (/pan/.test(m)) return { s: 1.12, x: lerp(0.045, -0.045, e), y: 0 };
  if (/track/.test(m)) return { s: lerp(1.1, 1.14, e), x: lerp(-0.04, 0.04, e), y: 0 };
  if (/tilt/.test(m)) return { s: 1.12, x: 0, y: lerp(0.04, -0.04, e) };
  if (/crane/.test(m)) return { s: lerp(1.16, 1.04, e), x: 0, y: lerp(-0.045, 0.02, e) };
  if (/hand/.test(m)) {
    const t = p * 9 + seed;
    return { s: 1.08, x: Math.sin(t * 2.1) * 0.006 + Math.sin(t * 5.3) * 0.003, y: Math.cos(t * 1.7) * 0.006 };
  }
  // Static: a barely-there drift keeps stills alive.
  return { s: lerp(1.02, 1.06, e), x: 0, y: 0 };
}

export class MovieEngine {
  shots: MovieShot[] = [];
  starts: number[] = [];
  total = 0;
  private assets = new Map<string, Assets>();
  private fonts = { display: "monospace", body: "sans-serif" };
  private parallax: ParallaxRenderer | null = null;
  private finish: FilmFinish | null = null;
  /** Off by default only for tests; the player and export always use 2.5D. */
  depthEnabled = true;

  constructor(public width: number, public height: number) {
    if (typeof document !== "undefined") {
      const css = getComputedStyle(document.documentElement);
      this.fonts.display = css.getPropertyValue("--nf-display").trim() || "monospace";
      this.fonts.body = css.getPropertyValue("--nf-body").trim() || "sans-serif";
    }
  }

  setShots(shots: MovieShot[]) {
    this.shots = shots;
    let t = 0;
    this.starts = shots.map((s) => {
      const at = t;
      t += Math.max(0.5, s.duration);
      return at;
    });
    this.total = t;
  }

  /** Load panels, clips and voice audio. Resolves when everything that exists is ready. */
  async load(audioCtx?: BaseAudioContext) {
    await Promise.all(
      this.shots.map(async (s) => {
        const a: Assets = this.assets.get(s.id) ?? {};
        if (s.imageUrl && a.img?.dataset.src !== s.imageUrl) a.img = await loadImage(s.imageUrl);
        if (s.depthUrl && a.depth?.dataset.src !== s.depthUrl) a.depth = await loadImage(s.depthUrl);
        if (!s.depthUrl) a.depth = undefined;
        if (s.clipUrl && a.video?.dataset.src !== s.clipUrl) a.video = await loadVideo(s.clipUrl);
        if (!s.clipUrl) a.video = undefined;
        if (s.audioUrl && audioCtx) {
          try {
            a.audio = await audioCtx.decodeAudioData(await (await fetch(s.audioUrl)).arrayBuffer());
          } catch {
            a.audio = undefined;
          }
        }
        this.assets.set(s.id, a);
      }),
    );
  }

  audioFor(id: string) {
    return this.assets.get(id)?.audio;
  }

  indexAt(t: number) {
    let i = 0;
    while (i + 1 < this.starts.length && this.starts[i + 1] <= t) i++;
    return i;
  }

  /** Keep AI clips playing in step with the timeline (called every frame). */
  syncVideos(t: number, playing: boolean) {
    this.shots.forEach((s, i) => {
      const v = this.assets.get(s.id)?.video;
      if (!v) return;
      const local = t - this.starts[i];
      const active = local >= -DISSOLVE && local < s.duration + DISSOLVE;
      if (!active || !playing) {
        if (!v.paused) v.pause();
        if (!active) return;
      }
      const want = Math.min(Math.max(local, 0), Math.max(0, v.duration - 0.05));
      if (Math.abs(v.currentTime - want) > 0.25) v.currentTime = want;
      if (playing && local >= 0 && local < v.duration && v.paused) void v.play().catch(() => {});
    });
  }

  draw(ctx: CanvasRenderingContext2D, t: number, opts: { captions: boolean }) {
    const { width: W, height: H } = this;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, W, H);
    if (!this.shots.length) return;
    const i = this.indexAt(t);
    const shot = this.shots[i];
    const local = t - this.starts[i];
    const next = this.shots[i + 1];
    const sceneCut = next && next.sceneId !== shot.sceneId;

    let alpha = 1;
    // Dip to black around scene changes.
    if (sceneCut && local > shot.duration - DIP) alpha = 1 - ease((local - (shot.duration - DIP)) / DIP);
    const prev = this.shots[i - 1];
    if (prev && prev.sceneId !== shot.sceneId && local < DIP) alpha = ease(local / DIP);

    this.drawShot(ctx, i, local, alpha, t);
    // Dissolve into the next shot within a scene.
    if (next && !sceneCut && local > shot.duration - DISSOLVE) {
      this.drawShot(ctx, i + 1, 0, ease((local - (shot.duration - DISSOLVE)) / DISSOLVE), t);
    }
    (this.finish ??= new FilmFinish()).draw(ctx, W, H, t);
    if (opts.captions && shot.dialogue && alpha > 0.05) this.drawCaption(ctx, shot, Math.min(alpha, ease(local / 0.2)));
  }

  private drawShot(ctx: CanvasRenderingContext2D, i: number, local: number, alpha: number, t: number) {
    const { width: W, height: H } = this;
    const s = this.shots[i];
    const a = this.assets.get(s.id);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, W, H);
    const video = a?.video && a.video.readyState >= 2 ? a.video : null;
    const src: CanvasImageSource | null = video ?? a?.img ?? null;
    if (src) {
      if (!video && a?.img && a.depth && this.depthEnabled && (this.parallax ??= ParallaxRenderer.create(W, H))) {
        // 2.5D: depth-based parallax along the camera move.
        const frame = this.parallax.render(a.img, a.depth, parallaxFor(s.cameraMove, local / s.duration, t, i * 1.7));
        ctx.drawImage(frame, 0, 0, W, H);
      } else {
        const sw = video ? video.videoWidth : (a!.img as HTMLImageElement).naturalWidth;
        const sh = video ? video.videoHeight : (a!.img as HTMLImageElement).naturalHeight;
        const cover = Math.max(W / sw, H / sh);
        // Clips carry their own motion; stills without depth get a flat camera move.
        const cam = video ? { s: 1, x: 0, y: 0 } : camera(s.cameraMove, local / s.duration, i * 1.7);
        const dw = sw * cover * cam.s;
        const dh = sh * cover * cam.s;
        ctx.drawImage(src, (W - dw) / 2 + cam.x * W, (H - dh) / 2 + cam.y * H, dw, dh);
      }
    } else {
      ctx.fillStyle = "#000";
      ctx.font = `${Math.round(H * 0.045)}px ${this.fonts.display}`;
      ctx.textAlign = "center";
      ctx.fillText(`shot ${i + 1} — not drawn yet`, W / 2, H / 2);
    }
    ctx.restore();
    drawEffects(ctx, W, H, s.effects, { t, local, duration: s.duration, interior: s.interior, alpha, seed: i + 1 });
  }

  /** Comic caption box: pixel-font speaker tag over a white box with an ink border. */
  private drawCaption(ctx: CanvasRenderingContext2D, s: MovieShot, alpha: number) {
    const { width: W, height: H } = this;
    const size = Math.round(H * 0.036);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `500 ${size}px ${this.fonts.body}`;
    const maxW = W * 0.72;
    // Narration (poems, V.O.) reads like verse: italic, no quotes, no name tag.
    const narration = !s.speaker.trim() || /narrator|v\.?o\.?/i.test(s.speaker);
    if (narration) ctx.font = `italic 500 ${size}px ${this.fonts.body}`;
    const lines = wrap(ctx, narration ? s.dialogue : `“${s.dialogue}”`, maxW).slice(0, 3);
    const boxW = Math.min(maxW, Math.max(...lines.map((l) => ctx.measureText(l).width))) + size * 1.6;
    const lineH = size * 1.3;
    const boxH = lines.length * lineH + size * 1.1;
    const x = (W - boxW) / 2;
    const y = H - boxH - H * 0.06;
    ctx.fillStyle = "#000";
    ctx.fillRect(x + 5, y + 5, boxW, boxH);
    ctx.fillStyle = "#fff";
    ctx.fillRect(x, y, boxW, boxH);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#000";
    ctx.strokeRect(x, y, boxW, boxH);
    ctx.fillStyle = "#000";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    lines.forEach((l, k) => ctx.fillText(l, W / 2, y + size * 0.55 + k * lineH));
    if (s.speaker && !narration) {
      ctx.font = `${Math.round(size * 0.8)}px ${this.fonts.display}`;
      const label = s.speaker.toUpperCase();
      const lw = ctx.measureText(label).width + size;
      ctx.fillStyle = "#000";
      ctx.fillRect(x + size * 0.5, y - size * 0.75, lw, size * 1.15);
      ctx.fillStyle = "#fff";
      ctx.textAlign = "left";
      ctx.fillText(label, x + size, y - size * 0.55);
    }
    ctx.restore();
  }

  dispose() {
    for (const a of this.assets.values()) a.video?.pause();
    this.assets.clear();
    this.parallax?.dispose();
    this.parallax = null;
  }
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxW: number) {
  const words = text.split(/\s+/);
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(next).width > maxW && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement | undefined>((resolve) => {
    const img = new Image();
    img.dataset.src = src;
    img.onload = () => resolve(img);
    img.onerror = () => resolve(undefined);
    img.src = src;
  });
}

function loadVideo(src: string) {
  return new Promise<HTMLVideoElement | undefined>((resolve) => {
    const v = document.createElement("video");
    v.dataset.src = src;
    v.muted = true; // Clips are silent here; dialogue comes from the voice track.
    v.playsInline = true;
    v.preload = "auto";
    v.oncanplaythrough = () => resolve(v);
    v.onerror = () => resolve(undefined);
    v.src = src;
    v.load();
  });
}

/**
 * Real-time export: renders the timeline onto a canvas and records it together with
 * the voice track (Web Audio), producing MP4 where the browser supports it, else WebM.
 */
export async function exportMovie(engine: MovieEngine, opts: { captions: boolean; onProgress: (p: number) => void }) {
  const canvas = document.createElement("canvas");
  canvas.width = engine.width;
  canvas.height = engine.height;
  const ctx = canvas.getContext("2d")!;
  const audioCtx = new AudioContext();
  await engine.load(audioCtx);
  const dest = audioCtx.createMediaStreamDestination();

  const stream = new MediaStream([...canvas.captureStream(30).getVideoTracks(), ...dest.stream.getAudioTracks()]);
  const mime =
    ["video/mp4;codecs=avc1.42E01E,mp4a.40.2", "video/mp4", "video/webm;codecs=vp9,opus", "video/webm"].find((m) =>
      MediaRecorder.isTypeSupported(m),
    ) ?? "";
  const rec = new MediaRecorder(stream, { ...(mime && { mimeType: mime }), videoBitsPerSecond: 6_000_000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((r) => (rec.onstop = () => r()));

  rec.start(500);
  const t0 = audioCtx.currentTime + 0.1;
  engine.shots.forEach((s, i) => {
    const buf = engine.audioFor(s.id);
    if (!buf) return;
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(dest);
    src.start(t0 + engine.starts[i]);
  });

  await new Promise<void>((resolve) => {
    const tick = () => {
      const t = audioCtx.currentTime - t0;
      engine.syncVideos(Math.max(0, t), true);
      engine.draw(ctx, Math.max(0, Math.min(t, engine.total - 0.001)), opts);
      opts.onProgress(Math.min(1, Math.max(0, t / engine.total)));
      if (t >= engine.total + 0.2) resolve();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  engine.syncVideos(0, false);
  rec.stop();
  await stopped;
  await audioCtx.close();
  const type = mime.startsWith("video/mp4") ? "video/mp4" : "video/webm";
  return { blob: new Blob(chunks, { type }), ext: type === "video/mp4" ? "mp4" : "webm" };
}
