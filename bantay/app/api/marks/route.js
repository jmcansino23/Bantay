import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// "Mark paid" choices, one small record per signed-in email.
// Works with Upstash Redis added from the Vercel Marketplace (either env-var naming).
function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}
const keyFor = (email) => `bantay:paid:${email}`;
const noStore = { "Cache-Control": "no-store" };

export async function GET() {
  const session = await getSession();
  if (!session?.email) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const db = redis();
  if (!db) return NextResponse.json({ storage: "browser" }, { headers: noStore });
  const paid = (await db.get(keyFor(session.email))) || {};
  return NextResponse.json({ storage: "redis", paid }, { headers: noStore });
}

export async function PUT(request) {
  const session = await getSession();
  if (!session?.email) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const db = redis();
  if (!db) return NextResponse.json({ storage: "browser" }, { status: 501 });
  const body = await request.json().catch(() => null);
  const paid = body?.paid;
  if (!paid || typeof paid !== "object" || Array.isArray(paid)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  // Keep only well-formed keys like "pagibig:2026-09" or "card:amex:2026-10"
  const clean = {};
  for (const [k, v] of Object.entries(paid)) {
    if (v === true && /^[a-z0-9:-]{3,60}$/i.test(k)) clean[k] = true;
  }
  if (Object.keys(clean).length > 2000) return NextResponse.json({ error: "too_many" }, { status: 400 });
  await db.set(keyFor(session.email), clean);
  return NextResponse.json({ storage: "redis", paid: clean }, { headers: noStore });
}
