/**
 * Which cost tier a panel is drawn with. Shared by the pipeline and the UI so the
 * shot editor can show the tier before anything is generated.
 *
 * - No one in frame, or figures small (establishing / wide / insert) → "filler" (cheapest model).
 * - Faces readable (medium, close-up, two-shot, OTS…) → "cast" (best likeness model).
 * Character references are sent in both tiers, so costumes stay consistent either way.
 */
export type PanelTier = "cast" | "filler";
export type TierOverride = "auto" | PanelTier;

const SMALL_FIGURES = /establish|extreme wide|^wide|insert/i;

export function autoTier(shotSize: string, castCount: number): PanelTier {
  if (castCount === 0) return "filler";
  return SMALL_FIGURES.test(shotSize.trim()) ? "filler" : "cast";
}

export function panelTier(shot: { shotSize: string; characterIds: string[]; tier: string }): PanelTier {
  if (shot.tier === "cast" || shot.tier === "filler") return shot.tier;
  return autoTier(shot.shotSize, shot.characterIds.length);
}

export const TIER_LABEL: Record<PanelTier, string> = { cast: "Best", filler: "Cheap" };
