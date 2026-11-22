import { gmailRoute } from "@/lib/api";
import { searchThreads, threadBodies } from "@/lib/gmail";
import { getSession } from "@/lib/session";
import { redis, keys, parse } from "@/lib/redis";
import { SERVICES, SCAN_DAYS, serviceQuery, classify, extractEvents, mergeHistory, toStored, isValidStored, isValidStatus } from "@/lib/recurring";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Scans the last 90 days of each service's emails for receipts, renewal notices and cancellations.
// New charges are added to your saved history (Upstash Redis), so older ones stay after their
// emails fall outside the scan window. Without Redis, the browser keeps the history instead.
export const GET = gmailRoute(async (token) => {
  const session = await getSession();
  const email = session.email;
  const services = {};

  for (const svc of SERVICES) {
    const payload = await searchThreads(token, serviceQuery(svc), 40);
    const relevant = [];
    for (const t of payload.threads) {
      for (const m of t.messages) {
        const domain = (String(m.sender).match(/@([^>\s]+)/) || [])[1] || "";
        if (svc.from.test(domain) && classify(m.subject, "")) relevant.push(m);
      }
    }
    // Renewal notices can be worded in the body only, so also read recent messages without a matching subject
    for (const t of payload.threads) {
      for (const m of t.messages) {
        const domain = (String(m.sender).match(/@([^>\s]+)/) || [])[1] || "";
        if (svc.from.test(domain) && !relevant.includes(m) && Date.now() - m.at < 45 * 86400000) relevant.push(m);
      }
    }
    const byThread = new Map();
    for (const m of relevant) if (!byThread.has(m.threadId)) byThread.set(m.threadId, { threadId: m.threadId, mid: m.id });
    const details = await threadBodies(token, [...byThread.values()].slice(0, 30));
    const msgs = relevant.map((m) => {
      const d = details[`${m.threadId}@${byThread.get(m.threadId).mid}`];
      const full = d && d.ok ? d.msgs.find((x) => x.id === m.id) : null;
      return { threadId: m.threadId, id: m.id, subject: m.subject, at: m.at, body: full ? full.body : "" };
    });
    services[svc.key] = extractEvents(svc, msgs);
  }

  const db = redis();
  if (!db) {
    return { storage: "browser", scanDays: SCAN_DAYS, services, status: null, firstImportAt: null, at: Date.now() };
  }

  // Save newly found charges, then return the full history
  const toSave = {};
  for (const [key, ev] of Object.entries(services)) for (const c of ev.charges) {
    const s = toStored(c);
    if (isValidStored(s)) toSave[s.id] = JSON.stringify(s);
  }
  const savedRaw = (await db.hgetall(keys.charges(email))) || {};
  const fresh = Object.fromEntries(Object.entries(toSave).filter(([id]) => !(id in savedRaw)));
  if (Object.keys(fresh).length) await db.hset(keys.charges(email), fresh);

  let firstImportAt = parse((await db.hget(keys.chargesMeta(email), "firstImportAt")));
  if (!firstImportAt) {
    firstImportAt = Date.now();
    await db.hset(keys.chargesMeta(email), { firstImportAt: String(firstImportAt) });
  }

  const saved = Object.values({ ...savedRaw, ...fresh }).map(parse).filter(isValidStored);
  for (const svc of SERVICES) {
    const ev = services[svc.key];
    ev.charges = mergeHistory(saved.filter((c) => c.service === svc.key), ev.charges);
  }

  const rawStatus = (await db.hgetall(keys.status(email))) || {};
  const status = {};
  for (const [k, v] of Object.entries(rawStatus)) {
    const s = parse(v);
    if (SERVICES.some((x) => x.key === k) && isValidStatus(s)) status[k] = s;
  }

  return { storage: "redis", scanDays: SCAN_DAYS, services, status, firstImportAt: Number(firstImportAt), at: Date.now() };
});
