import type { ImageProvider, ImageRequest, TextProvider, TextRequest } from "../types";
import { OpenAITextProvider } from "./openai";
import { ProviderError } from "../types";
import { STYLE_TEXT, artStyle } from "../prompts";

/**
 * "Free AI" tier: Pollinations' public, keyless endpoints (text: OpenAI-compatible; images:
 * FLUX). It's what everyone gets before adding their own keys, so a first story is real —
 * not placeholders. Limits: shared rate limits (we retry), no reference-image conditioning
 * (consistency comes from the text + a stable seed per cast), and a small watermark.
 */
export const FREE_TEXT_ENDPOINT = { id: "free", baseUrl: "https://text.pollinations.ai/openai", apiKey: "free" };

/** The shared free text model answers "busy" (402/429/5xx) when many people use it — wait and retry. */
export class FreeTextProvider implements TextProvider {
  readonly id = "free";
  private inner = new OpenAITextProvider("openai", FREE_TEXT_ENDPOINT);

  async generateText(req: TextRequest) {
    let last: unknown;
    for (const wait of [0, 8000, 20000]) {
      if (wait) await new Promise((r) => setTimeout(r, wait));
      try {
        return await this.inner.generateText(req);
      } catch (err) {
        last = err;
        const status = (err as ProviderError).status ?? 0;
        if (status && status !== 402 && status !== 429 && status < 500) break;
      }
    }
    throw last;
  }
}

const SHORT_STYLE = () =>
  artStyle() === "film"
    ? "Black-and-white cinematic film still, 35mm, strictly monochrome, high contrast, dramatic lighting, film grain, realistic, not a comic or cartoon, no text."
    : "Professional film storyboard sketch, black pencil and ink line art on white paper, high contrast, clean lines, minimal shading, no colour, no text.";

function hash(s: string) {
  let h = 2166136261;
  for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return (h >>> 0) % 1_000_000;
}

function size(aspect: ImageRequest["aspectRatio"]) {
  if (aspect === "9:16") return [720, 1280];
  if (aspect === "1:1") return [1024, 1024];
  if (aspect === "4:3") return [1024, 768];
  return [1280, 720];
}

/**
 * The free image service allows one picture every ~45 s per server address, so free
 * drawings queue here and go out one at a time instead of failing.
 */
const SPACING_MS = 47_000;
const q = globalThis as unknown as { __sf_free_img?: { chain: Promise<unknown>; last: number } };
const queue = (q.__sf_free_img ??= { chain: Promise.resolve(), last: 0 });

function inTurn<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.chain.then(async () => {
    const wait = queue.last + SPACING_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      queue.last = Date.now();
    }
  });
  queue.chain = run.catch(() => {});
  return run;
}

export class FreeImageProvider implements ImageProvider {
  readonly id = "free";
  modelFor() {
    return "free-flux";
  }

  async generateImage(req: ImageRequest) {
    // The free model does best with a short, concrete description — not our long instructions.
    const m = req.meta;
    const clean = (t?: string) => (t ?? "").replace(/\s+/g, " ").trim();
    let body: string;
    if (m?.kind === "sheet") {
      body = `Character design: one single character, ${clean(m.subtitle) || "front"} view, full body, standing, centered, plain white background. ${clean(m.title)}: ${clean(m.description)}`;
    } else if (m?.kind === "panel" && m.action) {
      const cast = (m.castLines ?? []).map(clean).filter(Boolean).join(". ");
      body = [`${clean(m.shotSize)} shot, ${clean(m.angle)}.`, clean(m.action), cast && `Characters — ${cast}.`, m.setting && `Setting: ${clean(m.setting)}.`]
        .filter(Boolean)
        .join(" ");
    } else {
      body = clean(req.prompt.replace(STYLE_TEXT(), ""));
    }
    const prompt = `${SHORT_STYLE()} ${body}`.slice(0, 1400);
    const [w, h] = size(req.aspectRatio);
    // Same cast → same seed, which keeps the drawing style and faces closer across panels.
    const seed = hash((req.meta?.names ?? []).slice().sort().join("|") || req.meta?.title || "sketchframe");
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&seed=${seed}&model=flux&nologo=true`;

    let lastError = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await inTurn(() => fetch(url, { signal: AbortSignal.timeout(120_000) }));
        const type = res.headers.get("content-type") ?? "";
        if (res.ok && type.startsWith("image/")) return Buffer.from(await res.arrayBuffer());
        lastError = `${res.status}`;
        // 402 = "free limit, retry after 45 s"; 429/5xx = busy. Anything else won't improve.
        if (res.status !== 402 && res.status !== 429 && res.status < 500) break;
      } catch (e) {
        lastError = (e as Error).message;
      }
    }
    throw new ProviderError("free", `The free drawing service is busy (${lastError}). Press Draw again in a minute.`);
  }
}

/** The paid model refused the picture (e.g. a famous character); the free model may still draw it. */
const blocked = (err: unknown) => /safety filter/.test((err as Error).message ?? "");

/** Errors that mean "the paid key can't be used right now" (no credit, quota, auth, rate limit). */
const keyTrouble = (err: unknown) => {
  const e = err as ProviderError;
  return [401, 402, 403, 429].includes(e.status ?? 0) || /billing|credit|quota|insufficient|rate limit/i.test(e.message ?? "");
};

/**
 * Lent-key wrapper for images: each picture reserves a starter drawing (per-user and daily
 * caps); over the caps, or if the paid key fails, the free tier draws it instead.
 */
export class StarterImageProvider implements ImageProvider {
  readonly id: string;
  private used: string | null = null;
  constructor(
    private paid: ImageProvider,
    private free: ImageProvider,
    private reserve: () => Promise<(() => Promise<void>) | null>,
  ) {
    this.id = paid.id;
  }

  modelFor(tier: ImageRequest["tier"]) {
    return this.used ?? this.paid.modelFor(tier);
  }

  async generateImage(req: ImageRequest) {
    const refund = await this.reserve();
    if (!refund) {
      this.used = this.free.modelFor(req.tier);
      return this.free.generateImage(req);
    }
    try {
      const out = await this.paid.generateImage(req);
      this.used = null;
      return out;
    } catch (err) {
      await refund();
      if (!keyTrouble(err) && !blocked(err)) throw err;
      this.used = this.free.modelFor(req.tier);
      return this.free.generateImage(req);
    }
  }
}

/** Lent-key wrapper for text: a site-wide daily cap, and a fall back to free over it or if the key fails. */
export class FallbackTextProvider implements TextProvider {
  readonly id: string;
  constructor(
    private paid: TextProvider,
    private free: TextProvider,
    private reserve: () => Promise<boolean>,
  ) {
    this.id = paid.id;
  }
  async generateText(req: TextRequest) {
    if (!(await this.reserve())) return this.free.generateText(req);
    try {
      return await this.paid.generateText(req);
    } catch (err) {
      if (!keyTrouble(err)) throw err;
      return this.free.generateText(req);
    }
  }
}
