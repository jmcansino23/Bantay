import { NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// "Mark paid" choices, kept as one Redis hash per signed-in email.
// Each save adds or removes only the marks it changes, so a phone and a laptop
// can never overwrite each other's marks.
// Works with Upstash Redis added from the Vercel Marketplace (either env-var naming).
function redis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? new Redis({ url, token }) : null;
}
const hashKey = (email) => `bantay:paidset:${email}`;
const oldKey = (email) => `bantay:paid:${email}`; // earlier versions stored one JSON object here
const noStore = { "Cache-Control": "no-store" };
const KEY_RE = /^[a-z0-9:-]{3,80}$/i;

async function readAll(db, email) {
  let fields = (await db.hgetall(hashKey(email))) || {};
  if (!Object.keys(fields).length) {
    // One-time move of marks saved by the earlier version
    const old = await db.get(oldKey(email));
    if (old && typeof old === "object" && !Array.isArray(old)) {
      const keys = Object.keys(old).filter((k) => old[k] === true && KEY_RE.test(k));
      if (keys.length) await db.hset(hashKey(email), Object.fromEntries(keys.map((k) => [k, 1])));
      await db.del(oldKey(email));
      fields = (await db.hgetall(hashKey(email))) || {};
    }
  }
  return Object.fromEntries(Object.keys(fields).map((k) => [k, true]));
}

export async function GET() {
  const session = await getSession();
  if (!session?.email) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const db = redis();
  if (!db) return NextResponse.json({ storage: "browser" }, { headers: noStore });
  try {
    return NextResponse.json({ storage: "redis", paid: await readAll(db, session.email) }, { headers: noStore });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "storage_error" }, { status: 503 });
  }
}

export async function PUT(request) {
  const session = await getSession();
  if (!session?.email) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const db = redis();
  if (!db) return NextResponse.json({ storage: "browser" }, { status: 501 });
  const body = await request.json().catch(() => null);
  const clean = (list) => (Array.isArray(list) ? list : []).filter((k) => typeof k === "string" && KEY_RE.test(k)).slice(0, 200);
  const add = clean(body?.set);
  const remove = clean(body?.unset);
  if (!add.length && !remove.length) return NextResponse.json({ error: "bad_request" }, { status: 400 });
  try {
    if (add.length) await db.hset(hashKey(session.email), Object.fromEntries(add.map((k) => [k, 1])));
    if (remove.length) await db.hdel(hashKey(session.email), ...remove);
    return NextResponse.json({ storage: "redis", paid: await readAll(db, session.email) }, { headers: noStore });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "storage_error" }, { status: 503 });
  }
}
