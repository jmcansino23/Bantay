// Shared rules for Bantay: which emails count, how bills and card dues are matched.
// Used by both the server (to pick which emails need their bodies) and the browser (to build the views).
export const TZ = "Asia/Muscat";
export const LIMIT = 15;
export const DAY = 86400000;

/* ---------- Senders ---------- */
export const BANKS = [
  {name:"Bank Muscat", match:/bankmuscat\./i},
  {name:"Maya",        match:/(^|\.)maya\.ph$/i},
  {name:"MariBank",    match:/maribank/i},
  {name:"GCash",       match:/gcash/i},
  {name:"Landbank",    match:/landbank/i},
  {name:"Pag-IBIG",    match:/pagibigfund/i},
];
export const SHIPS = [
  {name:"DHL",        match:/(^|\.)dhl\./i},
  {name:"Shopee",     match:/shopee/i},
  {name:"AliExpress", match:/aliexpress/i},
  {name:"Temu",       match:/temu\.com/i},
];
// Recurring bills / app & web subscriptions (not marketing newsletters)
export const SUBS = [
  {key:"claude",  name:"Claude Pro",            icon:"Sparkles",  match:/(^|\.)anthropic\.com$/i, subj:/receipt|invoice|subscription|renew|payment|charge/i},
  {key:"omantel", name:"Omantel",               icon:"Smartphone",match:/(^|\.)omantel\.om$/i,    subj:/bill|receipt|payment|invoice/i},
  {key:"pagibig", name:"Pag-IBIG Housing Loan", icon:"Home",      match:/(^|\.)pagibigfund\.gov\.ph$/i, subj:/billing|bill|payment|receipt|statement of account|soa/i},
];

// Marketing senders filtered out at the Gmail query level
export const NO_PROMO = "-from:newarrival.aliexpress.com -from:selections.aliexpress.com -from:newsletter.shopee.ph -from:deals.maya.ph -from:info.landbank.com";
export const FEED_INPUT = {
  query: "is:unread in:inbox newer_than:3d (from:bankmuscat.com OR from:bankmuscat.om OR from:maya.ph OR from:maribank OR from:gcash OR from:landbank OR from:pagibigfund.gov.ph OR from:dhl OR from:shopee OR from:aliexpress.com OR from:temu.com OR from:anthropic.com OR from:omantel.om) " + NO_PROMO,
  pageSize: 50, view: "THREAD_VIEW_MINIMAL"};
export const SUB_INPUT = {
  query: "(from:anthropic.com OR from:omantel.om OR from:pagibigfund.gov.ph) (receipt OR invoice OR bill OR billing OR subscription OR payment) newer_than:13m",
  pageSize: 50, view: "THREAD_VIEW_MINIMAL"};

export const CARD_INPUT = {
  query: '((from:mayabank.ph subject:"billing statement") OR (from:maribank.com.ph subject:"Credit Bill") OR (from:americanexpress.com.bh subject:"e-Statement")) newer_than:7m',
  pageSize: 40, view: "THREAD_VIEW_MINIMAL"};
export const BM_PAY_INPUT = {
  query: 'from:bankmuscat.com ("credit card payment" OR "AMEX CREDIT CARD") newer_than:7m',
  pageSize: 40, view: "THREAD_VIEW_MINIMAL"};
export const dkey = m => m.threadId + "@" + m.mid;

export const PROMO_HOST = /(newsletter|deals|newarrival|selections|promo|marketing|news|info)\./i;
export const PROMO_WORDS = /sale|voucher|% ?off|deal|discount|coupon|exclusive|cashback|miles|reward|win\b|free\b|trick or treat/i;

