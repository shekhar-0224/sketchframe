import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { OAUTH_STATE_COOKIE, googleAuthUrl, googleEnabled } from "@/lib/google";

/** Step 1: send the visitor to Google's account picker. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  if (!googleEnabled()) return NextResponse.redirect(new URL("/login?error=google-off", url));
  const next = url.searchParams.get("next") ?? "/";
  const state = crypto.randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(googleAuthUrl(req, state));
  // One-time anti-forgery state, bound to this browser; also remembers where to return.
  res.cookies.set(OAUTH_STATE_COOKIE, JSON.stringify({ state, next: next.startsWith("/") ? next : "/" }), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return res;
}
