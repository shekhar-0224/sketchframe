import "server-only";
import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from "@simplewebauthn/server";
import { getDb, schema } from "@/lib/db";
import type { User } from "@/lib/db/schema";
import { readSignedValue, signValue } from "@/lib/auth";
import { appOrigin } from "@/lib/origin";

/**
 * Passkey sign-in (WebAuthn). Accounts need no email: the passkey itself is the login,
 * stored on the person's phone/computer and synced by iCloud / Google Password Manager.
 * The one-time challenge lives in a short-lived signed cookie, so it works on serverless.
 */
const { passkeys, users } = schema;
const CHALLENGE_COOKIE = "sf_pk";
const CHALLENGE_TTL = 5 * 60 * 1000;

function rp(req: Request) {
  const origin = appOrigin(req);
  return { origin, rpID: new URL(origin).hostname };
}

async function rememberChallenge(purpose: "register" | "login", challenge: string) {
  (await cookies()).set(CHALLENGE_COOKIE, signValue(`${purpose}:${challenge}`, CHALLENGE_TTL), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/passkey",
    maxAge: CHALLENGE_TTL / 1000,
  });
}

async function takeChallenge(purpose: "register" | "login") {
  const jar = await cookies();
  const value = readSignedValue(jar.get(CHALLENGE_COOKIE)?.value);
  jar.delete({ name: CHALLENGE_COOKIE, path: "/api/auth/passkey" });
  if (!value?.startsWith(`${purpose}:`)) throw new Error("That took too long — please try again.");
  return value.slice(purpose.length + 1);
}

/** Placeholder address for passkey-only accounts (users.email is required + unique). */
export const isPasskeyOnlyEmail = (email: string) => email.endsWith("@sketchframe.local");

export async function registrationOptions(req: Request, user: User) {
  const { rpID } = rp(req);
  const db = await getDb();
  const existing = await db.select().from(passkeys).where(eq(passkeys.userId, user.id));
  const options = await generateRegistrationOptions({
    rpName: "SketchFrame",
    rpID,
    userName: isPasskeyOnlyEmail(user.email) ? "SketchFrame" : user.email,
    userDisplayName: "SketchFrame",
    userID: new TextEncoder().encode(user.id),
    attestationType: "none",
    excludeCredentials: existing.map((p) => ({ id: p.id, transports: p.transports ?? undefined })),
    // Discoverable credentials: sign-in later needs no username or email.
    authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
  });
  await rememberChallenge("register", options.challenge);
  return options;
}

/** Save a new passkey; a guest becomes a real (passkey) account and keeps everything. */
export async function finishRegistration(req: Request, user: User, response: RegistrationResponseJSON) {
  const { origin, rpID } = rp(req);
  const expectedChallenge = await takeChallenge("register");
  const result = await verifyRegistrationResponse({ response, expectedChallenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
  if (!result.verified) throw new Error("Couldn't verify that passkey.");
  const { credential } = result.registrationInfo;
  const db = await getDb();
  await db.insert(passkeys).values({
    id: credential.id,
    userId: user.id,
    publicKey: Buffer.from(credential.publicKey).toString("base64url"),
    counter: credential.counter,
    transports: credential.transports ?? null,
  });
  if (user.guest) {
    await db.update(users).set({ guest: false, email: `passkey+${user.id}@sketchframe.local` }).where(eq(users.id, user.id));
  }
}

export async function authenticationOptions(req: Request) {
  const { rpID } = rp(req);
  const options = await generateAuthenticationOptions({ rpID, userVerification: "preferred" });
  await rememberChallenge("login", options.challenge);
  return options;
}

/** Check a sign-in and return the account's user id. */
export async function finishAuthentication(req: Request, response: AuthenticationResponseJSON) {
  const { origin, rpID } = rp(req);
  const expectedChallenge = await takeChallenge("login");
  const db = await getDb();
  const [pk] = await db.select().from(passkeys).where(eq(passkeys.id, response.id));
  if (!pk) throw new Error("This passkey isn't linked to a SketchFrame account.");
  const result = await verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: origin,
    expectedRPID: rpID,
    credential: { id: pk.id, publicKey: new Uint8Array(Buffer.from(pk.publicKey, "base64url")), counter: pk.counter, transports: pk.transports ?? undefined },
    requireUserVerification: false,
  });
  if (!result.verified) throw new Error("Couldn't verify that passkey.");
  await db
    .update(passkeys)
    .set({ counter: result.authenticationInfo.newCounter, lastUsedAt: Date.now() })
    .where(eq(passkeys.id, pk.id));
  return pk.userId;
}