/* ---------- Importance filters: return a kind or null (null = hide) ---------- */
export function bankKind(s){
  if (/login|log-in|sign(ed)? ?in|device|beneficiary|otp|password|pin\b|suspicious|unauthori[sz]ed|blocked|locked/i.test(s)) return "Security";
  if (/declin|fail|reject|insufficient|overdue|past due|due (date|today|soon)|payment due|reminder/i.test(s)) return "Payment due";
  if (/transfer|remit/i.test(s)) return "Transfer";
  if (/transaction|debit|credit(ed)?\b|purchase|withdraw|deposit|received/i.test(s)) return "Transaction";
  return null; // statements, newsletters, notices
}
export function shipKind(s){
  if (/customs|duty|duties|failed|unsuccessful|attempt|pick ?up|on hold|held|address|action required|return/i.test(s)) return "Action needed";
  if (/out for delivery/i.test(s)) return "Out for delivery";
  if (/delivered|have you received/i.test(s)) return "Delivered";
  if (/shipped|shipment|dispatch|in transit|on the way|tracking|courier|waybill|parcel|package/i.test(s)) return "Shipped";
  if (/order|payment (has been )?confirmed|checkout/i.test(s)) return "Order";
  return null; // cart nudges, recommendations, sign-in notices
}
export const KIND_ICON = {"Transaction":"ArrowLeftRight","Transfer":"Send","Security":"ShieldAlert","Payment due":"AlertCircle",
  "Action needed":"AlertTriangle","Out for delivery":"Truck","Delivered":"PackageCheck","Shipped":"Package","Order":"ShoppingBag"};
export const URGENT = new Set(["Security","Payment due","Action needed","Out for delivery"]);

// Gmail message ids carry the receive time in their upper bits (ms since epoch).
export function idTime(id){ try { return Number(BigInt("0x" + id) >> 20n); } catch(e) { return 0; } }

export function parseMsgs(payload){
  const out = [];
  for (const t of ((payload && payload.threads) || [])){
    const msgs = t.messages || [];
    const m = msgs[msgs.length - 1];
    if (!m) continue;
    const from = String(m.sender || "");
    const addr = (from.match(/<([^>]+)>/) || [,from])[1].trim().toLowerCase();
    const domain = addr.split("@")[1] || addr;
    out.push({threadId: t.id || m.threadId, mid: m.id || t.id, addr, domain, subject: m.subject || "(no subject)",
      labels: m.labelIds || [], at: m.at || idTime(m.id || t.id)});
  }
  return out;
}

export function buildFeed(payload){
  const feed = [], unreadSubs = new Set();
  for (const m of parseMsgs(payload)){
    if (m.labels.length && !m.labels.includes("UNREAD")) continue;
    const sub = SUBS.find(x => x.match.test(m.domain) && x.subj.test(m.subject));
    if (sub){ unreadSubs.add(m.threadId); continue; }
    if (PROMO_HOST.test(m.domain) || PROMO_WORDS.test(m.subject)) continue;
    const b = BANKS.find(x => x.match.test(m.domain));
    const s = !b && SHIPS.find(x => x.match.test(m.domain));
    if (!b && !s) continue;
    const kind = b ? bankKind(m.subject) : shipKind(m.subject);
    if (!kind) continue;
    feed.push(Object.assign({}, m, {sender:(b||s).name, cat: b ? "bank" : "ship", kind}));
  }
  feed.sort((a,b) => b.at - a.at);
  return {feed: feed.slice(0, LIMIT), unreadSubs};
}

export function median(a){ const s=[...a].sort((x,y)=>x-y); return s.length ? s[Math.floor(s.length/2)] : 0; }

export const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];
export function monthKey(name, year){ const i = MONTHS.indexOf(String(name).toLowerCase()); return i < 0 ? null : `${year}-${String(i+1).padStart(2,"0")}`; }
export function monthLabel(key){ const [y,m] = key.split("-"); return MONTHS[+m-1].replace(/^./, c => c.toUpperCase()) + " " + y; }
export function parseDate(txt){ const t = Date.parse(txt + " 23:59 GMT+0400"); return isNaN(t) ? 0 : t; }

// Read the month / balance / due date out of a bill email body
export function parseBill(key, body){
  const text = String(body || "").replace(/\|/g, " ").replace(/\s+/g, " ");
  const mm = text.match(/for the month of\s+([A-Za-z]+)\s+(\d{4})/i);
  const out = {month: mm ? monthKey(mm[1], mm[2]) : null, balance: null, due: 0};
  if (key === "omantel"){
    const bal = text.match(/Statement Balance:\s*([\d.,]+)\s*OMR/i);
    if (bal) out.balance = bal[1] + " OMR";
    const due = text.match(/Payment Due Date:\s*([A-Za-z]+ \d{1,2}, \d{4})/i);
    if (due) out.due = parseDate(due[1]);
  } else {
    const due = text.match(/on or before\s+([A-Za-z]+ \d{1,2}, \d{4})/i);
    if (due) out.due = parseDate(due[1]);
  }
  return out;
}

