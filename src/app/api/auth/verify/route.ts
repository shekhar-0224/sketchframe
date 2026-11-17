import { NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, handlePublic } from "@/lib/api";
import { adoptGuest, consumeLoginCode, createSession, currentUser, normalizeEmail } from "@/lib/auth";

/** Step 2 of sign-in: check the code, create the account if new, set the session cookie. */
export const POST = handlePublic(async (req: Request) => {
  const { email, code } = z
    .object({ email: z.string().trim().email(), code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code") })
    .parse(await req.json());
  const before = await currentUser();
  let user;
  try {
    user = await consumeLoginCode(normalizeEmail(email), code);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  // Signing in from a guest session keeps everything made while trying it out.
  if (before?.guest) await adoptGuest(before.id, user.id);
  await createSession(user.id);
  return NextResponse.json({ ok: true, email: user.email });
});
