import type { ProjectBundle } from "@/lib/data";

/**
 * The guided path: 1 Script → 2 Check → 3 Cast → 4 Board → 5 Movie.
 * Each step unlocks only when the one before is finished, so the order is always:
 * read the story, let the user check/fix the breakdown, draw the characters first,
 * then the panels (which copy those characters), then the movie.
 */
export type StepKey = "script" | "review" | "cast" | "board" | "movie";

export const STEPS: { key: StepKey; path: string; label: string; short: string; next: string }[] = [
  { key: "script", path: "/script", label: "Script", short: "Script", next: "Write the script" },
  { key: "review", path: "/breakdown", label: "Check", short: "Check", next: "Check your story" },
  { key: "cast", path: "/characters", label: "Cast", short: "Cast", next: "Draw your cast" },
  { key: "board", path: "", label: "Board", short: "Board", next: "Draw the board" },
  { key: "movie", path: "/movie", label: "Movie", short: "Movie", next: "Make the movie" },
];

export type StepState = { unlocked: boolean; done: boolean; lockedReason?: string };

export function stepStates(b: Pick<ProjectBundle, "shots" | "characters" | "project">): Record<StepKey, StepState> {
  const hasShots = b.shots.length > 0;
  const reviewed = hasShots && !!b.project.reviewedAt;
  const drawn = b.shots.filter((s) => s.imageUrl).length;
  const castReady = b.characters.every((c) => c.references.some((r) => r.kind === "front" || r.kind === "upload"));
  const needScript = "Add your story and press “Break it down” first.";
  const needReview = "Check the breakdown first (step 2).";
  return {
    script: { unlocked: true, done: hasShots },
    review: { unlocked: hasShots, done: reviewed, lockedReason: needScript },
    cast: { unlocked: reviewed, done: reviewed && castReady, lockedReason: hasShots ? needReview : needScript },
    board: {
      unlocked: reviewed && castReady,
      done: reviewed && castReady && drawn === b.shots.length,
      lockedReason: reviewed ? "Draw your characters first (step 3)." : hasShots ? needReview : needScript,
    },
    movie: { unlocked: drawn > 0, done: false, lockedReason: "Draw at least one panel first." },
  };
}

export function stepFromPath(pathname: string, base: string): StepKey {
  if (pathname.startsWith(`${base}/script`)) return "script";
  if (pathname.startsWith(`${base}/breakdown`)) return "review";
  if (pathname.startsWith(`${base}/characters`)) return "cast";
  if (pathname.startsWith(`${base}/movie`)) return "movie";
  return "board";
}

/** Where to send someone who opens a step that isn't ready: the first unfinished unlocked step. */
export function bestStep(states: Record<StepKey, StepState>): StepKey {
  const unlocked = STEPS.filter((s) => states[s.key].unlocked);
  const firstUndone = unlocked.find((s) => !states[s.key].done);
  return (firstUndone ?? unlocked.at(-1)!).key;
}
