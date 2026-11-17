import "server-only";
import crypto from "node:crypto";
import { cookies } from "next/headers";
import { and, eq, gt, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { getDb, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import type { RequestContext } from "@/lib/context";
import { defaults, settingsSchema } from "@/lib/settings";

const { users, sessions, loginCodes, userKeys, userSettings, projects } = schema;

export const SESSION_COOKIE = "sf_session";
const SESSION_DAYS = 30;
const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_MS = 15 * 60 * 1000;

/** Provider keys a user can bring. Env-style names so they map 1:1 to .env vars. */
export const KEY_NAMES = ["OPENAI_API_KEY", "GEMINI_API_KEY", "FAL_KEY", "SARVAM_API_KEY", "ELEVENLABS_API_KEY"] as const;
export type KeyName = (typeof KEY_NAMES)[number];

function secret() {
  const s = process.env.SKETCHFRAME_SECRET;
  if (s) return s;
  if (process.env.VERCEL) throw new Error("SKETCHFRAME_SECRET must be set in production");
  return "sketchframe-local-dev-secret"; // local single-machine use only
}

const sha256 = (v: string) => crypto.createHash("sha256").update(v).digest("hex");
const hmac = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("hex");

/** Tamper-proof short-lived values (e.g. passkey challenges kept in a cookie). */
export function signValue(value: string, ttlMs: number) {
  const body = `${value}.${Date.now() + ttlMs}`;
  return `${body}.${hmac(body)}`;
}
export function readSignedValue(signed: string | undefined) {
  if (!signed) return null;
  const i = signed.lastIndexOf(".");
  const body = signed.slice(0, i);
  const mac = signed.slice(i + 1);
  if (mac.length !== 64 || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(hmac(body)))) return null;
  const j = body.lastIndexOf(".");
  if (Number(body.slice(j + 1)) < Date.now()) return null;
  return body.slice(0, j);
}

// --- Key encryption (AES-256-GCM) ------------------------------------------------

function aesKey() {
  return crypto.createHash("sha256").update(`keys:${secret()}`).digest();
}

export function encryptKey(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey(), iv);
  const body = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), body].map((b) => b.toString("base64")).join(".");
}

export function decryptKey(packed: string) {
  const [iv, tag, body] = packed.split(".").map((p) => Buffer.from(p, "base64"));
  const decipher = crypto.createDecipheriv("aes-256-gcm", aesKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString("utf8");
}

/** Which server keys SHARE_SERVER_KEYS lends out (default: OpenAI only — cheap and metered). */
export function sharedKeyNames(): string[] {
  const list = (process.env.SHARED_KEYS || "OPENAI_API_KEY").split(",").map((s) => s.trim());
  return list.filter((n): n is KeyName => (KEY_NAMES as readonly string[]).includes(n));
}

// --- Owner ------------------------------------------------------------------------

/**
 * The owner may use the server's .env keys and inherits boards made before accounts
 * existed. Set OWNER_EMAIL in production; locally, with no OWNER_EMAIL, everyone who
 * signs in on this machine counts as the owner.
 */
export function isOwner(email: string) {
  // Guest and passkey-only accounts use placeholder addresses and are never the owner.
  if (email.endsWith("@sketchframe.local")) return false;
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (owner) return email === owner;
  return !process.env.VERCEL;
}

// --- Login codes ------------------------------------------------------------------

export const normalizeEmail = (e: string) => e.trim().toLowerCase();

export async function issueLoginCode(email: string) {
  const db = await getDb();
  const now = Date.now();
  const [existing] = await db.select().from(loginCodes).where(eq(loginCodes.email, email));
  const inWindow = existing && now - existing.windowStart < SEND_WINDOW_MS;
  if (inWindow && existing.sentCount >= MAX_SENDS_PER_WINDOW) throw new Error("Too many codes requested — try again in 15 minutes.");

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const row = {
    email,
    codeHash: hmac(`${email}:${code}`),
    expiresAt: now + CODE_MINUTES * 60 * 1000,
    attempts: 0,
    sentCount: inWindow ? existing.sentCount + 1 : 1,
    windowStart: inWindow ? existing.windowStart : now,
  };
  await db.insert(loginCodes).values(row).onConflictDoUpdate({ target: loginCodes.email, set: row });
  return code;
}

/** Check a code; on success returns the (possibly new) user and deletes the code. */
export async function consumeLoginCode(email: string, code: string): Promise<User> {
  const db = await getDb();
  const [row] = await db.select().from(loginCodes).where(eq(loginCodes.email, email));
  if (!row || row.expiresAt < Date.now()) throw new Error("That code has expired — request a new one.");
  if (row.attempts >= MAX_ATTEMPTS) throw new Error("Too many wrong attempts — request a new code.");
  const ok = crypto.timingSafeEqual(Buffer.from(row.codeHash), Buffer.from(hmac(`${email}:${code.trim()}`)));
  if (!ok) {
    await db.update(loginCodes).set({ attempts: row.attempts + 1 }).where(eq(loginCodes.email, email));
    throw new Error("Wrong code.");
  }
  await db.delete(loginCodes).where(eq(loginCodes.email, email));
  return userForVerifiedEmail(email);
}

/**
 * The account for an email whose ownership was just proven (login code or Google).
 * Creates it on first sign-in; the owner also inherits boards made before accounts existed.
 */
export async function userForVerifiedEmail(rawEmail: string): Promise<User> {
  const email = normalizeEmail(rawEmail);
  const db = await getDb();
  let [user] = await db.select().from(users).where(eq(users.email, email));
  if (!user) {
    user = { id: nanoid(), email, createdAt: Date.now(), lastLoginAt: null, guest: false };
    await db.insert(users).values(user);
  }
  await db.update(users).set({ lastLoginAt: Date.now() }).where(eq(users.id, user.id));
  if (isOwner(email)) await db.update(projects).set({ userId: user.id }).where(isNull(projects.userId));
  return user;
}

// --- Guests -----------------------------------------------------------------------

/**
 * "Try free" visitors get a real (but anonymous) account so everything they make is
 * saved. Guests are never the owner: they only get free providers or keys they add.
 */
export async function createGuest(): Promise<User> {
  const db = await getDb();
  const id = nanoid();
  const user = { id, email: `guest+${id}@guest.sketchframe.local`, createdAt: Date.now(), lastLoginAt: Date.now(), guest: true };
  await db.insert(users).values(user);
  return user;
}

/** On sign-in, a guest's boards (and keys/settings, if the account has none) move to the real account. */
export async function adoptGuest(guestId: string, userId: string) {
  if (guestId === userId) return;
  const db = await getDb();
  await db.update(projects).set({ userId }).where(eq(projects.userId, guestId));
  const [hasSettings] = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  if (!hasSettings) await db.update(userSettings).set({ userId }).where(eq(userSettings.userId, guestId));
  const existing = new Set((await db.select({ name: userKeys.name }).from(userKeys).where(eq(userKeys.userId, userId))).map((k) => k.name));
  for (const k of await db.select().from(userKeys).where(eq(userKeys.userId, guestId))) {
    if (!existing.has(k.name)) await db.update(userKeys).set({ userId }).where(and(eq(userKeys.userId, guestId), eq(userKeys.name, k.name)));
  }
  await db.delete(users).where(eq(users.id, guestId)); // cascades the guest's sessions/leftovers
}

// --- Sessions ---------------------------------------------------------------------

export async function createSession(userId: string) {
  const db = await getDb();
  const token = crypto.randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  await db.insert(sessions).values({ tokenHash: sha256(token), userId, expiresAt });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  }
  jar.delete(SESSION_COOKIE);
}

