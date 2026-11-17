import { createHash, randomBytes } from "node:crypto";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
// Overridable only so tests can point at a fake Google. Leave unset in production.
const tokenUrl = () => process.env.GOOGLE_TOKEN_ENDPOINT || "https://oauth2.googleapis.com/token";

function need(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
}

export const appUrl = () => need("APP_URL").replace(/\/+$/, "");
export const redirectUri = () => `${appUrl()}/api/auth/callback`;

export function newOAuthState() {
  const state = randomBytes(24).toString("base64url");
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { state, verifier, challenge };
}

export function buildAuthUrl(state: string, challenge: string): string {
  const p = new URLSearchParams({
    client_id: need("GOOGLE_CLIENT_ID"),
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  });
  return `${AUTH_URL}?${p}`;
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  name?: string;
}

/**
 * Exchanges the auth code for an ID token. The token comes straight from Google's token
 * endpoint over TLS, so (per OpenID Connect) we validate its claims rather than its signature.
 */
export async function exchangeCode(code: string, verifier: string): Promise<GoogleIdentity> {
  const res = await fetch(tokenUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: need("GOOGLE_CLIENT_ID"),
      client_secret: need("GOOGLE_CLIENT_SECRET"),
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error(`Google token exchange failed (${res.status})`);
  const { id_token } = (await res.json()) as { id_token?: string };
  if (!id_token) throw new Error("No id_token in Google response");

  const claims = JSON.parse(Buffer.from(id_token.split(".")[1] ?? "", "base64url").toString("utf8")) as {
    iss?: string;
    aud?: string;
    exp?: number;
    email?: string;
    email_verified?: boolean | string;
    name?: string;
  };
  if (claims.aud !== need("GOOGLE_CLIENT_ID")) throw new Error("ID token audience mismatch");
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") throw new Error("Bad issuer");
  if (!claims.exp || claims.exp * 1000 < Date.now()) throw new Error("ID token expired");
  if (!claims.email) throw new Error("No email in ID token");
  return {
    email: claims.email.toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === "true",
    name: claims.name,
  };
}
