import { NextResponse } from "next/server";
import { handle } from "@/lib/api";
import { currentUser, isOwner } from "@/lib/auth";
import { isPasskeyOnlyEmail } from "@/lib/passkeys";

export const GET = handle(async () => {
  const user = (await currentUser())!;
  const passkeyOnly = isPasskeyOnlyEmail(user.email);
  return NextResponse.json({
    email: user.guest || passkeyOnly ? null : user.email,
    guest: user.guest,
    owner: !user.guest && !passkeyOnly && isOwner(user.email),
  });
});
