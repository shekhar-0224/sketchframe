import "server-only";
import { z } from "zod";
import { getDb, schema } from "@/lib/db";
import { currentContext, requireContext } from "@/lib/context";

/**
 * Per-user AI settings (preset, providers, models, quality), stored in user_settings.
 * Precedence: the user's saved settings > env vars > built-in defaults. Keys never live
 * here — they're in user_keys (encrypted) or the server env.
 * Defaults are the cheapest models that still give usable storyboard sketches.
 */
const provider = z.enum(["auto", "openai", "gemini", "free", "mock"]);
/** Text can also run on a local Ollama server (free). */
const textProvider = z.enum(["auto", "openai", "gemini", "ollama", "free", "mock"]);
export const speechProviders = ["auto", "browser", "openai", "sarvam", "elevenlabs"] as const;
export const PRESET_IDS = ["free", "budget", "balanced", "best"] as const;
export type PresetId = (typeof PRESET_IDS)[number];

export const settingsSchema = z.object({
  /** Which one-click preset these settings came from ("custom" once edited by hand). */
  preset: z.enum([...PRESET_IDS, "custom"]),
  textProvider,
  imageProvider: provider,
  ollamaTextModel: z.string().min(1).max(80),
  openaiTextModel: z.string().min(1).max(80),
  /** Per-tier image models: best where likeness matters, cheapest for filler. */
  openaiSheetModel: z.string().min(1).max(80),
  openaiCastModel: z.string().min(1).max(80),
  openaiFillerModel: z.string().min(1).max(80),
  openaiImageQuality: z.enum(["low", "medium", "high"]),
  geminiTextModel: z.string().min(1).max(80),
  geminiImageModel: z.string().min(1).max(80),
  /** Voice (text-to-speech) for the comic movie. */
  speechProvider: z.enum(speechProviders),
  openaiTtsModel: z.string().min(1).max(80),
  sarvamModel: z.string().min(1).max(80),
  sarvamLanguage: z.string().min(2).max(10),
  elevenlabsModel: z.string().min(1).max(80),
  /** Image-to-video model for opt-in AI clips. */
  videoModel: z.string().min(1).max(80),
});

export type Settings = z.infer<typeof settingsSchema>;

export const defaults = (): Settings => ({
  preset: "balanced",
  textProvider: (process.env.TEXT_PROVIDER as Settings["textProvider"]) || "auto",
  imageProvider: (process.env.IMAGE_PROVIDER as Settings["imageProvider"]) || "auto",
  openaiTextModel: process.env.OPENAI_TEXT_MODEL || "gpt-5-mini",
  ollamaTextModel: process.env.OLLAMA_TEXT_MODEL || "qwen3:8b",
  openaiSheetModel: process.env.OPENAI_SHEET_MODEL || "gpt-image-1.5",
  openaiCastModel: process.env.OPENAI_CAST_MODEL || "gpt-image-1.5",
  openaiFillerModel: process.env.OPENAI_FILLER_MODEL || "gpt-image-1.5",
  openaiImageQuality: (process.env.OPENAI_IMAGE_QUALITY as Settings["openaiImageQuality"]) || "medium",
  geminiTextModel: process.env.GEMINI_TEXT_MODEL || "gemini-3.8-flash",
  geminiImageModel: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-image",
  speechProvider: (process.env.SPEECH_PROVIDER as Settings["speechProvider"]) || "auto",
  openaiTtsModel: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  sarvamModel: process.env.SARVAM_MODEL || "bulbul:v2",
  sarvamLanguage: process.env.SARVAM_LANGUAGE || "en-IN",
  elevenlabsModel: process.env.ELEVENLABS_MODEL || "eleven_flash_v2_5",
  videoModel: process.env.FAL_VIDEO_MODEL || "fal-ai/kling-video/v2.1/standard/image-to-video",
});

/**
 * One-click presets: the simple way to pick cost vs quality. `localText` is the pulled
 * Ollama model when one is available, so text runs free on this machine where possible.
 */
export const PRESET_INFO: Record<PresetId, { title: string; blurb: string; cost: string }> = {
  free: { title: "Free", blurb: "Free AI for reading your story and drawing sketches (with a small watermark), plus browser voices. No keys needed.", cost: "$0" },
  budget: { title: "Budget", blurb: "Cheapest paid models everywhere. Good for blocking out; faces can drift.", cost: "≈ 5–10¢ / scene" },
  balanced: { title: "Balanced", blurb: "Best model for characters and faces, cheapest for backgrounds.", cost: "≈ 20–40¢ / scene" },
  best: { title: "Best", blurb: "Best model everywhere at medium quality, smarter script reading.", cost: "≈ $1–2 / scene" },
};

