import "server-only";
import { appOrigin } from "./origin";

/**
 * "Continue with Google" — standard OAuth 2.0 / OpenID Connect authorization-code flow,
 * no SDK. The ID token comes straight from Google's token endpoint over TLS in exchange
 * for our client secret, so its claims can be trusted after checking issuer/audience.
 */
export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);

export const OAUTH_STATE_COOKIE = "sf_oauth";


export const redirectUri = (req: Request) => `${appOrigin(req)}/api/auth/google/callback`;

export function googleAuthUrl(req: Request, state: string) {
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: redirectUri(req),
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
}

/** Exchange the code and return the verified email address. */
export async function verifiedGoogleEmail(req: Request, code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri(req),
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google sign-in failed (${res.status})`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("Google didn't return an identity token");
  const claims = JSON.parse(Buffer.from(id_token.split(".")[1], "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean;
  };
  if (!["https://accounts.google.com", "accounts.google.com"].includes(claims.iss ?? "")) throw new Error("Unexpected token issuer");
  if (claims.aud !== process.env.GOOGLE_CLIENT_ID) throw new Error("Token was issued for a different app");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("Google sign-in expired — try again");
  if (!claims.email || !claims.email_verified) throw new Error("That Google account has no verified email");
  return claims.email;
}
