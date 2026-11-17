"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";

/** Turn browser/WebAuthn errors into something a non-technical person understands. */
function friendly(err: unknown): Error {
  const e = err as Error & { name?: string; code?: string };
  if (e?.name === "NotAllowedError" || /cancel|not allowed|timed out/i.test(e?.message ?? "")) return new Error("Cancelled — nothing was changed.");
  if (e?.name === "InvalidStateError") return new Error("This device already has a passkey for your account.");
  return new Error(e?.message || "Something went wrong.");
}

export const passkeysSupported = () => typeof window !== "undefined" && browserSupportsWebAuthn();

async function json<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || `Request failed (${res.status})`);
  return data as T;
}

/** "Save my work": create a passkey for the current (guest or signed-in) account. */
export async function savePasskey() {
  const options = await json<Parameters<typeof startRegistration>[0]["optionsJSON"]>(await fetch("/api/auth/passkey/register"));
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (err) {
    throw friendly(err);
  }
  await json(await fetch("/api/auth/passkey/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(response) }));
}

/** Sign in with a passkey saved on this device (or synced from another). */
export async function signInWithPasskey() {
  const options = await json<Parameters<typeof startAuthentication>[0]["optionsJSON"]>(await fetch("/api/auth/passkey/login"));
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (err) {
    throw friendly(err);
  }
  await json(await fetch("/api/auth/passkey/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(response) }));
}
