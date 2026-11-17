"use client";

import type { EffectId } from "@/lib/effects";

/**
 * Procedural weather + light overlays, drawn on top of each shot. Everything is a pure
 * function of time, so preview and export render identically. Kept monochrome to match
 * the pencil look: ink-dark and paper-white strokes rather than colour.
 */

function hash(n: number) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export function drawEffects(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  effects: EffectId[],
  opts: { t: number; local: number; duration: number; interior: boolean; alpha: number; seed: number },
) {
  if (!effects.length || opts.alpha <= 0.01) return;
  const { t, local, duration, interior, alpha, seed } = opts;
  ctx.save();
  for (const e of effects) {
    if (e === "rain") rain(ctx, W, H, t, interior ? 0.45 : 1, alpha);
    if (e === "snow") snow(ctx, W, H, t, interior ? 0.4 : 1, alpha);
    if (e === "fog") fog(ctx, W, H, t, alpha);
    if (e === "flicker") flicker(ctx, W, H, t, seed, alpha);
    if (e === "sweep") sweep(ctx, W, H, local / duration, alpha);
    if (e === "lightning") lightning(ctx, W, H, local, seed, alpha);
  }
  ctx.restore();
}

function rain(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, density: number, alpha: number) {
  const n = Math.round(220 * density);
  ctx.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const speed = 1.4 + hash(i) * 1.2; // screen-heights per second
    const len = (0.04 + hash(i + 9) * 0.05) * H;
    const x = (hash(i + 3) * 1.2 - 0.1) * W;
    const y = (((hash(i + 7) + t * speed) % 1.2) - 0.1) * H;
    const slant = 0.18 * len;
    ctx.globalAlpha = alpha * (0.25 + hash(i + 5) * 0.35);
    // Alternate ink and paper strokes so rain reads on both light and dark areas.
    ctx.strokeStyle = i % 3 === 0 ? "#ffffff" : "#1a1a1a";
    ctx.lineWidth = i % 3 === 0 ? 1.6 : 1;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - slant, y + len);
    ctx.stroke();
  }
}

function snow(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, density: number, alpha: number) {
  const n = Math.round(140 * density);
  for (let i = 0; i < n; i++) {
    const speed = 0.08 + hash(i) * 0.12;
    const r = 1.5 + hash(i + 2) * 3.5;
    const x = (hash(i + 4) + Math.sin(t * (0.6 + hash(i)) + i) * 0.02) * W;
    const y = ((hash(i + 8) + t * speed) % 1.1) * H - 0.05 * H;
    ctx.globalAlpha = alpha * (0.55 + hash(i + 6) * 0.4);
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = alpha * 0.25;
    ctx.strokeStyle = "#000";
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

function fog(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, alpha: number) {
  for (let i = 0; i < 4; i++) {
    const x = (((hash(i) + t * (0.015 + i * 0.006)) % 1.6) - 0.3) * W;
    const y = (0.45 + hash(i + 3) * 0.45) * H;
    const r = (0.35 + hash(i + 5) * 0.3) * W;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(255,255,255,0.32)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.globalAlpha = alpha;
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }
}

/** Stepped random dimming, like a failing neon tube or firelight. */
function flicker(ctx: CanvasRenderingContext2D, W: number, H: number, t: number, seed: number, alpha: number) {
  const step = Math.floor(t * 12);
  const r = hash(step + seed * 13);
  const dim = r > 0.9 ? 0.32 : r > 0.75 ? 0.14 : 0.03 + 0.03 * Math.sin(t * 9);
  ctx.globalAlpha = alpha * dim;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, W, H);
}

/** A soft band of light crossing the frame once during the shot (headlights, searchlight). */
function sweep(ctx: CanvasRenderingContext2D, W: number, H: number, p: number, alpha: number) {
  const x = (-0.4 + p * 1.8) * W;
  const g = ctx.createLinearGradient(x - W * 0.25, 0, x + W * 0.25, 0);
  g.addColorStop(0, "rgba(255,255,255,0)");
  g.addColorStop(0.5, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.globalAlpha = alpha;
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = "source-over";
}

function lightning(ctx: CanvasRenderingContext2D, W: number, H: number, local: number, seed: number, alpha: number) {
  // Two strikes per shot at fixed-but-varied moments, each a quick double flash.
  const strikes = [0.5 + hash(seed) * 0.6, 1.9 + hash(seed + 1) * 0.8];
  let a = 0;
  for (const s of strikes) {
    const dt = local - s;
    if (dt >= 0 && dt < 0.45) a = Math.max(a, dt < 0.08 ? 0.85 : dt < 0.16 ? 0.25 : dt < 0.24 ? 0.65 : 0.65 * (1 - (dt - 0.24) / 0.21));
  }
  if (a <= 0) return;
  ctx.globalAlpha = alpha * a;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
}

/** Paper grain + vignette over the whole movie: ties stills and AI clips into one look. */
export class FilmFinish {
  private grain: HTMLCanvasElement;
  constructor() {
    this.grain = document.createElement("canvas");
    this.grain.width = this.grain.height = 256;
    const g = this.grain.getContext("2d")!;
    const img = g.createImageData(256, 256);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 110 + Math.random() * 145;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
  }

  draw(ctx: CanvasRenderingContext2D, W: number, H: number, t: number) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.globalCompositeOperation = "multiply";
    const ox = Math.floor(hash(Math.floor(t * 24)) * 256);
    const oy = Math.floor(hash(Math.floor(t * 24) + 1) * 256);
    ctx.translate(-ox, -oy);
    ctx.fillStyle = ctx.createPattern(this.grain, "repeat")!;
    ctx.fillRect(ox, oy, W, H);
    ctx.restore();
    ctx.save();
    const v = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    v.addColorStop(0, "rgba(0,0,0,0)");
    v.addColorStop(1, "rgba(0,0,0,0.28)");
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
  }
}
