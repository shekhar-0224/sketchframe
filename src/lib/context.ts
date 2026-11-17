import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import type { Settings } from "@/lib/settings";

/**
 * Per-request context: the signed-in user, their decrypted API keys and their AI
 * settings. Route handlers set it (see lib/api.ts) and background jobs inherit it
 * (see pipeline/jobs.ts), so providers deep in the pipeline can read the right key
 * without threading it through every call.
 */
export type RequestContext = {
  userId: string;
  email: string;
  /** Env-style names → plaintext keys, e.g. { OPENAI_API_KEY: "sk-…" }. */
  keys: Record<string, string>;
  /** Key names that came from the server's own keys via SHARE_SERVER_KEYS (metered by lib/usage.ts). */
  sharedKeys?: string[];
  /** Only the owner picks models; everyone else is on the free plan (paid plans: coming soon). */
  owner?: boolean;
  settings: Settings;
};

const storage = new AsyncLocalStorage<RequestContext>();

export const runWithContext = <T>(ctx: RequestContext, fn: () => T) => storage.run(ctx, fn);
export const currentContext = () => storage.getStore();

export function requireContext() {
  const ctx = storage.getStore();
  if (!ctx) throw new Error("No signed-in user for this operation");
  return ctx;
}

/** A provider API key for the current user (their own, or the server's for the owner). */
export function apiKey(name: string): string {
  return currentContext()?.keys[name] ?? "";
}
