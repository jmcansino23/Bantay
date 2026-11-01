import { NextResponse } from "next/server";
import { AuthError, getAccessToken } from "./google";
import { GmailError } from "./gmail";

// Wraps a route: gets a Google access token, maps failures to clear JSON errors.
export function gmailRoute(handler) {
  return async (request) => {
    try {
      const token = await getAccessToken();
      const data = await handler(token, request);
      return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
    } catch (e) {
      if (e instanceof AuthError) return NextResponse.json({ error: e.code }, { status: 401 });
      if (e instanceof GmailError) {
        const code = e.status === 403 ? "gmail_forbidden" : e.status === 429 ? "rate_limited" : "gmail_error";
        return NextResponse.json({ error: code, message: e.message }, { status: e.status === 429 ? 429 : 502 });
      }
      console.error(e);
      return NextResponse.json({ error: "server_error", message: String(e.message || e) }, { status: 500 });
    }
  };
}
