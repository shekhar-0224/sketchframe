import { sqliteTable, text, integer, real, index, primaryKey } from "drizzle-orm/sqlite-core";

const now = () => Date.now();

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  lastLoginAt: integer("last_login_at"),
  /** "Try free" visitors: no email yet, never the owner, merged into a real account on sign-in. */
  guest: integer("guest", { mode: "boolean" }).notNull().default(false),
});

/** Opaque session cookies; only a SHA-256 of the token is stored. */
export const sessions = sqliteTable(
  "sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: integer("expires_at").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

/**
 * Passkeys (Face ID / fingerprint / screen lock). Only the public key is stored; the
 * private key never leaves the person's device. Discoverable, so no email is needed.
 */
export const passkeys = sqliteTable(
  "passkeys",
  {
    /** Credential ID (base64url). */
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** COSE public key, base64url. */
    publicKey: text("public_key").notNull(),
    counter: integer("counter").notNull().default(0),
    transports: text("transports", { mode: "json" }).$type<string[]>(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    lastUsedAt: integer("last_used_at"),
  },
  (t) => [index("passkeys_user_idx").on(t.userId)],
);

/**
 * Usage counters for lent server keys: scope "user:<id>" / "all", period "total" or a
 * UTC day like "2026-10-27". Used for starter-drawing caps (see lib/usage.ts).
 */
export const usageCounters = sqliteTable(
  "usage_counters",
  {
    scope: text("scope").notNull(),
    period: text("period").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.scope, t.period] })],
);

/** One pending email login code per address (hashed). */
export const loginCodes = sqliteTable("login_codes", {
  email: text("email").primaryKey(),
  codeHash: text("code_hash").notNull(),
  expiresAt: integer("expires_at").notNull(),
  attempts: integer("attempts").notNull().default(0),
  /** For rate limiting code requests. */
  sentCount: integer("sent_count").notNull().default(1),
  windowStart: integer("window_start").notNull().$defaultFn(now),
});

/** Bring-your-own API keys, AES-256-GCM encrypted with SKETCHFRAME_SECRET. */
export const userKeys = sqliteTable(
  "user_keys",
  {
    userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
    /** Env-style name, e.g. OPENAI_API_KEY. */
    name: text("name").notNull(),
    ciphertext: text("ciphertext").notNull(),
    last4: text("last4").notNull(),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [primaryKey({ columns: [t.userId, t.name] })],
);

/** Per-user AI settings (preset, models) as JSON. */
export const userSettings = sqliteTable("user_settings", {
  userId: text("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  json: text("json").notNull(),
});

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  /** Owner. Null only for boards created before accounts existed (claimed by the owner on login). */
  userId: text("user_id"),
  /** Public read-only movie link (/s/<token>); null = not shared. */
  shareToken: text("share_token").unique(),
  title: text("title").notNull(),
  logline: text("logline").notNull().default(""),
  scriptText: text("script_text").notNull().default(""),
  /** "script" when the user supplied a script, "idea" when the script was expanded from a premise. */
  sourceKind: text("source_kind").notNull().default("script"),
  artStyle: text("art_style").notNull().default("sketch"),
  aspectRatio: text("aspect_ratio").notNull().default("16:9"),
  /** When the user approved the breakdown (step 2). Null = still to review; reset on re-breakdown. */
  reviewedAt: integer("reviewed_at"),
  /** idle | breaking_down | error */
  status: text("status").notNull().default("idle"),
  statusError: text("status_error"),
  createdAt: integer("created_at").notNull().$defaultFn(now),
  updatedAt: integer("updated_at").notNull().$defaultFn(now),
});

export const characters = sqliteTable(
  "characters",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    role: text("role").notNull().default("supporting"),
    /** Visual bible: the text that is always injected into prompts with this character. */
    description: text("description").notNull().default(""),
    personality: text("personality").notNull().default(""),
    /** Locked sheets are never regenerated implicitly and are always used for conditioning. */
    locked: integer("locked", { mode: "boolean" }).notNull().default(false),
    /** Voice id for the active speech provider ("" = auto-pick from the description). */
    voice: text("voice").notNull().default(""),
    /** Acting direction sent to the voice model, e.g. "gravelly, tired, dry humour". */
    voiceStyle: text("voice_style").notNull().default(""),
    /** empty | generating | ready | error */
    sheetStatus: text("sheet_status").notNull().default("empty"),
    sheetError: text("sheet_error"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("characters_project_idx").on(t.projectId)],
);

export const scenes = sqliteTable(
  "scenes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    position: integer("position").notNull(),
    heading: text("heading").notNull().default(""),
    location: text("location").notNull().default(""),
    timeOfDay: text("time_of_day").notNull().default(""),
    summary: text("summary").notNull().default(""),
  },
  (t) => [index("scenes_project_idx").on(t.projectId)],
);

