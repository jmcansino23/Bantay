import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { redis, keys, parse } from "@/lib/redis";
import { SERVICES, isValidStatus } from "@/lib/recurring";

export const dynamic = "force-dynamic";

// Saves what you decided for a subscription: keep it, cancellation pending, or cancelled.
// Body: { service: "claude", status: { state: "keep" | "cancel_pending" | "cancelled", at } } or status: null to clear.
export async function PUT(request) {
  const session = await getSession();
  if (!session?.email) return NextResponse.json({ error: "signed_out" }, { status: 401 });
  const db = redis();
  if (!db) return NextResponse.json({ storage: "browser" }, { status: 501 });

  const body = await request.json().catch(() => null);
  const service = body?.service;
  const status = body?.status ?? null;
  if (!SERVICES.some((s) => s.key === service) || !isValidStatus(status)) {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }
  const clean = status ? { state: status.state, at: Math.min(status.at, Date.now() + 60000) } : null;
  if (status && Number.isFinite(status.since)) clean.since = status.since;

  try {
    if (clean) await db.hset(keys.status(session.email), { [service]: JSON.stringify(clean) });
    else await db.hdel(keys.status(session.email), service);
    const raw = (await db.hgetall(keys.status(session.email))) || {};
    const all = {};
    for (const [k, v] of Object.entries(raw)) {
      const s = parse(v);
      if (isValidStatus(s)) all[k] = s;
    }
    return NextResponse.json({ storage: "redis", status: all }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "storage_error" }, { status: 503 });
  }
}
