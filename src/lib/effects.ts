/**
 * Movie overlays (weather + light). Shared by server and client: the Movie tab shows which
 * effects were auto-detected from the script, and the engine draws them.
 */
export const EFFECTS = [
  { id: "rain", label: "Rain", re: /\b(rain|raining|rainy|downpour|drizzl\w*|storm\w*|wet street)\b/i },
  { id: "snow", label: "Snow", re: /\b(snow\w*|blizzard|sleet)\b/i },
  { id: "fog", label: "Fog / smoke", re: /\b(fog\w*|mist\w*|smoke|smoky|steam\w*|haze|hazy|dust\w*)\b/i },
  { id: "flicker", label: "Flicker", re: /\b(neon|flicker\w*|candle\w*|fire|firelight|fluorescent|strobe)\b/i },
  { id: "sweep", label: "Light sweep", re: /\b(headlights?|searchlights?|flashlights?|spotlight|beam of light|light sweeps?)\b/i },
  { id: "lightning", label: "Lightning", re: /\b(lightning|thunder\w*)\b/i },
] as const;

export type EffectId = (typeof EFFECTS)[number]["id"];

/** Effects implied by the shot and its scene. Scene text carries weather across a scene's shots. */
export function autoEffects(text: { scene: string; shot: string }): EffectId[] {
  const all = `${text.scene}\n${text.shot}`;
  return EFFECTS.filter((e) => {
    // Momentary light events only fire on the shot that mentions them.
    if (e.id === "sweep" || e.id === "lightning") return e.re.test(text.shot);
    return e.re.test(all);
  }).map((e) => e.id);
}

export function effectsFor(shot: { effects: string[] | null; action: string; notes: string; promptExtra: string }, sceneText: string) {
  if (shot.effects) return shot.effects as EffectId[];
  return autoEffects({ scene: sceneText, shot: `${shot.action}\n${shot.notes}\n${shot.promptExtra}` });
}
