import "server-only";
import type { ImageProvider, TextProvider } from "./types";
import { OpenAIImageProvider, OpenAITextProvider } from "./providers/openai";
import { GeminiImageProvider, GeminiTextProvider } from "./providers/gemini";
import { MockImageProvider, MockTextProvider } from "./providers/mock";
import { FallbackTextProvider, FreeImageProvider, FreeTextProvider, StarterImageProvider } from "./providers/free";
import { reserveSharedText, reserveSharedVoice, reserveStarterImage, usingSharedOpenAI } from "@/lib/usage";
import { ProviderError } from "./types";
import { getSettings } from "@/lib/settings";
import { CloudflareImageProvider, FallbackImageProvider, hasCloudflare } from "./providers/cloudflare";
import { FalVideo, type VideoProvider } from "./video";
import { BrowserSpeech, ElevenLabsSpeech, OpenAISpeech, SarvamSpeech, type SpeechProvider, type SpeechProviderId } from "./speech";
import { apiKey } from "@/lib/context";

/**
 * Single place that maps the user's settings to provider instances.
 * "auto" picks the first provider with a key (OpenAI, then Gemini); with no keys it falls
 * back to the keyless "free" tier, so nobody's first story is placeholders.
 * "mock" (offline stick figures + built-in parser) is only used when chosen explicitly.
 */
type Id = "gemini" | "openai" | "free" | "mock";
type TextId = Id | "ollama";

export const OLLAMA_BASE_URL = () => process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";

const textFactories: Record<TextId, () => TextProvider> = {
  gemini: () => new GeminiTextProvider(getSettings().geminiTextModel),
  openai: () => new OpenAITextProvider(getSettings().openaiTextModel),
  ollama: () =>
    new OpenAITextProvider(getSettings().ollamaTextModel, { id: "ollama", baseUrl: OLLAMA_BASE_URL(), apiKey: "ollama" }),
  free: () => new FreeTextProvider(),
  mock: () => new MockTextProvider(),
};

/** Free plan drawings: FLUX.2 on Cloudflare when the server has it (keeps characters on-model), else the keyless service. */
const freeImage = (): ImageProvider =>
  hasCloudflare() ? new FallbackImageProvider(new CloudflareImageProvider(), new FreeImageProvider()) : new FreeImageProvider();

const imageFactories: Record<Id, () => ImageProvider> = {
  gemini: () => new GeminiImageProvider(getSettings().geminiImageModel),
  openai: () => {
    const s = getSettings();
    return new OpenAIImageProvider(
      { sheet: s.openaiSheetModel, cast: s.openaiCastModel, filler: s.openaiFillerModel },
      s.openaiImageQuality,
    );
  },
  free: freeImage,
  mock: () => new MockImageProvider(),
};

export const hasKey = {
  openai: () => !!apiKey("OPENAI_API_KEY"),
  gemini: () => !!apiKey("GEMINI_API_KEY"),
  sarvam: () => !!apiKey("SARVAM_API_KEY"),
  elevenlabs: () => !!apiKey("ELEVENLABS_API_KEY"),
  fal: () => !!apiKey("FAL_KEY"),
};

/** First pulled Ollama model, or null when Ollama isn't running. Used by presets. */
export async function localTextModel(preferred?: string): Promise<string | null> {
  try {
    const res = await fetch(OLLAMA_BASE_URL().replace(/\/v1\/?$/, "") + "/api/tags", { signal: AbortSignal.timeout(1500) });
    const names = ((await res.json()).models as Array<{ name: string }>).map((m) => m.name);
    return preferred && names.includes(preferred) ? preferred : (names[0] ?? null);
  } catch {
    return null;
  }
}

function pick(explicit: string | undefined, order: Id[]): TextId {
  if (explicit && explicit !== "auto" && explicit in textFactories) return explicit as TextId;
  for (const id of order) {
    if (id === "gemini" && apiKey("GEMINI_API_KEY")) return id;
    if (id === "openai" && apiKey("OPENAI_API_KEY")) return id;
  }
  return "free";
}

export function textProviderId(): TextId {
  return pick(getSettings().textProvider, ["openai", "gemini"]);
}
export function imageProviderId(): Id {
  return pick(getSettings().imageProvider, ["openai", "gemini"]) as Id;
}

/** Voice: "auto" prefers a paid key in order OpenAI → ElevenLabs → Sarvam, else free browser voices. */
export function speechProviderId(): SpeechProviderId {
  const p = getSettings().speechProvider;
  if (p !== "auto") return p;
  if (hasKey.openai()) return "openai";
  if (hasKey.elevenlabs()) return "elevenlabs";
  if (hasKey.sarvam()) return "sarvam";
  return "browser";
}

export function getSpeechProvider(): SpeechProvider {
  const s = getSettings();
  switch (speechProviderId()) {
    case "openai":
      return usingSharedOpenAI() ? cappedSpeech(new OpenAISpeech(s.openaiTtsModel)) : new OpenAISpeech(s.openaiTtsModel);
    case "sarvam":
      return new SarvamSpeech(s.sarvamModel, s.sarvamLanguage);
    case "elevenlabs":
      return new ElevenLabsSpeech(s.elevenlabsModel);
    default:
      return new BrowserSpeech();
  }
}

/** Lent-key voices count against a site-wide daily cap; over it, lines are left to the browser voice. */
function cappedSpeech(inner: SpeechProvider): SpeechProvider {
  return {
    id: inner.id,
    listVoices: () => inner.listVoices(),
    async synthesize(req) {
      if (!(await reserveSharedVoice()))
        throw new ProviderError("openai", "Today's free voices are used up — the movie will use your browser's voice. Try again tomorrow.");
      return inner.synthesize(req);
    },
  };
}

/** AI clips are opt-in, via fal.ai (Kling / Seedance / Wan…); null when no key is set. */
export function getVideoProvider(): VideoProvider | null {
  return hasKey.fal() ? new FalVideo(getSettings().videoModel) : null;
}

/** With a lent (shared) OpenAI key, text falls back to free on key trouble and images are capped. */
export function getTextProvider(): TextProvider {
  const id = textProviderId();
  const p = textFactories[id]();
  return id === "openai" && usingSharedOpenAI() ? new FallbackTextProvider(p, new FreeTextProvider(), reserveSharedText) : p;
}

export function getImageProvider(): ImageProvider {
  const id = imageProviderId();
  const p = imageFactories[id]();
  return id === "openai" && usingSharedOpenAI() ? new StarterImageProvider(p, freeImage(), reserveStarterImage) : p;
}
