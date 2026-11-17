import sharp from "sharp";
import type { ImageProvider, ImageRequest, TextProvider } from "../types";

/**
 * Offline provider. Lets the whole app (pipeline, workspace, editor, movie, PDF)
 * run without API keys by drawing procedural "pencil" placeholders. The text side
 * is handled by the heuristic script parser in pipeline/heuristic-breakdown.ts.
 */
export class MockTextProvider implements TextProvider {
  readonly id = "mock";
  async generateText(): Promise<string> {
    throw new Error("Mock text provider is handled by the heuristic breakdown");
  }
}

function rng(seedStr: string) {
  let h = 2166136261;
  for (const c of seedStr) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

class Pencil {
  out: string[] = [];
  constructor(private r: () => number) {}
  j(n = 3) {
    return (this.r() - 0.5) * 2 * n;
  }
  line(x1: number, y1: number, x2: number, y2: number, w = 2.2, passes = 2) {
    for (let p = 0; p < passes; p++) {
      const mx = (x1 + x2) / 2 + this.j(4);
      const my = (y1 + y2) / 2 + this.j(4);
      this.out.push(
        `<path d="M${x1 + this.j()} ${y1 + this.j()} Q${mx} ${my} ${x2 + this.j()} ${y2 + this.j()}" stroke="#000" stroke-width="${p ? w * 0.55 : w}" fill="none" stroke-linecap="round" opacity="${p ? 0.55 : 0.92}"/>`,
      );
    }
  }
  ellipse(cx: number, cy: number, rx: number, ry: number, w = 2.4) {
    for (let p = 0; p < 2; p++) {
      const pts: string[] = [];
      const start = this.r() * Math.PI * 2;
      for (let i = 0; i <= 26; i++) {
        const a = start + (i / 24) * Math.PI * 2;
        pts.push(`${cx + Math.cos(a) * (rx + this.j(2))},${cy + Math.sin(a) * (ry + this.j(2))}`);
      }
      this.out.push(
        `<polyline points="${pts.join(" ")}" stroke="#000" stroke-width="${p ? w * 0.5 : w}" fill="none" stroke-linecap="round" opacity="${p ? 0.5 : 0.9}"/>`,
      );
    }
  }
  hatch(x: number, y: number, w: number, h: number, n = 10) {
    for (let i = 0; i < n; i++) {
      const t = i / n;
      this.line(x + w * t, y + h, x + w * t + h * 0.35, y, 1, 1);
    }
  }
  text(x: number, y: number, s: string, size = 22, anchor = "middle", weight = 400) {
    const esc = s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    this.out.push(
      `<text x="${x}" y="${y}" font-family="Marker Felt, Chalkboard SE, Comic Sans MS, sans-serif" font-size="${size}" font-weight="${weight}" fill="#000" text-anchor="${anchor}">${esc}</text>`,
    );
  }
  /** Full-body gesture figure; `turn` 0 = front, 0.5 = three-quarter, 1 = profile. */
  figure(x: number, base: number, s: number, turn = 0, name?: string) {
    const head = 26 * s;
    const hy = base - 190 * s;
    this.ellipse(x + turn * 6 * s, hy, head * (1 - turn * 0.15), head * 1.1);
    if (turn > 0.7) this.line(x + head * 0.8, hy, x + head * 1.15, hy + 6 * s, 2); // nose
    const sh = 34 * s * (1 - turn * 0.55);
    const neck = hy + head * 1.1;
    this.line(x, neck, x, neck + 12 * s);
    this.line(x - sh, neck + 14 * s, x + sh, neck + 14 * s);
    this.line(x - sh, neck + 14 * s, x - sh * 0.7, base - 80 * s);
    this.line(x + sh, neck + 14 * s, x + sh * 0.7, base - 80 * s);
    this.line(x - sh * 0.7, base - 80 * s, x + sh * 0.7, base - 80 * s);
    this.line(x - sh, neck + 16 * s, x - sh - 14 * s, base - 95 * s);
    this.line(x + sh, neck + 16 * s, x + sh + 14 * s, base - 95 * s);
    this.line(x - sh * 0.45, base - 80 * s, x - sh * 0.6 - turn * 10 * s, base);
    this.line(x + sh * 0.45, base - 80 * s, x + sh * 0.6 + turn * 14 * s, base);
    if (name) this.text(x, base + 30 * s, name.toUpperCase(), Math.max(16, 18 * s));
  }
  /** Head-and-shoulders bust for close-ups. */
  bust(x: number, cy: number, s: number, mood = 0, name?: string) {
    this.ellipse(x, cy, 70 * s, 84 * s, 3);
    this.ellipse(x - 26 * s, cy - 8 * s, 8 * s, 5 * s, 2);
    this.ellipse(x + 26 * s, cy - 8 * s, 8 * s, 5 * s, 2);
    const m = [0, 10, -10, 0][mood % 4] * s;
    this.line(x - 24 * s, cy + 36 * s, x, cy + 36 * s + m, 2.4, 1);
    this.line(x, cy + 36 * s + m, x + 24 * s, cy + 36 * s, 2.4, 1);
    this.line(x - 60 * s, cy - 50 * s, x + 40 * s, cy - 82 * s, 2.6); // hair mass
    this.line(x - 40 * s, cy + 82 * s, x - 150 * s, cy + 170 * s, 3);
    this.line(x + 40 * s, cy + 82 * s, x + 150 * s, cy + 170 * s, 3);
    if (name) this.text(x, cy + 130 * s, name.toUpperCase(), 20);
  }
}

function svg(w: number, h: number, body: string[]) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#ffffff"/>${body.join("")}</svg>`;
}

