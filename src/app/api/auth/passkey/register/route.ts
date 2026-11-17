import { NextResponse } from "next/server";
import { HttpError, handle } from "@/lib/api";
import { currentUser } from "@/lib/auth";
import { finishRegistration, registrationOptions } from "@/lib/passkeys";

/** GET: options to create a passkey for the signed-in (or guest) user. POST: save it. */
export const GET = handle(async (req: Request) => {
  const user = (await currentUser())!;
  return NextResponse.json(await registrationOptions(req, user));
});

export const POST = handle(async (req: Request) => {
  const user = (await currentUser())!;
  try {
    await finishRegistration(req, user, await req.json());
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  return NextResponse.json({ ok: true });
});
