import "server-only";
import { after } from "next/server";
import { currentContext, runWithContext } from "@/lib/context";

/**
 * Tiny job runner. Generation requests return immediately and the work continues via
 * next/server `after()`, which keeps the function alive after the response (on Vercel up
 * to the route's maxDuration). The client polls the project for results.
 *
 * Concurrency limits and de-duplication are per server instance; that is fine for the
 * job sizes here. For heavier use, swap in a durable queue (Vercel Queues, Inngest…).
 */
type G = {
  __sf_jobs?: {
    running: number;
    queue: Array<() => void>;
    inflight: Map<string, Promise<unknown>>;
  };
};
const state = ((globalThis as G).__sf_jobs ??= { running: 0, queue: [] as Array<() => void>, inflight: new Map() });

const LIMIT = Number(process.env.SKETCHFRAME_CONCURRENCY || 3);

async function slot<T>(fn: () => Promise<T>): Promise<T> {
  if (state.running >= LIMIT) await new Promise<void>((r) => state.queue.push(r));
  state.running++;
  try {
    return await fn();
  } finally {
    state.running--;
    state.queue.shift()?.();
  }
}

/** Run once per key; concurrent callers share the same promise (e.g. a character sheet). */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = state.inflight.get(key);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => state.inflight.delete(key));
  state.inflight.set(key, p);
  return p;
}

export const isInflight = (key: string) => state.inflight.has(key);

/** Rate-limited image call. Only the provider call holds a slot, never the waiting. */
export const withSlot = slot;

/**
 * Run after the response, logging failures (callers persist error state themselves).
 * The signed-in user's context (keys, settings) is carried into the job explicitly.
 */
export function background(label: string, fn: () => Promise<unknown>) {
  const ctx = currentContext();
  const run = () => (ctx ? runWithContext(ctx, fn) : fn()).catch((err) => console.error(`[sketchframe] ${label} failed:`, err));
  try {
    after(run);
  } catch {
    // Outside a request (scripts/tests): just run it.
    void run();
  }
}