export const isBillMail = (key, subj) => key === "omantel" ? /your omantel bill/i.test(subj) : key === "pagibig" ? /billing/i.test(subj) : false;
export const isPayMail  = (key, subj) => key === "omantel" ? /receipt/i.test(subj) : false;
export const BILL_WINDOW = {omantel: 12, pagibig: 12}; // months of bills checked

export function buildSubs(payload, now, details, paidMarks){
  const msgs = parseMsgs(payload);
  return SUBS.map(def => {
    const mine = msgs.filter(m => def.match.test(m.domain) && def.subj.test(m.subject)).sort((a,b) => b.at - a.at);
    if (def.key === "claude"){
      const cycles = [];
      for (const m of mine) if (!cycles.length || cycles[cycles.length-1] - m.at > 3*DAY) cycles.push(m.at);
      const gaps = cycles.slice(0,-1).map((t,i) => t - cycles[i+1]).filter(g => g > 20*DAY && g < 400*DAY);
      const interval = gaps.length ? median(gaps) : 30*DAY;
      const last = cycles[0] || 0, next = last ? last + interval : 0;
      const status = !last ? "none" : now > next + 3*DAY ? "check" : (next - now < 5*DAY ? "renews" : "active");
      return {def, kind:"renewal", recent: mine.slice(0,3), last, next, interval, status};
    }
    // Bill-based services: one entry per billing month
    const bills = mine.filter(m => isBillMail(def.key, m.subject));
    const pays = mine.filter(m => isPayMail(def.key, m.subject));
    const lastPay = pays[0] ? pays[0].at : 0;
    const byMonth = new Map();
    for (const m of bills){
      const d = details[dkey(m)];
      const parsed = d && d.ok ? parseBill(def.key, d.body) : null;
      const month = (parsed && parsed.month) || fmt(m.at, {year:"numeric", month:"2-digit"}).split("/").reverse().join("-");
      if (byMonth.has(month)) continue;        // newest email per month wins
      byMonth.set(month, {month, mail:m, balance: parsed && parsed.balance, due: parsed && parsed.due, loaded: !!d});
    }
    const months = [...byMonth.values()].sort((a,b) => b.month.localeCompare(a.month)).slice(0, BILL_WINDOW[def.key]);
    for (const b of months){
      const mark = paidMarks[`${def.key}:${b.month}`];
      // Omantel: a payment receipt after a bill clears that bill and every earlier one (running balance)
      const receipt = def.key === "omantel" && lastPay && lastPay > b.mail.at;
      b.paid = !!(mark || receipt);
      b.paidBy = mark ? "you" : receipt ? "receipt" : null;
      b.overdue = !b.paid && b.due && now > b.due;
    }
    const unpaid = months.filter(b => !b.paid);
    const paid = months.filter(b => b.paid);
    const gaps = months.slice(0,-1).map((b,i) => b.mail.at - months[i+1].mail.at).filter(g => g > 20*DAY && g < 60*DAY);
    const interval = gaps.length ? median(gaps) : 30*DAY;
    const last = months[0] ? months[0].mail.at : 0;
    const next = last ? last + interval : 0;
    const status = !months.length ? "none" : unpaid.some(b => b.overdue) ? "overdue" : unpaid.length ? "unpaid" : "clear";
    return {def, kind:"bills", unpaid, paid, last, next, interval, lastPay, status};
  });
}

/* ---------- Credit cards ---------- */
export const CARD_WINDOW = 6;
export const num = v => parseFloat(String(v).replace(/,/g, "")) || 0;
export const flat = b => String(b || "").replace(/\|/g, " ").replace(/\s+/g, " ");
export const monthOf = ms => fmt(ms, {year:"numeric", month:"2-digit"}).split("/").reverse().join("-");
export const MON3 = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};

