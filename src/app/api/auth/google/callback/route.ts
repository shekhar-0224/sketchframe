import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { adoptGuest, createSession, currentUser, userForVerifiedEmail } from "@/lib/auth";
import { OAUTH_STATE_COOKIE, verifiedGoogleEmail } from "@/lib/google";

/** Step 2: Google sends the visitor back here; sign them in (keeping any guest work). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const fail = (reason: string) => {
    const r = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, url));
    r.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/google" });
    return r;
  };

  const jar = await cookies();
  let saved: { state?: string; next?: string } = {};
  try {
    saved = JSON.parse(jar.get(OAUTH_STATE_COOKIE)?.value ?? "{}");
  } catch {
    /* treated as missing */
  }
  if (url.searchParams.get("error")) return fail("Google sign-in was cancelled.");
  const code = url.searchParams.get("code");
  if (!code || !saved.state || saved.state !== url.searchParams.get("state")) return fail("Sign-in expired — please try again.");

  try {
    const email = await verifiedGoogleEmail(req, code);
    const before = await currentUser();
    const user = await userForVerifiedEmail(email);
    if (before?.guest) await adoptGuest(before.id, user.id);
    await createSession(user.id);
  } catch (e) {
    return fail((e as Error).message);
  }
  const r = NextResponse.redirect(new URL(saved.next && saved.next.startsWith("/") ? saved.next : "/", url));
  r.cookies.delete({ name: OAUTH_STATE_COOKIE, path: "/api/auth/google" });
  return r;
}
