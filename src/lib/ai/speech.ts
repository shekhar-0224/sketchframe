import "server-only";
import { normaliseWav, pcmToWav } from "@/lib/audio/wav";
import { ProviderError } from "./types";
import { apiKey } from "@/lib/context";

/**
 * Voice (text-to-speech) providers. Same pattern as text/image: pipelines talk to this
 * interface only, so adding a provider is one class plus one line in getSpeechProvider().
 * Every provider returns 16-bit PCM WAV plus its duration in seconds.
 */
export type Gender = "female" | "male" | "neutral";
export type Voice = { id: string; label: string; gender: Gender; note?: string };

export interface SpeechRequest {
  text: string;
  voice: string;
  /** Acting direction ("gravelly, tired, whispering"). Used where the model supports it. */
  instructions?: string;
}

export interface SpeechProvider {
  readonly id: SpeechProviderId;
  listVoices(): Promise<Voice[]>;
  synthesize(req: SpeechRequest): Promise<{ wav: Buffer; seconds: number }>;
}

export type SpeechProviderId = "browser" | "openai" | "sarvam" | "elevenlabs";

async function fail(provider: string, res: Response): Promise<never> {
  throw new ProviderError(provider, `${res.status} ${(await res.text()).slice(0, 300)}`, res.status);
}

/** OpenAI gpt-4o-mini-tts: cheap, and follows free-text acting instructions. */
export class OpenAISpeech implements SpeechProvider {
  readonly id = "openai" as const;
  constructor(private model: string) {}

  async listVoices(): Promise<Voice[]> {
    return [
      { id: "coral", label: "Coral", gender: "female", note: "warm" },
      { id: "nova", label: "Nova", gender: "female", note: "bright" },
      { id: "shimmer", label: "Shimmer", gender: "female", note: "soft" },
      { id: "sage", label: "Sage", gender: "female", note: "calm" },
      { id: "ash", label: "Ash", gender: "male", note: "clear" },
      { id: "onyx", label: "Onyx", gender: "male", note: "deep" },
      { id: "echo", label: "Echo", gender: "male", note: "even" },
      { id: "ballad", label: "Ballad", gender: "male", note: "older, gentle" },
      { id: "verse", label: "Verse", gender: "male", note: "expressive" },
      { id: "alloy", label: "Alloy", gender: "neutral" },
      { id: "fable", label: "Fable", gender: "neutral", note: "storyteller" },
    ];
  }

