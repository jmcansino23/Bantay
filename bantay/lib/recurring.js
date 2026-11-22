// Recurring charges: which services to watch, how to read their receipts,
// and how to summarise price changes and the next renewal.
// Shared by the server (scanning Gmail) and the browser (building the card).

export const DAY = 86400000;
export const SCAN_DAYS = 90;

// Add more services here later (Netflix, Spotify, iCloud...).
export const SERVICES = [
  {
    key: "claude",
    name: "Claude Pro",
    provider: "Anthropic",
    icon: "Sparkles",
    gmail: "from:anthropic.com",
    from: /(^|\.)anthropic\.com$/i,
    renewal: "auto", // "auto": the provider charges you; "manual": you renew yourself
    manageUrl: "https://claude.ai/settings/billing",
    manageLabel: "Open Claude billing settings",
    helpUrl: "https://support.claude.com/en/articles/8325617-cancel-your-pro-or-max-plan",
    helpLabel: "Official cancellation steps",
    renewUrl: null,
    cancelNote: "Cancel at least 24 hours before the next billing date. Subscribed through the iPhone or Android app? Cancel in that app store instead.",
  },
];

export const serviceQuery = (svc) => `${svc.gmail} newer_than:${SCAN_DAYS}d`;

/* ---------- Reading amounts, dates and receipt numbers ---------- */

const CODES = "USD|OMR|EUR|GBP|PHP|AED|SAR|QAR|KWD|BHD|INR|SGD|AUD|CAD|JPY";
const SYMBOLS = { "US$": "USD", "$": "USD", "€": "EUR", "£": "GBP", "₱": "PHP", "ر.ع.": "OMR", "ر.ع": "OMR", "﷼": "OMR", "₹": "INR", "¥": "JPY" };
const NUM = "([0-9]{1,3}(?:,[0-9]{3})*(?:\\.[0-9]{1,3})?|[0-9]+(?:\\.[0-9]{1,3})?)";
const MONEY_RE = new RegExp(
  `(?:\\b(${CODES})\\s?|(US\\$|\\$|€|£|₱|ر\\.ع\\.?|﷼|₹|¥)\\s?)${NUM}|${NUM}\\s?(?:\\b(${CODES})\\b|(ر\\.ع\\.?|﷼))`,
  "u"
);

const BIDI = /[\u200e\u200f\u202a-\u202e\u2066-\u2069]/g; // invisible direction marks around Arabic text

export function parseMoney(text) {
  const m = String(text || "").replace(BIDI, "").match(MONEY_RE);
  if (!m) return null;
  const currency = m[1] || SYMBOLS[m[2]] || m[5] || SYMBOLS[m[6]];
  const raw = m[3] || m[4];
  if (!currency || !raw) return null;
  const amount = parseFloat(raw.replace(/,/g, ""));
  if (!isFinite(amount)) return null;
  const decimals = (raw.split(".")[1] || "").length;
  return { amount, currency, decimals };
}

const flat = (s) => String(s || "").replace(BIDI, "").replace(/\|/g, " ").replace(/[ \t ]+/g, " ");

// Look for the amount next to the most trustworthy label first.
function findAmount(text) {
  const t = flat(text);
  const labels = [/amount paid/i, /total (?:charged|paid)/i, /amount charged/i, /you (?:paid|were charged)/i, /\btotal\b/i, /\bamount\b/i, /\bprice\b/i];
  for (const re of labels) {
    const i = t.search(re);
    if (i >= 0) {
      const money = parseMoney(t.slice(i, i + 80));
      if (money) return money;
    }
  }
  return parseMoney(t);
}

