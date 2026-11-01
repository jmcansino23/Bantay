import { dkey } from "./rules";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const BODY_LIMIT = 6000;

// Small in-memory caches. They live only while a serverless instance is warm.
// Keys include Gmail's historyId, so a changed thread is always fetched again.
const metaCache = new Map();
const bodyCache = new Map();
function remember(map, key, value, max = 600) {
  if (map.size >= max) map.delete(map.keys().next().value);
  map.set(key, value);
  return value;
}

export class GmailError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function gmail(token, path, params) {
  const url = new URL(API + path);
  if (params) for (const [k, v] of params) url.searchParams.append(k, v);
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (res.ok) return res.json();
    if ((res.status === 429 || res.status >= 500) && attempt === 0) {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
      continue;
    }
    const body = await res.json().catch(() => ({}));
    throw new GmailError(res.status, body?.error?.message || `Gmail request failed (${res.status})`);
  }
}

async function pool(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
  return out;
}

const header = (msg, name) =>
  (msg.payload?.headers || []).find((h) => h.name.toLowerCase() === name.toLowerCase())?.value || "";

// Same shape the rules expect: {threads: [{id, messages: [{id, sender, subject, labelIds, at}]}]}
export async function searchThreads(token, query, max = 40) {
  const list = await gmail(token, "/threads", [["q", query], ["maxResults", String(max)]]);
  const refs = list.threads || [];
  const threads = await pool(refs, 8, async (ref) => {
    const key = `${ref.id}@${ref.historyId}`;
    if (metaCache.has(key)) return metaCache.get(key);
    const t = await gmail(token, `/threads/${ref.id}`, [
      ["format", "metadata"], ["metadataHeaders", "From"], ["metadataHeaders", "Subject"],
    ]);
    const messages = (t.messages || []).slice(-5).map((m) => ({
      id: m.id,
      threadId: t.id,
      sender: header(m, "From"),
      subject: header(m, "Subject"),
      labelIds: m.labelIds || [],
      at: Number(m.internalDate) || 0,
    }));
    return remember(metaCache, key, { id: t.id, historyId: ref.historyId, messages });
  });
  return { threads };
}

function decode(data) {
  return Buffer.from(String(data || ""), "base64url").toString("utf8");
}
function htmlToText(html) {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|td|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&#8369;|&#x20B1;/gi, "₱")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n");
}
function textOf(part) {
  let plain = "", html = "";
  (function walk(p) {
    if (!p) return;
    if (p.mimeType === "text/plain" && p.body?.data && !plain) plain = decode(p.body.data);
    else if (p.mimeType === "text/html" && p.body?.data && !html) html = decode(p.body.data);
    (p.parts || []).forEach(walk);
  })(part);
  return (plain || htmlToText(html)).slice(0, BODY_LIMIT);
}

// Text of every message in each thread, keyed the way the rules look them up
export async function threadBodies(token, msgs) {
  const entries = await pool(msgs, 6, async (m) => {
    const key = dkey(m);
    if (bodyCache.has(key)) return [key, bodyCache.get(key)];
    try {
      const t = await gmail(token, `/threads/${m.threadId}`, [["format", "full"]]);
      const list = (t.messages || []).map((x) => ({ id: x.id, at: Number(x.internalDate) || 0, body: textOf(x.payload) }));
      return [key, remember(bodyCache, key, { ok: true, body: list[0]?.body || "", msgs: list }, 300)];
    } catch {
      return [key, { ok: false, body: "", msgs: [] }];
    }
  });
  return Object.fromEntries(entries);
}
