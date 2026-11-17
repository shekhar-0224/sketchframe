import "server-only";
import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";
import { currentContext } from "@/lib/context";

/**
 * Starter drawings: when the server lends its OpenAI key (SHARE_SERVER_KEYS), pictures are
 * capped per user and for the whole site, both per UTC day — a hard spending ceiling.
 * Over either cap, drawing falls back to the free tier instead of failing.
 */
const { usageCounters } = schema;

export const STARTER_PER_USER = () => Number(process.env.STARTER_IMAGES_PER_USER || 30);
export const STARTER_PER_DAY = () => Number(process.env.STARTER_DAILY_IMAGES || 200);

const today = () => new Date().toISOString().slice(0, 10);

/** True when the current user's OpenAI key is a lent server key (so pictures are metered). */
export const usingSharedOpenAI = () => !!currentContext()?.sharedKeys?.includes("OPENAI_API_KEY");

async function read(scope: string, period: string) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(usageCounters)
    .where(and(eq(usageCounters.scope, scope), eq(usageCounters.period, period)));
  return row?.count ?? 0;
}

/** Increment only while under the cap; returns whether a unit was taken. */
async function take(scope: string, period: string, cap: number) {
  const db = await getDb();
  await db.insert(usageCounters).values({ scope, period, count: 0 }).onConflictDoNothing();
  const res = await db
    .update(usageCounters)
    .set({ count: sql`${usageCounters.count} + 1` })
    .where(and(eq(usageCounters.scope, scope), eq(usageCounters.period, period), lt(usageCounters.count, cap)));
  return res.rowsAffected > 0;
}

async function give(scope: string, period: string) {
  const db = await getDb();
  await db
    .update(usageCounters)
    .set({ count: sql`max(${usageCounters.count} - 1, 0)` })
    .where(and(eq(usageCounters.scope, scope), eq(usageCounters.period, period)));
}

/** Reserve one starter drawing for the current user. Returns a refund function, or null if capped. */
export async function reserveStarterImage(): Promise<(() => Promise<void>) | null> {
  const userId = currentContext()?.userId;
  if (!userId) return null;
  const day = today();
  if (!(await take("all", day, STARTER_PER_DAY()))) return null;
  if (!(await take(`user:${userId}`, day, STARTER_PER_USER()))) {
    await give("all", day);
    return null;
  }
  return async () => {
    await give("all", day);
    await give(`user:${userId}`, day);
  };
}

/**
 * Site-wide daily ceilings for the other lent-key calls (script reading and voices). Cheap per
 * call, but uncapped they'd be an open tab. Returns whether a call may use the shared key.
 */
export const SHARED_TEXT_PER_DAY = () => Number(process.env.SHARED_DAILY_TEXT_CALLS || 2000);
export const SHARED_VOICE_PER_DAY = () => Number(process.env.SHARED_DAILY_VOICE_CALLS || 1500);

export const reserveSharedText = () => take("text:all", today(), SHARED_TEXT_PER_DAY());
export const reserveSharedVoice = () => take("voice:all", today(), SHARED_VOICE_PER_DAY());

/** For the UI: how many starter drawings this user has left (null when keys aren't lent). */
export async function starterStatus() {
  const ctx = currentContext();
  if (!ctx || !usingSharedOpenAI()) return null;
  const [used, usedToday] = await Promise.all([read(`user:${ctx.userId}`, today()), read("all", today())]);
  return {
    left: Math.max(0, STARTER_PER_USER() - used),
    perUser: STARTER_PER_USER(),
    siteLeftToday: Math.max(0, STARTER_PER_DAY() - usedToday),
  };
}
