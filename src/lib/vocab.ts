/** Shared shot vocabulary. Used as suggestion chips — free text is still allowed. */
export const SHOT_SIZES = [
  "Establishing",
  "Extreme wide",
  "Wide",
  "Full",
  "Medium wide",
  "Medium",
  "Medium close-up",
  "Close-up",
  "Extreme close-up",
  "Insert",
  "Two-shot",
  "Over-the-shoulder",
] as const;

export const CAMERA_ANGLES = [
  "Eye level",
  "Low angle",
  "High angle",
  "Bird's eye",
  "Worm's eye",
  "Dutch tilt",
  "Over-the-shoulder",
  "POV",
  "Profile",
] as const;

export const CAMERA_MOVES = ["Static", "Pan", "Tilt", "Push in", "Pull out", "Dolly", "Tracking", "Crane", "Handheld", "Zoom"] as const;

export const SHOT_SIZE_ABBR: Record<string, string> = {
  Establishing: "EST",
  "Extreme wide": "EWS",
  Wide: "WS",
  Full: "FS",
  "Medium wide": "MWS",
  Medium: "MS",
  "Medium close-up": "MCU",
  "Close-up": "CU",
  "Extreme close-up": "ECU",
  Insert: "INS",
  "Two-shot": "2S",
  "Over-the-shoulder": "OTS",
};

export const abbr = (size: string) => SHOT_SIZE_ABBR[size] ?? size.slice(0, 3).toUpperCase();

/** Everyday words for the UI (the PDF keeps the pro abbreviations). */
const SHOT_SIZE_PLAIN: Record<string, string> = {
  Establishing: "Wide",
  "Extreme wide": "Very wide",
  Wide: "Wide",
  Full: "Full body",
  "Medium wide": "Knees up",
  Medium: "Waist up",
  "Medium close-up": "Chest up",
  "Close-up": "Close",
  "Extreme close-up": "Very close",
  Insert: "Detail",
  "Two-shot": "Two people",
  "Over-the-shoulder": "Over shoulder",
};

export const plainSize = (size: string) => SHOT_SIZE_PLAIN[size] ?? size;

export const ASPECT_RATIOS = ["16:9", "2.39:1", "4:3", "1:1", "9:16"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const aspectToCss = (a: string) => (a === "2.39:1" ? "2.39 / 1" : a.replace(":", " / "));

export const REFERENCE_VIEWS = ["front", "three_quarter", "side", "expressions"] as const;
export type ReferenceView = (typeof REFERENCE_VIEWS)[number];
export const VIEW_LABEL: Record<string, string> = {
  front: "Front",
  three_quarter: "¾ view",
  side: "Side",
  expressions: "Expressions",
  upload: "Your reference",
};
