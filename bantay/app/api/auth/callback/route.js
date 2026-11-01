import { NextResponse } from "next/server";
import { appOrigin, redirectUri, requireGoogleEnv } from "@/lib/google";
import { seal, unseal, cookieOptions, allowedEmails, SESSION_COOKIE, STATE_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

function back(request, error) {
  const url = new URL("/", appOrigin(request));
  if (error) url.searchParams.set("error", error);
  const res = NextResponse.redirect(url);
  res.cookies.delete(STATE_COOKIE);
  return res;
}

export async function GET(request) {
  const params = new URL(request.url).searchParams;
  if (params.get("error")) return back(request, "denied");

  const saved = await unseal(request.cookies.get(STATE_COOKIE)?.value);
  const code = params.get("code");
  if (!saved || !code || params.get("state") !== saved.state) return back(request, "state");

  const { id, secret } = requireGoogleEnv();
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: id,
      client_secret: secret,
      redirect_uri: redirectUri(request),
      grant_type: "authorization_code",
      code_verifier: saved.verifier,
    }),
    cache: "no-store",
  });
  const tokens = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokens.access_token || !tokens.id_token) return back(request, "token");

  // The id_token came straight from Google's token endpoint over TLS, so its claims can be read directly.
  let claims = {};
  try {
    claims = JSON.parse(Buffer.from(tokens.id_token.split(".")[1], "base64url").toString("utf8"));
  } catch {
    return back(request, "token");
  }
  const email = String(claims.email || "").toLowerCase();
  const allowed = allowedEmails();
  if (!claims.email_verified || !email || !allowed.includes(email)) return back(request, "not_allowed");
  if (!tokens.refresh_token) return back(request, "no_refresh");
  if (!String(tokens.scope || "").includes("gmail.readonly")) return back(request, "scope");

  const res = back(request);
  res.cookies.set(
    SESSION_COOKIE,
    await seal({
      email,
      refreshToken: tokens.refresh_token,
      accessToken: tokens.access_token,
      expiresAt: Date.now() + (tokens.expires_in || 3600) * 1000,
    }),
    cookieOptions()
  );
  return res;
}
