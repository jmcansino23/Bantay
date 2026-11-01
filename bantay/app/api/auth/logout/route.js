import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/google";
import { SESSION_COOKIE } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(request) {
  const res = NextResponse.redirect(new URL("/", appOrigin(request)), 303);
  res.cookies.delete(SESSION_COOKIE);
  return res;
}