// Bank Muscat debits that paid a credit card (one email per payment, bundled into daily threads)
export function bmPayments(bmRes, details){
  const out = [], seen = new Set();
  for (const t of parseMsgs(bmRes)){
    const d = details[dkey(t)];
    if (!d || !d.ok) continue;
    for (const x of d.msgs){
      if (seen.has(x.id)) continue; seen.add(x.id);
      const b = String(x.body || "");
      const card = b.match(/(\d{4})X+(\d{4})\s*-\s*(Credit Card payment|AMEX[^\n]*)/i);
      const amt = b.match(/debited by OMR\s*([\d.,]+)/i);
      if (card && amt) out.push({last4: card[2], amex: /amex/i.test(card[3]), amount: "OMR " + amt[1], at: x.at, threadId: t.threadId});
    }
  }
  return out.sort((a,b) => b.at - a.at);
}

export function finishCard(c, marks, now){
  const cyc = c.cycles.sort((a,b) => b.at - a.at).slice(0, CARD_WINDOW);
  cyc.forEach((y, i) => {
    const start = y.at, end = i === 0 ? Infinity : cyc[i-1].at;
    if (!y.status){
      const inWin = c.payments.filter(p => p.at >= start && p.at < end);
      y.pays = inWin;
      if (y.zero) y.status = "paid";
      else if (inWin.some(p => p.full)) y.status = "paid";
      else if (inWin.some(p => p.minDone)) y.status = "minimum";
      else if (inWin.length) y.status = c.paidOnAny ? "paid" : "partial";
      else y.status = c.noProof ? "unknown" : "unpaid";
    }
    if (marks[`card:${c.key}:${y.month}`] && y.status !== "paid"){ y.status = "paid"; y.byYou = true; }
  });
  const latest = cyc[0];
  const unpaid = cyc.filter(y => ["unpaid","unknown","partial"].includes(y.status) && !(y === latest && y.status === "pending"));
  return Object.assign(c, {cycles: cyc, latest, unpaid, paid: cyc.filter(y => y.status === "paid" || y.status === "minimum")});
}

