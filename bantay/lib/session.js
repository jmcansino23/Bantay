import { EncryptJWT, jwtDecrypt } from "jose";
import { cookies } from "next/headers";

// The session (your Google refresh token and a short-lived access token) lives in an
// encrypted, httpOnly cookie. Nothing about your mail is stored on the server.
export const SESSION_COOKIE = "bantay_session";
export const STATE_COOKIE = "bantay_oauth";
const MAX_AGE = 60 * 60 * 24 * 30; // 30 days

let keyPromise;
function getKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("SESSION_SECRET must be set to a random string of at least 32 characters.");
  }
  keyPromise ??= crypto.subtle
    .digest("SHA-256", new TextEncoder().encode(secret))
    .then((buf) => new Uint8Array(buf));
  return keyPromise;
}

export async function seal(payload, maxAgeSeconds = MAX_AGE) {
  return new EncryptJWT(payload)
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .setIssuedAt()
    .setExpirationTime(`${maxAgeSeconds}s`)
    .encrypt(await getKey());
}

export async function unseal(token) {
  if (!token) return null;
  try {
    const { payload } = await jwtDecrypt(token, await getKey());
    return payload;
  } catch {
    return null;
  }
}

export const cookieOptions = (maxAge = MAX_AGE) => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge,
});

export async function getSession() {
  const store = await cookies();
  return unseal(store.get(SESSION_COOKIE)?.value);
}

export async function saveSession(session) {
  const store = await cookies();
  store.set(SESSION_COOKIE, await seal(session), cookieOptions());
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export function allowedEmails() {
  return (process.env.ALLOWED_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}
