import { NextResponse } from "next/server";
import { HttpError, handlePublic } from "@/lib/api";
import { createGuest, createSession, currentUser } from "@/lib/auth";

// Light abuse guard per server instance: guests are cheap but not free (DB rows, storage).
const recent = new Map<string, number[]>();
const LIMIT = 20;
const WINDOW_MS = 60 * 60 * 1000;

/** "Try it free": start an anonymous account so visitors can build without signing up. */
export const POST = handlePublic(async (req: Request) => {
  const existing = await currentUser();
  if (existing) return NextResponse.json({ ok: true, guest: existing.guest });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  if (hits.length >= LIMIT) throw new HttpError(429, "Too many new sessions from this network — try again later or sign in.");
  recent.set(ip, [...hits, now]);

  const user = await createGuest();
  await createSession(user.id);
  return NextResponse.json({ ok: true, guest: true });
});
