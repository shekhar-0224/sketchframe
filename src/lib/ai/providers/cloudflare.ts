import sharp from "sharp";
import type { ImageProvider, ImageRequest, LabeledImage } from "../types";
import { ProviderError } from "../types";

/**
 * FLUX.2 [klein] on Cloudflare Workers AI: the free plan's drawing model. It takes up to
 * four reference images (character sheets), so panels stay on-model, and runs within
 * Cloudflare's free daily allowance. Server-wide credentials, never per-user keys.
 */
export const CLOUDFLARE_IMAGE_MODEL = () => process.env.CLOUDFLARE_IMAGE_MODEL || "@cf/black-forest-labs/flux-2-klein-4b";
export const hasCloudflare = () => !!(process.env.CLOUDFLARE_ACCOUNT_ID && process.env.CLOUDFLARE_API_TOKEN);

const MAX_INPUTS = 4;

function size(aspect: ImageRequest["aspectRatio"]) {
  if (aspect === "9:16") return [576, 1024];
  if (aspect === "1:1") return [1024, 1024];
  if (aspect === "4:3") return [1024, 768];
  if (aspect === "2.39:1") return [1024, 432];
  return [1024, 576];
}

/** Up to four inputs: the layout, then one image per character in turn (front/upload first), then more views. */
function pickInputs(req: ImageRequest): LabeledImage[] {
  const out: LabeledImage[] = req.layout ? [req.layout] : [];
  const byName = new Map<string, LabeledImage[]>();
  for (const r of req.references) {
    const name = r.label.split(" — ")[0];
    byName.set(name, [...(byName.get(name) ?? []), r]);
  }
  const groups = [...byName.values()];
  for (let i = 0; out.length < MAX_INPUTS && groups.some((g) => g[i]); i++)
    for (const g of groups) if (g[i] && out.length < MAX_INPUTS) out.push(g[i]);
  return out;
}

export class CloudflareImageProvider implements ImageProvider {
  readonly id = "cloudflare";
  modelFor() {
    return CLOUDFLARE_IMAGE_MODEL().split("/").at(-1)!;
  }

  async generateImage(req: ImageRequest) {
    const inputs = pickInputs(req);
    const legend = inputs.map((img, i) => `Reference image ${i + 1}: ${img.label}`).join("\n");
    const [w, h] = size(req.aspectRatio);
    const form = new FormData();
    form.append("prompt", (legend ? `${legend}\n\n${req.prompt}` : req.prompt).slice(0, 4000));
    form.append("width", String(w));
    form.append("height", String(h));
    // 512px inputs are one billing tile each, and plenty for the model to read a face and outfit.
    for (const [i, img] of inputs.entries()) {
      const small = await sharp(img.data).resize(512, 512, { fit: "inside" }).flatten({ background: "#fff" }).jpeg({ quality: 90 }).toBuffer();
      form.append(`input_image_${i}`, new Blob([new Uint8Array(small)], { type: "image/jpeg" }), `ref-${i}.jpg`);
    }

    const url = `https://api.cloudflare.com/client/v4/accounts/${process.env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${CLOUDFLARE_IMAGE_MODEL()}`;
    // The output filter is jumpy (children, close-ups of faces): a fresh seed usually passes.
    let msg = "";
    for (let attempt = 0; attempt < 3; attempt++) {
      form.set("seed", String(Math.floor(Math.random() * 1e9)));
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.CLOUDFLARE_API_TOKEN}` },
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
      const json = await res.json().catch(() => null);
      const b64 = json?.result?.image as string | undefined;
      if (res.ok && b64) return Buffer.from(b64, "base64");
      msg = String(json?.errors?.[0]?.message ?? res.status);
      if (!/flagged/i.test(msg)) throw new ProviderError("cloudflare", msg.slice(0, 300), res.status);
    }
    throw new ProviderError("cloudflare", "This picture was blocked by the AI's safety filter. Try describing the shot differently.", 400);
  }
}

/** Free plan drawing: FLUX.2 on Cloudflare, and the keyless service if Cloudflare refuses or is over today's allowance. */
export class FallbackImageProvider implements ImageProvider {
  readonly id: string;
  private used: string | null = null;
  constructor(
    private primary: ImageProvider,
    private backup: ImageProvider,
  ) {
    this.id = primary.id;
  }

  modelFor(tier: ImageRequest["tier"]) {
    return this.used ?? this.primary.modelFor(tier);
  }

  async generateImage(req: ImageRequest) {
    try {
      const out = await this.primary.generateImage(req);
      this.used = null;
      return out;
    } catch (err) {
      console.warn(`[images] ${this.primary.id} failed, using ${this.backup.id}:`, (err as Error).message);
      this.used = this.backup.modelFor(req.tier);
      return this.backup.generateImage(req);
    }
  }
}