export function buildCards(cardRes, bmRes, details, marks, now){
  const msgs = cardRes ? parseMsgs(cardRes) : [];
  const pays = bmRes ? bmPayments(bmRes, details) : [];
  const cards = [];

  // Maya Black: statement emails carry the period and total due; no payment emails exist
  const maya = msgs.filter(m => /mayabank\.ph$/.test(m.domain) && /billing statement/i.test(m.subject)).map(m => {
    const d = details[dkey(m)], t = d && d.ok ? flat(d.body) : "";
    const per = t.match(/for (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/);
    const amt = t.match(/total amount due is\s*₱\s*([\d,.]+)/i);
    return {month: per ? per[2].slice(0,7) : monthOf(m.at), at: m.at, threadId: m.threadId, loaded: !!d,
      label: per ? `${day(Date.parse(per[1]))} – ${day(Date.parse(per[2]))}` : `Statement ${day(m.at)}`,
      amount: amt ? "₱" + amt[1] : null, zero: amt ? num(amt[1]) === 0 : false};
  });
  if (maya.length) cards.push(finishCard({key:"maya", name:"Maya Black Credit Card", icon:"CreditCard", cur:"PHP", cycles: maya, payments: [], noProof: true,
    note:"Maya doesn't email payment confirmations. Tap Mark paid once you've paid (or it was auto-deducted from your wallet)."}, marks, now));

  // MariCard: statements + repayment emails with remaining dues
  const mari = msgs.filter(m => /maribank/.test(m.domain));
  const mariSt = mari.filter(m => /statement/i.test(m.subject)).map(m => {
    const mm = m.subject.match(/for\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/i);
    const month = mm && MON3[mm[1].toLowerCase()] ? `${mm[2]}-${String(MON3[mm[1].toLowerCase()]).padStart(2,"0")}` : monthOf(m.at);
    return {month, at: m.at, threadId: m.threadId, loaded: true, label: `${monthLabel(month)} statement`, amount: null};
  });
  const mariPay = mari.filter(m => /repayment/i.test(m.subject)).map(m => {
    const d = details[dkey(m)], t = d && d.ok ? flat(d.body) : "";
    const amt = t.match(/repayment of PHP\s*([\d,.]+)/i);
    const minLeft = t.match(/Remaining Minimum Amount Due:\s*([\d,.]+)/i);
    const totLeft = t.match(/Remaining Total Amount Due:\s*([\d,.]+)/i);
    return {at: m.at, threadId: m.threadId, amount: amt ? "₱" + amt[1] : null,
      full: /full repayment/i.test(m.subject) || (totLeft && num(totLeft[1]) === 0),
      minDone: minLeft ? num(minLeft[1]) === 0 : false,
      left: totLeft ? "₱" + totLeft[1] : null};
  });
  if (mariSt.length) cards.push(finishCard({key:"maricard", name:"MariCard Credit", icon:"CreditCard", cur:"PHP", cycles: mariSt, payments: mariPay,
    note:"Status comes from MariBank's repayment emails."}, marks, now));

  // Amex: e-statements; payments show up as Bank Muscat "AMEX CREDIT CARD" debits
  const amexSt = msgs.filter(m => /americanexpress/.test(m.domain)).map(m => ({month: monthOf(m.at), at: m.at, threadId: m.threadId, loaded: true, label: `Statement ${day(m.at)}`, amount: null}));
  if (amexSt.length) cards.push(finishCard({key:"amex", name:"American Express", icon:"CreditCard", cur:"OMR", cycles: amexSt, payments: pays.filter(p => p.amex), paidOnAny: true,
    note:"Payments are matched from Bank Muscat debits to your Amex. Paid another way? Tap Mark paid."}, marks, now));

  // Bank Muscat credit cards: no statements by email, so each calendar month needs a payment
  const groups = {};
  for (const p of pays.filter(p => !p.amex)) (groups[p.last4] = groups[p.last4] || []).push(p);
  for (const [last4, ps] of Object.entries(groups)){
    const first = monthOf(Math.min(...ps.map(p => p.at)));
    const cycles = [];
    const cur = new Date(now);
    for (let i = 0; i < CARD_WINDOW; i++){
      const d = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - i, 1));
      const month = `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,"0")}`;
      if (month < first) break;
      const start = Date.parse(month + "-01T00:00:00+04:00");
      const nd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth()+1, 1));
      const end = Date.parse(`${nd.getUTCFullYear()}-${String(nd.getUTCMonth()+1).padStart(2,"0")}-01T00:00:00+04:00`);
      const inMonth = ps.filter(p => p.at >= start && p.at < end);
      cycles.push({month, at: start, loaded: true, label: monthLabel(month), amount: null, pays: inMonth, threadId: inMonth[0] && inMonth[0].threadId,
        status: inMonth.length ? "paid" : (i === 0 ? "pending" : "unpaid")});
    }
    cards.push(finishCard({key:"bm" + last4, name:`Bank Muscat card ·${last4}`, icon:"CreditCard", cur:"OMR", cycles, payments: ps, monthly: true,
      note:"Bank Muscat doesn't email card statements, so a month counts as paid when a card payment debit appears."}, marks, now));
  }
  return cards;
}



export function ago(ms, now){
  if (!ms) return "";
  const m = Math.max(0, Math.round((now - ms)/60000));
  if (m < 1) return "now";
  if (m < 60) return m + "m";
  const hr = Math.round(m/60);
  if (hr < 24) return hr + "h";
  return Math.round(hr/24) + "d";
}
export function rel(ms, now){
  const d = Math.round((ms - now)/DAY);
  if (d === 0) return "today";
  return d > 0 ? `in ${d}d` : `${-d}d ago`;
}
export const fmt = (ms, o) => new Date(ms).toLocaleString("en-GB", Object.assign({timeZone: TZ}, o));
export const clock = ms => fmt(ms, {day:"numeric", month:"short", hour:"2-digit", minute:"2-digit"});
export const day = ms => fmt(ms, {day:"numeric", month:"short"});
export const gmailLink = id => `https://mail.google.com/mail/u/0/#all/${id}`;
// Which threads need their full text fetched on the server
export function billThreadsNeedingBodies(subPayload){
  return parseMsgs(subPayload)
    .filter(m => SUBS.some(d => d.key !== "claude" && d.match.test(m.domain) && isBillMail(d.key, m.subject)))
    .sort((a,b) => b.at - a.at).slice(0, 30);
}
export function cardThreadsNeedingBodies(cardPayload, bmPayload){
  const a = parseMsgs(cardPayload).filter(m =>
    (/mayabank/.test(m.domain) && /statement/i.test(m.subject)) || (/maribank/.test(m.domain) && /repayment/i.test(m.subject)));
  return a.concat(parseMsgs(bmPayload));
}