  async synthesize(req: SpeechRequest) {
    const res = await fetch(`${(process.env.OPENAI_BASE_URL || "https://api.openai.com/v1").replace(/\/+$/, "")}/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey("OPENAI_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        voice: req.voice,
        input: req.text,
        // Raw PCM (24 kHz s16le mono): streamed WAV headers carry bogus lengths.
        response_format: "pcm",
        ...(req.instructions && this.model.includes("gpt") && { instructions: req.instructions }),
      }),
    });
    if (!res.ok) await fail("openai-tts", res);
    const pcm = Buffer.from(await res.arrayBuffer());
    return { wav: pcmToWav(pcm, 24000), seconds: pcm.length / 48000 };
  }
}

/**
 * Sarvam AI "Bulbul": natural Indian-English and Indian-language voices.
 * Language is set in settings (en-IN, hi-IN, ta-IN, …); speakers are model-specific.
 */
export class SarvamSpeech implements SpeechProvider {
  readonly id = "sarvam" as const;
  constructor(
    private model: string,
    private language: string,
  ) {}

  async listVoices(): Promise<Voice[]> {
    return [
      { id: "anushka", label: "Anushka", gender: "female" },
      { id: "manisha", label: "Manisha", gender: "female" },
      { id: "vidya", label: "Vidya", gender: "female" },
      { id: "arya", label: "Arya", gender: "female" },
      { id: "abhilash", label: "Abhilash", gender: "male" },
      { id: "karun", label: "Karun", gender: "male" },
      { id: "hitesh", label: "Hitesh", gender: "male" },
    ];
  }

  async synthesize(req: SpeechRequest) {
    const res = await fetch("https://api.sarvam.ai/text-to-speech", {
      method: "POST",
      headers: { "api-subscription-key": apiKey("SARVAM_API_KEY") || "", "Content-Type": "application/json" },
      body: JSON.stringify({
        text: req.text,
        target_language_code: this.language,
        speaker: req.voice,
        model: this.model,
        speech_sample_rate: 24000,
      }),
    });
    if (!res.ok) await fail("sarvam", res);
    const json = (await res.json()) as { audios?: string[] };
    if (!json.audios?.length) throw new ProviderError("sarvam", "No audio returned");
    // Long lines can come back in several chunks; join their PCM.
    const parts = json.audios.map((b64) => normaliseWav(Buffer.from(b64, "base64")));
    if (parts.length === 1) return parts[0];
    const pcm = Buffer.concat(parts.map((p) => p.wav.subarray(44)));
    return { wav: pcmToWav(pcm, 24000), seconds: parts.reduce((a, p) => a + p.seconds, 0) };
  }
}

/** ElevenLabs: very natural voices; has a free monthly character allowance. */
export class ElevenLabsSpeech implements SpeechProvider {
  readonly id = "elevenlabs" as const;
  constructor(private model: string) {}

  async listVoices(): Promise<Voice[]> {
    const res = await fetch("https://api.elevenlabs.io/v1/voices", { headers: { "xi-api-key": apiKey("ELEVENLABS_API_KEY") || "" } });
    if (!res.ok) await fail("elevenlabs", res);
    const json = (await res.json()) as { voices: Array<{ voice_id: string; name: string; labels?: Record<string, string> }> };
    return json.voices.map((v) => {
      const g = (v.labels?.gender || "").toLowerCase();
      return {
        id: v.voice_id,
        label: v.name,
        gender: g === "female" ? "female" : g === "male" ? "male" : "neutral",
        note: [v.labels?.age, v.labels?.accent].filter(Boolean).join(", ") || undefined,
      };
    });
  }

  async synthesize(req: SpeechRequest) {
    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(req.voice)}?output_format=pcm_24000`, {
      method: "POST",
      headers: { "xi-api-key": apiKey("ELEVENLABS_API_KEY") || "", "Content-Type": "application/json" },
      body: JSON.stringify({ text: req.text, model_id: this.model }),
    });
    if (!res.ok) await fail("elevenlabs", res);
    const pcm = Buffer.from(await res.arrayBuffer());
    return { wav: pcmToWav(pcm, 24000), seconds: pcm.length / 48000 };
  }
}

/**
 * Free: no server audio at all — the Movie player speaks lines with the browser's
 * built-in voices. Preview only (browser speech can't be recorded into the export).
 */
export class BrowserSpeech implements SpeechProvider {
  readonly id = "browser" as const;
  async listVoices(): Promise<Voice[]> {
    return [
      { id: "female", label: "Browser — female", gender: "female" },
      { id: "male", label: "Browser — male", gender: "male" },
    ];
  }
  async synthesize(): Promise<never> {
    throw new Error("Browser voices are spoken live in the player, not generated on the server");
  }
}

/** Guess gender/age from the character bible so every character gets a fitting default voice. */
export function inferVoiceTraits(description: string) {
  const d = description.toLowerCase();
  const female = /\b(woman|female|girl|lady|she|her|mother|grandmother|wife|queen)\b/.test(d);
  const male = /\b(man|male|boy|guy|he|his|father|grandfather|husband|king)\b/.test(d);
  const age = Number(/\b(\d{2})s\b/.exec(d)?.[1] ?? /\b(\d{2})\s*(?:yo|years? old)\b/.exec(d)?.[1] ?? NaN);
  const old = age >= 60 || /\b(old|elderly|aged|grey-haired|gray-haired)\b/.test(d);
  return { gender: (female && !male ? "female" : male && !female ? "male" : female ? "female" : "neutral") as Gender, old };
}

/** Deterministic default: spread characters across voices of the right gender. */
export function defaultVoice(voices: Voice[], traits: { gender: Gender; old: boolean }, seed: string, taken: string[] = []) {
  // Unknown gender: choose from every voice rather than only the neutral ones.
  const pool = traits.gender === "neutral" ? voices : voices.filter((v) => v.gender === traits.gender);
  const candidates = (pool.length ? pool : voices).filter((v) => !taken.includes(v.id));
  const list = candidates.length ? candidates : pool.length ? pool : voices;
  if (traits.old) {
    const older = list.find((v) => /old|deep|gentle/i.test(v.note ?? ""));
    if (older) return older.id;
  }
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length].id;
}
