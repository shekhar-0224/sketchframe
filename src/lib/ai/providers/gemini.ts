import type { ImageProvider, ImageRequest, TextProvider, TextRequest } from "../types";
import { ProviderError } from "../types";
import { apiKey } from "@/lib/context";

const BASE = () =>
  (process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta").replace(/\/+$/, "");

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

async function generateContent(model: string, body: unknown) {
  const res = await fetch(`${BASE()}/models/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey("GEMINI_API_KEY") || "" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new ProviderError("gemini", `${res.status} ${text.slice(0, 400)}`, res.status);
  }
  const json = await res.json();
  const parts = (json.candidates?.[0]?.content?.parts ?? []) as Array<{
    text?: string;
    inlineData?: { mimeType?: string; data?: string };
  }>;
  if (!parts.length) {
    const reason = json.promptFeedback?.blockReason || json.candidates?.[0]?.finishReason || "empty response";
    throw new ProviderError("gemini", `No content returned (${reason})`);
  }
  return parts;
}

export class GeminiTextProvider implements TextProvider {
  readonly id = "gemini";
  constructor(private model: string) {}

  async generateText(req: TextRequest) {
    const parts = await generateContent(this.model, {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: "user", parts: [{ text: req.prompt }] }],
      generationConfig: {
        temperature: req.temperature ?? 0.6,
        ...(req.json && { responseMimeType: "application/json" }),
      },
    });
    return parts.map((p) => p.text ?? "").join("");
  }
}

const GEMINI_ASPECTS: Record<ImageRequest["aspectRatio"], string> = {
  "16:9": "16:9",
  "1:1": "1:1",
  "4:3": "4:3",
  "9:16": "9:16",
  "2.39:1": "21:9",
};

/**
 * Gemini image models take interleaved text + image parts, so every reference gets
 * its own text label right before it. This is the strongest consistency path we have.
 */
export class GeminiImageProvider implements ImageProvider {
  readonly id = "gemini";
  constructor(private model: string) {}

  modelFor() {
    return this.model;
  }

  async generateImage(req: ImageRequest) {
    const parts: Part[] = [];
    for (const ref of req.references) {
      parts.push({ text: `[REFERENCE — ${ref.label}]` });
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data.toString("base64") } });
    }
    if (req.layout) {
      parts.push({ text: `[LAYOUT — ${req.layout.label}]` });
      parts.push({ inlineData: { mimeType: req.layout.mimeType, data: req.layout.data.toString("base64") } });
    }
    parts.push({ text: req.prompt });

    const out = await generateContent(this.model, {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["IMAGE"],
        imageConfig: { aspectRatio: GEMINI_ASPECTS[req.aspectRatio] ?? "16:9" },
      },
    });
    const img = out.find((p) => p.inlineData?.data);
    if (!img?.inlineData?.data) throw new ProviderError("gemini", "Model returned no image");
    return Buffer.from(img.inlineData.data, "base64");
  }
}
