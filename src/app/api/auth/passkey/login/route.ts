import { NextResponse } from "next/server";
import { HttpError, handlePublic } from "@/lib/api";
import { adoptGuest, createSession, currentUser } from "@/lib/auth";
import { authenticationOptions, finishAuthentication } from "@/lib/passkeys";

/** GET: a sign-in challenge (no username needed). POST: verify and start a session. */
export const GET = handlePublic(async (req: Request) => NextResponse.json(await authenticationOptions(req)));

export const POST = handlePublic(async (req: Request) => {
  let userId: string;
  try {
    userId = await finishAuthentication(req, await req.json());
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  // Anything made as a guest in this browser comes along.
  const before = await currentUser();
  if (before?.guest && before.id !== userId) await adoptGuest(before.id, userId);
  await createSession(userId);
  return NextResponse.json({ ok: true });
});
