import { NextResponse } from "next/server";
import { GOOGLE_SCOPES, redirectUri, requireGoogleEnv } from "@/lib/google";
import { seal, cookieOptions, STATE_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

function b64url(bytes) {
  return Buffer.from(bytes).toString("base64url");
}

export async function GET(request) {
  const { id } = requireGoogleEnv();
  const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: id,
    redirect_uri: redirectUri(request),
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();

  const res = NextResponse.redirect(url);
  res.cookies.set(STATE_COOKIE, await seal({ state, verifier }, 600), cookieOptions(600));
  return res;
}
