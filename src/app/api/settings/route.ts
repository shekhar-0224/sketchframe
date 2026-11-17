import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { z } from "zod";
import { MODEL_OPTIONS, PRESET_IDS, PRESET_INFO, getSettings, presetPatch, saveSettings, settingsSchema } from "@/lib/settings";
import { starterStatus } from "@/lib/usage";
import { currentContext } from "@/lib/context";
import { hasKey, imageProviderId, localTextModel, speechProviderId, textProviderId } from "@/lib/ai/registry";

/** Settings + which keys exist (booleans only — key values never leave the server). */
async function payload() {
  const s = getSettings();
  return {
    settings: s,
    active: { text: textProviderId(), image: imageProviderId(), speech: speechProviderId() },
    keys: { openai: hasKey.openai(), gemini: hasKey.gemini(), sarvam: hasKey.sarvam(), elevenlabs: hasKey.elevenlabs(), fal: hasKey.fal() },
    localModel: await localTextModel(s.ollamaTextModel),
    presets: PRESET_INFO,
    starter: await starterStatus(),
    owner: !!currentContext()?.owner,
    options: MODEL_OPTIONS,
  };
}

export const GET = handle(async () => NextResponse.json(await payload()));

/** Either `{ preset }` (one-click) or a partial settings patch (advanced → becomes "custom"). */
export const PUT = handle(async (req: Request) => {
  if (!currentContext()?.owner) return NextResponse.json({ error: "Paid plans are coming soon." }, { status: 403 });
  const body = await req.json();
  if (typeof body?.preset === "string" && Object.keys(body).length === 1) {
    const id = z.enum(PRESET_IDS).parse(body.preset);
    await saveSettings({ ...presetPatch(id, await localTextModel(getSettings().ollamaTextModel)), preset: id });
  } else {
    await saveSettings({ ...settingsSchema.partial().parse(body), preset: "custom" });
  }
  return NextResponse.json(await payload());
});
