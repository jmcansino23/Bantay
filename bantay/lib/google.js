import { getSession, saveSession, clearSession } from "./session";

export const GOOGLE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
];

export class AuthError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code; // "signed_out" | "reauth"
  }
}

export function appOrigin(request) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, "");
  return new URL(request.url).origin;
}

export function redirectUri(request) {
  return `${appOrigin(request)}/api/auth/callback`;
}

export function requireGoogleEnv() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  if (!id || !secret) throw new Error("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set.");
  return { id, secret };
}

// Returns a valid access token, refreshing it with the stored refresh token when needed.
export async function getAccessToken() {
  const session = await getSession();
  if (!session?.refreshToken) throw new AuthError("signed_out");
  if (session.accessToken && session.expiresAt - Date.now() > 60_000) return session.accessToken;

  const { id, secret } = requireGoogleEnv();
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: id,
      client_secret: secret,
      refresh_token: session.refreshToken,
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    // invalid_grant: the refresh token expired or was revoked (Google's "Testing" apps expire them after 7 days)
    if (data.error === "invalid_grant") {
      await clearSession();
      throw new AuthError("reauth", "Google sign-in expired. Please sign in again.");
    }
    throw new Error(`Google token refresh failed (${res.status})`);
  }
  await saveSession({
    ...session,
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in || 3600) * 1000,
    refreshToken: data.refresh_token || session.refreshToken,
  });
  return data.access_token;
}