const MONTHS = "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";
const DATE_RES = [
  new RegExp(`((?:${MONTHS})\\.? \\d{1,2},? \\d{4})`, "i"),
  new RegExp(`(\\d{1,2} (?:${MONTHS})\\.?,? \\d{4})`, "i"),
  /(\d{4}-\d{2}-\d{2})/,
];
export function parseDate(text) {
  for (const re of DATE_RES) {
    const m = String(text || "").match(re);
    if (m) {
      const t = Date.parse(m[1].replace(/\./g, "").replace(/Sept/i, "Sep") + (m[1].includes("-") ? "T12:00:00+04:00" : " 12:00 GMT+0400"));
      if (!isNaN(t)) return t;
    }
  }
  return 0;
}
function findDateAfter(text, labels) {
  const t = flat(text);
  for (const re of labels) {
    const i = t.search(re);
    if (i >= 0) {
      const d = parseDate(t.slice(i, i + 60));
      if (d) return d;
    }
  }
  return 0;
}

function findReceiptNo(subject, body) {
  const s = String(subject || "").match(/#\s?([0-9A-Z][0-9A-Z-]{5,})/i);
  if (s) return s[1].toUpperCase();
  const b = flat(body).match(/receipt\s*(?:number|no\.?|#)\s*:?\s*#?([0-9A-Z][0-9A-Z-]{5,})/i);
  return b ? b[1].toUpperCase() : null;
}

/* ---------- Sorting emails into charges, notices and cancellations ---------- */

const RE = {
  failed: /payment (?:failed|declined|unsuccessful)|couldn.?t (?:process|charge)|card (?:was )?declined|update your payment/i,
  cancel: /cancel(?:l)?ed|cancellation|has ended|will not renew|won.?t renew|subscription ended/i,
  receipt: /receipt|invoice|payment (?:received|confirmed|successful)|you.?ve been charged|charge confirmation/i,
  renewal: /will (?:automatically )?renew|upcoming (?:renewal|payment|charge)|renews on|renewal (?:reminder|notice)|about to renew/i,
  confirmation: /subscription is confirmed|welcome to (?:claude )?pro|you.?re now subscribed|upgraded to/i,
};

export function classify(subject, body) {
  const s = String(subject || "");
  if (RE.failed.test(s)) return "failed";
  if (RE.cancel.test(s) && !RE.receipt.test(s)) return "cancelled";
  if (RE.receipt.test(s)) return "receipt";
  if (RE.renewal.test(s) || RE.renewal.test(flat(body).slice(0, 600))) return "renewal";
  if (RE.confirmation.test(s)) return "confirmation";
  return null;
}

// msgs: [{threadId, id, subject, at, body}] from one service's sender.
// Returns charges (confirmed payments), expected (renewal notices), failed and cancellation events.
export function extractEvents(svc, msgs) {
  const charges = [], expected = [], failed = [], cancelMails = [], confirmations = [];
  for (const m of msgs) {
    const kind = classify(m.subject, m.body);
    if (!kind) continue;
    const money = findAmount(m.body);
    const base = { threadId: m.threadId, msgId: m.id, subject: String(m.subject || "").slice(0, 140), emailAt: m.at };
    if (kind === "receipt" || kind === "confirmation") {
      const paidAt = findDateAfter(m.body, [/date paid/i, /paid on/i, /\bpaid\b/i, /payment date/i, /\bdate\b/i]) || m.at;
      const rec = {
        ...base,
        service: svc.key,
        date: Math.abs(paidAt - m.at) < 40 * DAY ? paidAt : m.at, // ignore odd dates far from the email
        amount: money ? money.amount : null,
        currency: money ? money.currency : null,
        decimals: money ? money.decimals : 2,
        receiptNo: findReceiptNo(m.subject, m.body),
        source: kind,
      };
      (kind === "receipt" ? charges : confirmations).push(rec);
    } else if (kind === "renewal") {
      const due = findDateAfter(m.body, [/renew(?:s|al)? on/i, /will (?:automatically )?renew/i, /on or after/i, /next (?:billing|payment) date/i, /\bon\b/i]);
      expected.push({ ...base, service: svc.key, date: due, amount: money ? money.amount : null, currency: money ? money.currency : null, decimals: money ? money.decimals : 2 });
    } else if (kind === "failed") {
      failed.push({ ...base, date: m.at });
    } else if (kind === "cancelled") {
      cancelMails.push({ ...base, date: m.at });
    }
  }
  // A "subscription confirmed" email counts as a charge only if it has an amount and no receipt covers the same payment
  for (const c of confirmations) {
    if (c.amount == null) continue;
    if (charges.some((r) => Math.abs(r.date - c.date) < 3 * DAY)) continue;
    charges.push(c);
  }
  return { charges: dedupe(charges), expected, failed, cancelMails };
}

export const chargeId = (c) =>
  c.receiptNo ? `${c.service}:r:${c.receiptNo}` : `${c.service}:d:${new Date(c.date).toISOString().slice(0, 10)}:${c.currency || "x"}:${c.amount ?? "x"}`;

// Same receipt number, or the same amount in the same currency within 2 days, is one payment.
export function dedupe(list) {
  const out = [];
  const sorted = [...list].sort((a, b) => (b.receiptNo ? 1 : 0) - (a.receiptNo ? 1 : 0) || a.date - b.date);
  for (const c of sorted) {
    const dup = out.find((o) =>
      (c.receiptNo && o.receiptNo && c.receiptNo === o.receiptNo) ||
      (c.amount != null && o.amount === c.amount && o.currency === c.currency && Math.abs(o.date - c.date) < 2 * DAY)
    );
    if (dup) {
      if (dup.amount == null && c.amount != null) Object.assign(dup, { amount: c.amount, currency: c.currency, decimals: c.decimals });
      continue;
    }
    out.push({ ...c, id: chargeId(c) });
  }
  return out.sort((a, b) => b.date - a.date);
}

// Keep only what's needed to show history; nothing else from the email is stored.
export function toStored(c) {
  return {
    id: c.id || chargeId(c),
    service: c.service,
    date: c.date,
    amount: c.amount,
    currency: c.currency,
    decimals: c.decimals,
    receiptNo: c.receiptNo || null,
    threadId: c.threadId,
    source: c.source,
    savedAt: c.savedAt || Date.now(),
  };
}

export function isValidStored(c) {
  return !!c && typeof c === "object" &&
    typeof c.id === "string" && c.id.length < 120 &&
    typeof c.service === "string" && SERVICES.some((s) => s.key === c.service) &&
    Number.isFinite(c.date) &&
    (c.amount === null || Number.isFinite(c.amount)) &&
    (c.currency === null || /^[A-Z]{3}$/.test(c.currency)) &&
    (c.threadId == null || /^[0-9a-z]{4,40}$/i.test(c.threadId)) &&
    (c.receiptNo == null || /^[0-9A-Z-]{3,40}$/.test(c.receiptNo));
}

// Merge saved history with what the latest scan found (scan wins for the same payment).
export function mergeHistory(saved, scanned) {
  const byId = new Map();
  for (const c of saved || []) if (isValidStored(c)) byId.set(c.id, c);
  for (const c of scanned || []) {
    const s = toStored(c);
    byId.set(s.id, { ...(byId.get(s.id) || {}), ...s, savedAt: (byId.get(s.id) || s).savedAt });
  }
  return dedupe([...byId.values()]);
}

/* ---------- Summary for the card ---------- */

export function fmtMoney(amount, currency, decimals = 2) {
  if (amount == null || !currency) return "Amount not shown";
  const d = Math.max(0, Math.min(3, decimals));
  return `${currency} ${amount.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

function median(a) { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; }
function addMonth(ms) { const d = new Date(ms); d.setUTCMonth(d.getUTCMonth() + 1); return d.getTime(); }

const STATES = ["keep", "cancel_pending", "cancelled"];
export const isValidStatus = (s) =>
  s === null || (!!s && typeof s === "object" && STATES.includes(s.state) && Number.isFinite(s.at));

export function summarize(svc, { charges, expected = [], failed = [], cancelMails = [] }, status, now) {
  const paid = (charges || []).filter((c) => c.service === svc.key).sort((a, b) => b.date - a.date);
  const latest = paid[0] || null;

  // Price change: latest confirmed charge vs the previous one in the same currency
  let change = null;
  if (latest && latest.amount != null) {
    const prev = paid.slice(1).find((c) => c.amount != null && c.currency === latest.currency);
    if (prev) {
      const diff = Math.round((latest.amount - prev.amount) * 1000) / 1000;
      const decimals = Math.max(latest.decimals ?? 2, prev.decimals ?? 2);
      change = {
        dir: diff > 0 ? "up" : diff < 0 ? "down" : "same",
        from: prev, to: latest, diff, decimals,
        text: diff > 0
          ? `Increased from ${fmtMoney(prev.amount, prev.currency, decimals)} to ${fmtMoney(latest.amount, latest.currency, decimals)} (+${fmtMoney(diff, latest.currency, decimals)})`
          : diff < 0
            ? `Decreased from ${fmtMoney(prev.amount, prev.currency, decimals)} to ${fmtMoney(latest.amount, latest.currency, decimals)} (−${fmtMoney(-diff, latest.currency, decimals)})`
            : `Same as last time (${fmtMoney(latest.amount, latest.currency, decimals)})`,
      };
    }
  }

  // Status, with a cancellation email able to confirm a pending cancellation
  let state = status && status.state ? status.state : null;
  const cancelMail = (cancelMails || []).filter((m) => m.date).sort((a, b) => b.date - a.date)[0] || null;
  let confirmedByEmail = false;
  if (state === "cancel_pending" && cancelMail && cancelMail.date >= status.at - DAY) {
    state = "cancelled"; confirmedByEmail = true;
  }
  const cancelledAt = state === "cancelled" ? (confirmedByEmail ? cancelMail.date : status.at) : null;
  const chargedAfterCancel = cancelledAt ? paid.find((c) => c.date > cancelledAt + DAY) || null : null;

  // Next charge: a renewal notice if one is still ahead, otherwise an estimate from past intervals
  let next = null;
  if (state !== "cancelled" && latest) {
    const notice = (expected || [])
      .filter((e) => e.date && e.date > now - DAY && !paid.some((c) => Math.abs(c.date - e.date) < 3 * DAY))
      .sort((a, b) => a.date - b.date)[0];
    if (notice) {
      next = { kind: "expected", label: "Expected charge", date: notice.date, amount: notice.amount, currency: notice.currency, decimals: notice.decimals, threadId: notice.threadId };
    } else {
      const gaps = paid.slice(0, -1).map((c, i) => c.date - paid[i + 1].date).filter((g) => g > 20 * DAY && g < 400 * DAY);
      const gap = gaps.length ? median(gaps) : 30 * DAY;
      // Monthly plans renew on the same day each month, so step a calendar month rather than a fixed number of days
      const date = gap >= 27 * DAY && gap <= 33 * DAY ? addMonth(latest.date) : latest.date + gap;
      // If the estimated date has passed with no receipt, say so instead of quietly moving the date
      next = { kind: "estimated", label: "Estimated renewal", date, amount: latest.amount, currency: latest.currency, decimals: latest.decimals, late: date < now - 2 * DAY };
    }
  }

  const lastFailed = (failed || []).sort((a, b) => b.date - a.date)[0] || null;
  const failedOpen = lastFailed && (!latest || lastFailed.date > latest.date) ? lastFailed : null;

  // Things worth a badge on the Subscriptions tab
  const decidedSinceLatest = status && latest && status.at >= latest.date;
  const alerts = [];
  if (change && change.dir === "up" && !decidedSinceLatest) alerts.push("increase");
  if (chargedAfterCancel) alerts.push("charged_after_cancel");
  if (failedOpen) alerts.push("payment_failed");
  if (state === "cancel_pending" && next && next.date - now < 3 * DAY) alerts.push("cancel_soon");

  return { svc, paid, latest, change, next, state, statusAt: status ? status.at : null, cancelledAt, confirmedByEmail, cancelMail, chargedAfterCancel, failed: failedOpen, alerts };
}
