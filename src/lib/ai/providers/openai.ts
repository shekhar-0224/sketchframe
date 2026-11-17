import type { ImageProvider, ImageRequest, ImageTier, TextProvider, TextRequest } from "../types";
import { ProviderError } from "../types";
import { apiKey } from "@/lib/context";

const BASE = () => (process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "");
const KEY = () => apiKey("OPENAI_API_KEY") || "";

type Endpoint = { id: string; baseUrl: string; apiKey: string };
const openaiEndpoint = (): Endpoint => ({ id: "openai", baseUrl: BASE(), apiKey: KEY() });

async function call(path: string, init: RequestInit, ep: Endpoint = openaiEndpoint()) {
  const res = await fetch(`${ep.baseUrl.replace(/\/+$/, "")}${path}`, {
    // A stuck connection must not leave a panel "drawing" forever.
    signal: AbortSignal.timeout(180_000),
    ...init,
    headers: { Authorization: `Bearer ${ep.apiKey}`, ...(init.headers || {}) },
  });
  if (!res.ok) {
    const body = await res.text();
    if (/moderation_blocked|safety system/.test(body))
      throw new ProviderError(
        ep.id,
        "This picture was blocked by the AI's safety filter — famous cartoon or film characters often are. Describe them in your own words and draw again.",
        res.status,
      );
    throw new ProviderError(ep.id, `${res.status} ${body.slice(0, 400)}`, res.status);
  }
  return res.json();
}

/**
 * Chat-completions text provider. Also serves any OpenAI-compatible server (Ollama,
 * LM Studio, Groq…) when given its own endpoint.
 */
export class OpenAITextProvider implements TextProvider {
  readonly id: string;
  private ep: Endpoint;
  constructor(
    private model: string,
    endpoint?: Endpoint,
  ) {
    this.ep = endpoint ?? openaiEndpoint();
    this.id = this.ep.id;
  }

  async generateText(req: TextRequest) {
    // GPT-5 family: reasoning models — fixed temperature, and "minimal" effort keeps them cheap and fast.
    const reasoning = this.ep.id === "openai" && /^(gpt-5|o\d)/.test(this.model) && !this.model.includes("chat");
    const json = await call("/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        ...(reasoning ? { reasoning_effort: "minimal" } : { temperature: req.temperature ?? 0.6 }),
        // Local thinking models (qwen3 etc.) skip their long reasoning pass; it adds minutes, not quality, here.
        ...(this.ep.id === "ollama" && { reasoning_effort: "none" }),
        // The free tier caps output length; keep its thinking short so the answer fits.
        // …and a fresh seed, or the free service may replay a cached (possibly broken) answer.
        ...(this.ep.id === "free" && { reasoning_effort: "low", seed: Math.floor(Math.random() * 1e9) }),
        ...(req.json && { response_format: { type: "json_object" } }),
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: req.prompt },
        ],
      }),
    }, this.ep);
    return (json.choices?.[0]?.message?.content as string) ?? "";
  }
}

function sizeFor(aspect: ImageRequest["aspectRatio"]) {
  if (aspect === "9:16") return "1024x1536";
  if (aspect === "1:1") return "1024x1024";
  return "1536x1024";
}

/**
 * GPT image models: with references we use /images/edits, which accepts multiple input
 * images. Labels can't be attached per image there, so the prompt enumerates them in order.
 * Each request is routed to the model configured for its cost tier.
 */
export class OpenAIImageProvider implements ImageProvider {
  readonly id = "openai";
  constructor(
    private models: Record<ImageTier, string>,
    private quality: "low" | "medium" | "high" = "low",
  ) {}

  modelFor(tier: ImageTier) {
    return this.models[tier];
  }

  async generateImage(req: ImageRequest) {
    const model = this.modelFor(req.tier);
    const inputs = [...(req.layout ? [req.layout] : []), ...req.references];
    let json;
    if (inputs.length === 0) {
      json = await call("/images/generations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model, prompt: req.prompt, size: sizeFor(req.aspectRatio), quality: this.quality, n: 1 }),
      });
    } else {
      const legend = inputs.map((img, i) => `Input image ${i + 1}: ${img.label}`).join("\n");
      const edit = (fidelity: boolean) => {
        const form = new FormData();
        form.append("model", model);
        form.append("prompt", `${legend}\n\n${req.prompt}`);
        form.append("size", sizeFor(req.aspectRatio));
        form.append("quality", this.quality);
        // High input fidelity keeps faces on-model; not every model accepts it.
        if (fidelity) form.append("input_fidelity", "high");
        inputs.forEach((img, i) =>
          form.append("image[]", new Blob([new Uint8Array(img.data)], { type: img.mimeType }), `ref-${i + 1}.png`),
        );
        return call("/images/edits", { method: "POST", body: form });
      };
      try {
        json = await edit(true);
      } catch (err) {
        if (!(err instanceof ProviderError && err.status === 400 && /input_fidelity/.test(err.message))) throw err;
        json = await edit(false);
      }
    }
    const b64 = json.data?.[0]?.b64_json as string | undefined;
    if (b64) return Buffer.from(b64, "base64");
    const url = json.data?.[0]?.url as string | undefined;
    if (url) return Buffer.from(await (await fetch(url)).arrayBuffer());
    throw new ProviderError("openai", "No image in response");
  }
}
