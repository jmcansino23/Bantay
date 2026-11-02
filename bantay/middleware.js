import { NextResponse } from "next/server";

// Keep everyone on one address (APP_URL). Sign-in only works when you start and finish
// on the same address, so other Vercel addresses (old names, previews) are sent there first.
export function middleware(request) {
  const app = process.env.APP_URL;
  if (!app) return NextResponse.next();
  let target;
  try {
    target = new URL(app);
  } catch {
    return NextResponse.next();
  }
  const host = (request.headers.get("x-forwarded-host") || request.headers.get("host") || "").split(",")[0].trim();
  if (!host || host === target.host || /^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host)) return NextResponse.next();
  const url = new URL(request.nextUrl.pathname + request.nextUrl.search, target.origin);
  return NextResponse.redirect(url, 308);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