export function presetPatch(id: PresetId, localText: string | null): Partial<Settings> {
  const text: Partial<Settings> = localText ? { textProvider: "ollama", ollamaTextModel: localText } : { textProvider: "auto" };
  switch (id) {
    case "free":
      return { textProvider: "free", imageProvider: "free", speechProvider: "browser" };
    case "budget":
      return {
        ...text,
        openaiTextModel: "gpt-5-nano",
        imageProvider: "auto",
        speechProvider: "auto",
        openaiSheetModel: "gpt-image-1-mini",
        openaiCastModel: "gpt-image-1-mini",
        openaiFillerModel: "gpt-image-1-mini",
        openaiImageQuality: "low",
      };
    case "balanced":
      return {
        ...text,
        openaiTextModel: "gpt-5-nano",
        imageProvider: "auto",
        speechProvider: "auto",
        openaiSheetModel: "gpt-image-1.5",
        openaiCastModel: "gpt-image-1.5",
        openaiFillerModel: "gpt-image-1-mini",
        openaiImageQuality: "low",
      };
    case "best":
      return {
        textProvider: "auto",
        openaiTextModel: "gpt-5-mini",
        imageProvider: "auto",
        speechProvider: "auto",
        openaiSheetModel: "gpt-image-1.5",
        openaiCastModel: "gpt-image-1.5",
        openaiFillerModel: "gpt-image-1.5",
        openaiImageQuality: "medium",
      };
  }
}

/** The signed-in user's settings (loaded once per request into the context). */
export function getSettings(): Settings {
  return currentContext()?.settings ?? defaults();
}

export async function saveSettings(patch: Partial<Settings>) {
  const ctx = requireContext();
  const next = settingsSchema.parse({ ...ctx.settings, ...patch });
  const db = await getDb();
  const row = { userId: ctx.userId, json: JSON.stringify(next) };
  await db.insert(schema.userSettings).values(row).onConflictDoUpdate({ target: schema.userSettings.userId, set: row });
  ctx.settings = next;
  return next;
}

/** Suggested models in the settings UI, cheapest first, with a rough per-call cost. */
export const MODEL_OPTIONS = {
  openaiText: [
    { id: "gpt-5-nano", note: "cheapest · ~$0.001 per script" },
    { id: "gpt-5-mini", note: "better breakdowns · ~$0.005" },
    { id: "gpt-4.1-mini", note: "fast, solid JSON" },
  ],
  openaiImage: [
    { id: "gpt-image-1-mini", note: "cheapest · ~$0.005/image at low" },
    { id: "gpt-image-1.5", note: "best likeness (high reference fidelity) · pricier" },
    { id: "gpt-image-2", note: "newest · no fidelity control" },
  ],
  ollamaText: [
    { id: "qwen3:8b", note: "free · runs on this Mac" },
    { id: "qwen3:4b", note: "free · faster, lighter" },
  ],
  geminiText: [
    { id: "gemini-3.8-flash", note: "Google's free tier may cover light use" },
    { id: "gemini-3.1-flash-lite", note: "lightest" },
  ],
  openaiTts: [
    { id: "gpt-4o-mini-tts", note: "cheap · follows acting directions" },
    { id: "tts-1", note: "older, no acting directions" },
  ],
  sarvamModel: [{ id: "bulbul:v2", note: "Indian English + 10 Indian languages" }],
  sarvamLanguage: [
    { id: "en-IN", note: "English (India)" },
    { id: "hi-IN", note: "Hindi" },
    { id: "bn-IN", note: "Bengali" },
    { id: "ta-IN", note: "Tamil" },
    { id: "te-IN", note: "Telugu" },
    { id: "kn-IN", note: "Kannada" },
    { id: "ml-IN", note: "Malayalam" },
    { id: "mr-IN", note: "Marathi" },
    { id: "gu-IN", note: "Gujarati" },
    { id: "pa-IN", note: "Punjabi" },
    { id: "od-IN", note: "Odia" },
  ],
  falVideo: [
    { id: "fal-ai/kling-video/v2.1/standard/image-to-video", note: "Kling — good balance" },
    { id: "fal-ai/bytedance/seedance/v1/lite/image-to-video", note: "Seedance Lite — cheaper" },
    { id: "fal-ai/kling-video/v2.1/master/image-to-video", note: "Kling Master — best, pricier" },
  ],
  elevenlabsModel: [
    { id: "eleven_flash_v2_5", note: "cheapest, fast" },
    { id: "eleven_multilingual_v2", note: "most natural" },
  ],
  geminiImage: [
    { id: "gemini-3.1-flash-image", note: "Nano Banana 2" },
    { id: "gemini-3-pro-image", note: "Nano Banana Pro · best consistency" },
  ],
};