function drawPanel(req: ImageRequest, w: number, h: number) {
  const meta = req.meta!;
  const r = rng(req.prompt);
  const p = new Pencil(r);
  const size = (meta.shotSize || "Medium").toLowerCase();
  const names = meta.names?.length ? meta.names : [];
  const horizon = h * (0.45 + (r() - 0.5) * 0.25);
  p.line(20, horizon, w - 20, horizon + p.j(10), 1.6);
  p.hatch(40, horizon + 20, 220, 60, 12);
  if (size.includes("close")) {
    const n = Math.max(1, Math.min(names.length, 2));
    for (let i = 0; i < n; i++) p.bust((w / (n + 1)) * (i + 1), h * 0.45, n === 1 ? 1.5 : 1.1, i, names[i]);
  } else {
    const scale = size.includes("wide") || size.includes("establish") ? 0.8 : size.includes("full") ? 1.3 : 1.9;
    const base = size.includes("medium") || size.includes("cowboy") ? h * 1.15 : h * 0.86;
    const n = Math.max(1, names.length);
    if (!names.length) p.line(w * 0.3, horizon - 120, w * 0.42, horizon - 260, 2); // empty set dressing
    for (let i = 0; i < names.length; i++) {
      p.figure((w / (n + 1)) * (i + 1) + p.j(20), base, scale, i % 2 ? 0.5 : 0, names[i]);
    }
  }
  p.text(28, 44, meta.title || "", 26, "start", 700);
  p.text(28, h - 24, "SketchFrame · offline mock render", 16, "start");
  return svg(w, h, p.out);
}

function drawSheet(req: ImageRequest, w: number, h: number) {
  const meta = req.meta!;
  const p = new Pencil(rng(req.prompt));
  const view = (meta.subtitle || "front").toLowerCase();
  if (view.includes("expression")) {
    ["neutral", "happy", "angry", "worried"].forEach((label, i) => {
      const x = (w / 5) * (i + 1);
      p.bust(x, h * 0.42, 0.85, i);
      p.text(x, h * 0.85, label, 20);
    });
  } else {
    const turn = view.includes("side") ? 1 : view.includes("three") ? 0.5 : 0;
    p.figure(w / 2, h * 0.86, 2.6, turn);
  }
  p.text(28, 44, `${meta.title || ""} — ${meta.subtitle || ""}`.toUpperCase(), 26, "start", 700);
  return svg(w, h, p.out);
}

export class MockImageProvider implements ImageProvider {
  readonly id = "mock";
  modelFor() {
    return "offline-mock";
  }
  async generateImage(req: ImageRequest) {
    await new Promise((r) => setTimeout(r, 700 + Math.random() * 900)); // feel like a real call
    const w = req.aspectRatio === "9:16" ? 720 : 1280;
    const h = req.aspectRatio === "9:16" ? 1280 : req.aspectRatio === "1:1" ? 1280 : 720;
    const markup = req.meta?.kind === "sheet" ? drawSheet(req, w, h) : drawPanel(req, w, h);
    const overlay = await sharp(Buffer.from(markup)).png().toBuffer();
    if (req.layout && req.meta?.kind !== "sheet") {
      // "Sketch-to-image": keep the user's composition visible beneath a cleaned line pass.
      const base = await sharp(req.layout.data).resize(w, h, { fit: "cover" }).greyscale().toColourspace("srgb").png().toBuffer();
      return sharp(base).composite([{ input: overlay, blend: "multiply" }]).png().toBuffer();
    }
    return overlay;
  }
}