export async function currentUser(): Promise<User | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const db = await getDb();
  const [row] = await db
    .select({ user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, Date.now())));
  return row?.user ?? null;
}

// --- Context (keys + settings) ----------------------------------------------------

export async function loadContext(user: User): Promise<RequestContext> {
  const db = await getDb();
  const [keyRows, [settingsRow]] = await Promise.all([
    db.select().from(userKeys).where(eq(userKeys.userId, user.id)),
    db.select().from(userSettings).where(eq(userSettings.userId, user.id)),
  ]);
  const keys: Record<string, string> = {};
  const sharedKeys: string[] = [];
  const owner = !user.guest && isOwner(user.email);
  // The owner falls back to the server's own keys; everyone else (and every guest) brings theirs.
  if (owner) for (const name of KEY_NAMES) if (process.env[name]) keys[name] = process.env[name]!;
  for (const row of keyRows) {
    try {
      keys[row.name] = decryptKey(row.ciphertext);
    } catch {
      /* secret rotated: the user re-enters the key */
    }
  }
  // Demo mode: lend the server's keys to everyone else (metered + capped in lib/usage.ts).
  if (process.env.SHARE_SERVER_KEYS === "true") {
    for (const name of sharedKeyNames()) {
      if (!keys[name] && process.env[name]) {
        keys[name] = process.env[name]!;
        sharedKeys.push(name);
      }
    }
  }
  let saved = {};
  // Free plan: everyone but the owner runs the default (best affordable) setup, whatever they saved before.
  if (owner) try {
    saved = settingsSchema.partial().parse(JSON.parse(settingsRow?.json ?? "{}"));
  } catch {
    /* ignore malformed */
  }
  return { userId: user.id, email: user.email, keys, sharedKeys, owner, settings: { ...defaults(), ...saved } };
}

export async function listKeys(userId: string) {
  const db = await getDb();
  return db.select({ name: userKeys.name, last4: userKeys.last4, updatedAt: userKeys.updatedAt }).from(userKeys).where(eq(userKeys.userId, userId));
}

export async function setKey(userId: string, name: KeyName, value: string | null) {
  const db = await getDb();
  if (!value) {
    await db.delete(userKeys).where(and(eq(userKeys.userId, userId), eq(userKeys.name, name)));
    return;
  }
  const row = { userId, name, ciphertext: encryptKey(value), last4: value.slice(-4), updatedAt: Date.now() };
  await db.insert(userKeys).values(row).onConflictDoUpdate({ target: [userKeys.userId, userKeys.name], set: row });
}