export const shots = sqliteTable(
  "shots",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    sceneId: text("scene_id").references(() => scenes.id, { onDelete: "set null" }),
    /** Global order across the whole board; scenes are derived groupings. */
    position: integer("position").notNull(),
    shotSize: text("shot_size").notNull().default("Medium"),
    cameraAngle: text("camera_angle").notNull().default("Eye level"),
    cameraMove: text("camera_move").notNull().default("Static"),
    action: text("action").notNull().default(""),
    dialogue: text("dialogue").notNull().default(""),
    speaker: text("speaker").notNull().default(""),
    notes: text("notes").notNull().default(""),
    /** Seconds on screen in the movie. */
    duration: real("duration").notNull().default(3),
    /** JSON array of character ids appearing in frame. */
    characterIds: text("character_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    /** Extra instructions appended to the generated prompt. */
    promptExtra: text("prompt_extra").notNull().default(""),
    imagePath: text("image_path"),
    /** Rough sketch / edited panel used as a composition guide on (re)generation. */
    layoutPath: text("layout_path"),
    /** empty | generating | ready | error */
    imageStatus: text("image_status").notNull().default("empty"),
    imageError: text("image_error"),
    /** Bumped on every image change so the UI can cache-bust. */
    imageVersion: integer("image_version").notNull().default(0),
    /** Cost tier override: auto | cast (best model) | filler (cheapest). See lib/tiers.ts. */
    tier: text("tier").notNull().default("auto"),
    /** Spoken dialogue for the movie (WAV). audioKey = hash of text+voice, to detect stale audio. */
    audioPath: text("audio_path"),
    audioSeconds: real("audio_seconds"),
    audioKey: text("audio_key"),
    /** empty | generating | ready | error */
    audioStatus: text("audio_status").notNull().default("empty"),
    audioError: text("audio_error"),
    /** Depth map (near = white) for 2.5D parallax; valid while depthVersion === imageVersion. */
    depthPath: text("depth_path"),
    depthVersion: integer("depth_version"),
    /** Weather/light overlays for the movie; null = auto-detect from the script. */
    effects: text("effects", { mode: "json" }).$type<string[] | null>(),
    /** Optional AI-animated clip (image-to-video) of the panel. */
    clipPath: text("clip_path"),
    clipSeconds: real("clip_seconds"),
    /** empty | generating | ready | error */
    clipStatus: text("clip_status").notNull().default("empty"),
    clipError: text("clip_error"),
    /** "provider:model" that drew the current image. */
    lastModel: text("last_model"),
    /** Which reference images were sent on the last generation (for transparency in the UI). */
    lastReferenceIds: text("last_reference_ids", { mode: "json" }).$type<string[]>().notNull().default([]),
    createdAt: integer("created_at").notNull().$defaultFn(now),
    updatedAt: integer("updated_at").notNull().$defaultFn(now),
  },
  (t) => [index("shots_project_idx").on(t.projectId, t.position)],
);

/**
 * Every picture a shot has had ("takes"), so redrawing never throws work away. The shot's
 * imagePath is always one of these; old takes beyond a small cap are pruned (lib/takes.ts).
 */
export const shotTakes = sqliteTable(
  "shot_takes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    shotId: text("shot_id").notNull().references(() => shots.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    /** "provider:model" that drew it, or "you" for uploads and edits. */
    model: text("model"),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("takes_shot_idx").on(t.shotId, t.createdAt)],
);

/**
 * Every character sheet a character has had. A sheet is a set of views drawn together
 * (front, plus ¾/side/expressions on paid plans); the live set is copied into
 * reference_images, so everything that reads references is unchanged.
 */
export const sheetTakes = sqliteTable(
  "sheet_takes",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    characterId: text("character_id").notNull().references(() => characters.id, { onDelete: "cascade" }),
    views: text("views", { mode: "json" }).$type<{ kind: string; path: string }[]>().notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("sheet_takes_character_idx").on(t.characterId, t.createdAt)],
);

/**
 * Reference images. For characters: turnaround views (front, three_quarter, side,
 * expressions) generated in sketch style, or user uploads. Kept in its own table so
 * future references (locations, props) can reuse the same conditioning path.
 */
export const referenceImages = sqliteTable(
  "reference_images",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id, { onDelete: "cascade" }),
    characterId: text("character_id").references(() => characters.id, { onDelete: "cascade" }),
    /** front | three_quarter | side | expressions | upload */
    kind: text("kind").notNull(),
    path: text("path").notNull(),
    createdAt: integer("created_at").notNull().$defaultFn(now),
  },
  (t) => [index("refs_character_idx").on(t.characterId)],
);

export type Project = typeof projects.$inferSelect;
export type Character = typeof characters.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type Shot = typeof shots.$inferSelect;
export type ReferenceImage = typeof referenceImages.$inferSelect;
export type User = typeof users.$inferSelect;
export type ShotTake = typeof shotTakes.$inferSelect;
export type SheetTake = typeof sheetTakes.$inferSelect;
