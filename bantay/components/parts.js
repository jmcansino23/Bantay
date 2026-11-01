"use client";
// Presentational pieces of the dashboard (cards, rows, labels).
import React from "react";
import {
  ArrowLeftRight, Send, ShieldAlert, CircleAlert, TriangleAlert, Truck, PackageCheck, Package, ShoppingBag,
  Mail, ChevronRight, ChevronUp, ChevronDown, CircleCheck, CheckCheck, CloudOff, Landmark, Repeat,
  Sparkles, Smartphone, House, CreditCard,
} from "lucide-react";
import { KIND_ICON, URGENT, DAY, ago, rel, fmt, clock, day, gmailLink, monthLabel } from "@/lib/rules";

const h = React.createElement;
const ICONS = {
  ArrowLeftRight, Send, ShieldAlert, AlertCircle: CircleAlert, AlertTriangle: TriangleAlert, Truck, PackageCheck,
  Package, ShoppingBag, Mail, ChevronRight, ChevronUp, ChevronDown, CheckCircle2: CircleCheck, CheckCheck, CloudOff,
  Landmark, Repeat, Sparkles, Smartphone, Home: House, CreditCard,
};
export const Icon = (name, props) => ICONS[name] ? h(ICONS[name], Object.assign({ size: 18, strokeWidth: 2, "aria-hidden": true }, props)) : null;

export function errorCopy(e){
  switch (e && e.code){
    case "reauth": return {title:"Google sign-in expired", body:"Sign in again to keep Bantay watching your mail.", deny:true, signin:true};
    case "signed_out": return {title:"You're signed out", body:"Sign in with Google to load your alerts.", deny:true, signin:true};
    case "gmail_forbidden": return {title:"Gmail access wasn't granted", body:"Sign in again and tick the box that lets Bantay read your Gmail.", deny:true, signin:true};
    case "rate_limited": return {title:"Gmail asked us to slow down", body:"Showing the last list. It will retry shortly."};
    case "offline": return {title:"You're offline", body:"Showing the last list. It will update when you're back online."};
    case "gmail_error": return {title:"Gmail didn't respond", body:"Showing the last list. It will retry on the next refresh."};
    default: return {title:"Couldn't load from Gmail", body:(e && e.message ? String(e.message).slice(0,160) + " " : "") + "Try Refresh."};
  }
}

export function Tab({active, onClick, label, count, icon, tone, alert}){
  return h("button",{onClick, role:"tab", "aria-selected":active,
    className:"flex-1 min-w-0 flex items-center justify-center gap-1.5 rounded-xl py-2.5 px-1 text-[13px] font-bold transition-colors",
    style:{background:active?`var(--${tone}-soft)`:"transparent", color:active?`var(--${tone})`:"var(--muted)"}},
    Icon(icon,{size:15}), h("span",{className:"truncate"}, label),
    count != null ? h("span",{className:"mono text-[11px] rounded-full px-1.5 shrink-0",
      style:{background: alert ? "var(--warn)" : (active?"var(--card)":"var(--chip)"), color: alert ? "var(--card)" : "inherit"}}, count) : null);
}

export function Row({m, now}){
  const tone = m.cat === "bank" ? "bank" : "ship";
  const urgent = URGENT.has(m.kind);
  const c = urgent ? "warn" : tone;
  return h("a",{href:gmailLink(m.threadId), target:"_blank", rel:"noopener",
      className:"group flex gap-3 items-start px-4 py-3.5 border-b last:border-b-0",
      style:{borderColor:"var(--line)", background:"var(--card)"}},
    h("div",{className:"shrink-0 w-10 h-10 rounded-full grid place-items-center", style:{background:`var(--${c}-soft)`, color:`var(--${c})`}},
      Icon(KIND_ICON[m.kind] || "Mail")),
    h("div",{className:"min-w-0 flex-1"},
      h("div",{className:"flex items-baseline justify-between gap-2"},
        h("span",{className:"font-extrabold text-[15px] truncate"}, m.sender),
        m.at ? h("time",{className:"mono text-[11px] shrink-0", style:{color:"var(--muted)"}, title:clock(m.at), dateTime:new Date(m.at).toISOString()}, ago(m.at, now)) : null),
      h("p",{className:"text-sm font-semibold leading-snug mt-0.5 break-words"}, m.subject),
      h("div",{className:"flex items-center gap-2 mt-1.5 min-w-0"},
        h("span",{className:"shrink-0 text-[11px] font-bold uppercase tracking-wider rounded-md px-1.5 py-0.5",
          style:{background:`var(--${c}-soft)`, color:`var(--${c})`}}, m.kind),
        h("span",{className:"mono text-[11px] truncate", style:{color:"var(--muted)"}}, m.addr))),
    h("span",{className:"shrink-0 self-center opacity-40 group-hover:opacity-100", style:{color:"var(--muted)"}}, Icon("ChevronRight",{size:16})));
}

const STATUS = {
  active:  {label:"Active",        tone:"ok"},
  renews:  {label:"Renews soon",   tone:"warn"},
  check:   {label:"No recent charge", tone:"warn"},
  clear:   {label:"All paid",      tone:"ok"},
  unpaid:  {label:"Unpaid",        tone:"sub"},
  overdue: {label:"Overdue",       tone:"warn"},
  none:    {label:"No bills found",tone:"chip"},
};
const Label = ({children, style}) => h("span",{className:"shrink-0 text-[11px] font-bold uppercase tracking-wider rounded-md px-1.5 py-0.5", style}, children);
const toneStyle = t => t === "chip" ? {background:"var(--chip)", color:"var(--muted)"} : {background:`var(--${t}-soft)`, color:`var(--${t})`};

function CardHead({s}){
  const st = STATUS[s.status];
  const months = Math.round(s.interval / (30*DAY));
  return h("div",{className:"flex items-center gap-3"},
    h("div",{className:"shrink-0 w-10 h-10 rounded-xl grid place-items-center", style:{background:"var(--sub-soft)", color:"var(--sub)"}}, Icon(s.def.icon || "Repeat")),
    h("div",{className:"min-w-0 flex-1"},
      h("h2",{className:"font-extrabold text-[15px] truncate"}, s.def.name),
      h("p",{className:"text-[11px] mono", style:{color:"var(--muted)"}}, s.last ? (months > 1 ? `Every ~${months} months` : "Monthly") : "—")),
    h(Label,{style:toneStyle(st.tone)}, s.kind === "bills" && s.unpaid.length ? `${s.unpaid.length} ${st.label}` : st.label));
}

export function RenewalCard({s, unread, now}){
  const pct = s.last ? Math.min(100, Math.max(0, (now - s.last) / s.interval * 100)) : 0;
  return h("article",{className:"rounded-2xl border px-4 py-4", style:{borderColor:"var(--line)", background:"var(--card)"}},
    h(CardHead,{s}),
    s.last ? h(React.Fragment,null,
      h("dl",{className:"grid grid-cols-2 gap-3 mt-4"},
        h("div",null, h("dt",{className:"text-[11px] font-bold uppercase tracking-wider", style:{color:"var(--muted)"}}, "Last charge"),
          h("dd",{className:"mono text-sm mt-0.5"}, day(s.last), h("span",{style:{color:"var(--muted)"}}, " · " + rel(s.last, now)))),
        h("div",null, h("dt",{className:"text-[11px] font-bold uppercase tracking-wider", style:{color:"var(--muted)"}}, "Next renewal"),
          h("dd",{className:"mono text-sm mt-0.5"}, "~" + day(s.next), h("span",{style:{color:"var(--muted)"}}, " · " + rel(s.next, now))))),
      h("div",{className:"mt-3 h-1.5 rounded-full overflow-hidden", style:{background:"var(--chip)"}, role:"progressbar", "aria-valuenow":Math.round(pct), "aria-valuemin":0, "aria-valuemax":100, "aria-label":"Billing cycle elapsed"},
        h("div",{className:"h-full rounded-full", style:{width:pct+"%", background: pct >= 85 ? "var(--warn)" : "var(--sub)"}})),
      h("ul",{className:"mt-3 border-t", style:{borderColor:"var(--line)"}},
        s.recent.map(m => h("li",{key:m.threadId},
          h("a",{href:gmailLink(m.threadId), target:"_blank", rel:"noopener", className:"flex items-center gap-2 py-2 text-[13px] min-w-0"},
            unread.has(m.threadId) ? h("span",{className:"shrink-0 w-2 h-2 rounded-full", style:{background:"var(--sub)"}, title:"Unread"}) : h("span",{className:"shrink-0 w-2"}),
            h("span",{className:"truncate flex-1", style:{fontWeight: unread.has(m.threadId) ? 700 : 500}}, m.subject),
            h("span",{className:"mono text-[11px] shrink-0", style:{color:"var(--muted)"}}, day(m.at)))))))
    : h("p",{className:"text-xs mt-3", style:{color:"var(--muted)"}}, "No receipts from this service in the last 13 months."));
}

export function BillsCard({s, unread, now, canMark, onMark, busyKey}){
  const [showPaid, setShowPaid] = React.useState(false);
  const [confirmAll, setConfirmAll] = React.useState(false);
  const key = s.def.key;
  const MonthRow = (b, paid) => h("li",{key:b.month, className:"flex items-center gap-3 py-2.5 border-b last:border-b-0", style:{borderColor:"var(--line)"}},
    h("a",{href:gmailLink(b.mail.threadId), target:"_blank", rel:"noopener", className:"min-w-0 flex-1"},
      h("div",{className:"flex items-center gap-2 min-w-0"},
        unread.has(b.mail.threadId) ? h("span",{className:"shrink-0 w-2 h-2 rounded-full", style:{background:"var(--sub)"}, title:"Unread"}) : null,
        h("span",{className:"font-bold text-sm truncate"}, monthLabel(b.month)),
        b.overdue ? h(Label,{style:toneStyle("warn")}, "Overdue") : null),
      h("p",{className:"mono text-[11px] mt-0.5 truncate", style:{color:"var(--muted)"}},
        !b.loaded ? "Loading bill details…"
          : paid ? (b.paidBy === "receipt" ? "Cleared by Omantel payment receipt" : "Marked paid by you")
          : [b.balance, b.due ? `due ${day(b.due)} (${rel(b.due, now)})` : "due date not in email"].filter(Boolean).join(" · "))),
    canMark && (b.paidBy !== "receipt")
      ? h("button",{onClick:() => onMark([`${key}:${b.month}`], !paid), disabled: busyKey != null,
          className:"shrink-0 text-xs font-bold rounded-lg px-2.5 py-1.5 border disabled:opacity-40",
          style: paid ? {borderColor:"var(--line)", color:"var(--muted)", background:"transparent"} : {borderColor:"var(--ok)", color:"var(--ok)", background:"var(--ok-soft)"}},
          paid ? "Undo" : "Mark paid")
      : null);

  return h("article",{className:"rounded-2xl border px-4 py-4", style:{borderColor:"var(--line)", background:"var(--card)"}},
    h(CardHead,{s}),
    s.last ? h(React.Fragment,null,
      h("dl",{className:"grid grid-cols-2 gap-3 mt-4"},
        h("div",null, h("dt",{className:"text-[11px] font-bold uppercase tracking-wider", style:{color:"var(--muted)"}}, key === "omantel" ? "Last payment" : "Latest bill"),
          h("dd",{className:"mono text-sm mt-0.5"}, key === "omantel" ? (s.lastPay ? day(s.lastPay) : "No receipt") : day(s.last))),
        h("div",null, h("dt",{className:"text-[11px] font-bold uppercase tracking-wider", style:{color:"var(--muted)"}}, "Next bill"),
          h("dd",{className:"mono text-sm mt-0.5"}, "~" + day(s.next), h("span",{style:{color:"var(--muted)"}}, " · " + rel(s.next, now))))),
      h("div",{className:"mt-3"},
        h("p",{className:"text-[11px] font-bold uppercase tracking-wider mb-1", style:{color:"var(--muted)"}}, "Unpaid months"),
        s.unpaid.length
          ? h("ul",null, s.unpaid.map(b => MonthRow(b, false)))
          : h("p",{className:"text-sm font-semibold flex items-center gap-1.5 py-1.5", style:{color:"var(--ok)"}}, Icon("CheckCircle2",{size:16}), "Nothing unpaid in the last 12 months"),
        canMark && s.unpaid.length > 1
          ? (confirmAll
              ? h("div",{className:"flex items-center gap-2 mt-2 text-xs"},
                  h("span",{className:"flex-1", style:{color:"var(--muted)"}}, `Mark all ${s.unpaid.length} months as paid?`),
                  h("button",{onClick:() => { setConfirmAll(false); onMark(s.unpaid.map(b => `${key}:${b.month}`), true); },
                    className:"font-bold rounded-lg px-2.5 py-1.5", style:{background:"var(--ok)", color:"var(--card)"}}, "Yes, mark paid"),
                  h("button",{onClick:() => setConfirmAll(false), className:"font-bold rounded-lg px-2.5 py-1.5 border", style:{borderColor:"var(--line)"}}, "Cancel"))
              : h("button",{onClick:() => setConfirmAll(true), className:"mt-2 text-xs font-bold", style:{color:"var(--muted)"}}, "Mark all as paid…"))
          : null,
        s.paid.length
          ? h("button",{onClick:() => setShowPaid(v => !v), className:"mt-2 text-xs font-bold flex items-center gap-1", style:{color:"var(--muted)"}, "aria-expanded":showPaid},
              Icon(showPaid ? "ChevronUp" : "ChevronDown",{size:14}), `${showPaid ? "Hide" : "Show"} paid months (${s.paid.length})`)
          : null,
        showPaid ? h("ul",{className:"mt-1 opacity-80"}, s.paid.map(b => MonthRow(b, true))) : null),
      key === "omantel" ? h("p",{className:"text-[11px] mt-3", style:{color:"var(--muted)"}}, "A kiosk or app payment receipt clears that month and earlier ones. Paid another way? Tap Mark paid.") : null,
      key === "pagibig" ? h("p",{className:"text-[11px] mt-3", style:{color:"var(--muted)"}}, "Pag-IBIG doesn't email payment confirmations, so tap Mark paid after each payment.") : null)
    : h("p",{className:"text-xs mt-3", style:{color:"var(--muted)"}}, "No bills from this service in the last 13 months."));
}

const CYCLE = {
  paid:    {label:"Paid",          tone:"ok"},
  minimum: {label:"Minimum paid",  tone:"sub"},
  partial: {label:"Part paid",     tone:"warn"},
  unpaid:  {label:"Unpaid",        tone:"warn"},
  unknown: {label:"Not confirmed", tone:"warn"},
  pending: {label:"No payment yet",tone:"sub"},
};
function cycleDetail(y){
  if (!y.loaded) return "Loading…";
  const parts = [];
  if (y.amount) parts.push("Due " + y.amount);
  const p = y.pays && y.pays[0];
  if (y.byYou) parts.push("Marked paid by you");
  else if (p) parts.push(`${p.full ? "Paid in full" : "Paid"}${p.amount ? " " + p.amount : ""} on ${day(p.at)}` + (y.pays.length > 1 ? ` (+${y.pays.length-1} more)` : "") + (p.left && !p.full ? ` · ${p.left} left` : ""));
  else if (y.status === "pending") parts.push("No payment found this month yet");
  else if (y.status === "unknown") parts.push("No payment email to check against");
  else if (y.status === "unpaid") parts.push("No payment found");
  return parts.join(" · ");
}

export function CreditCardBox({c, unread, canMark, onMark, busyKey}){
  const [showPaid, setShowPaid] = React.useState(false);
  const st = CYCLE[c.latest.status];
  const markable = y => canMark && !(y.pays && y.pays.length) && !y.zero;
  const Row = (y, isPaid) => h("li",{key:y.month + y.at, className:"flex items-center gap-3 py-2.5 border-b last:border-b-0", style:{borderColor:"var(--line)"}},
    h("a",{href: y.threadId ? gmailLink(y.threadId) : undefined, target:"_blank", rel:"noopener", className:"min-w-0 flex-1"},
      h("div",{className:"flex items-center gap-2 min-w-0"},
        y.threadId && unread.has(y.threadId) ? h("span",{className:"shrink-0 w-2 h-2 rounded-full", style:{background:"var(--sub)"}, title:"Unread"}) : null,
        h("span",{className:"font-bold text-sm truncate"}, y.label),
        h(Label,{style:toneStyle(CYCLE[y.status].tone)}, CYCLE[y.status].label)),
      h("p",{className:"mono text-[11px] mt-0.5 break-words", style:{color:"var(--muted)"}}, cycleDetail(y))),
    markable(y) && y.status !== "pending"
      ? h("button",{onClick:() => onMark([`card:${c.key}:${y.month}`], !y.byYou), disabled: busyKey != null,
          className:"shrink-0 text-xs font-bold rounded-lg px-2.5 py-1.5 border disabled:opacity-40",
          style: y.byYou ? {borderColor:"var(--line)", color:"var(--muted)"} : {borderColor:"var(--ok)", color:"var(--ok)", background:"var(--ok-soft)"}},
          y.byYou ? "Undo" : "Mark paid")
      : null);
  const others = c.unpaid.filter(y => y !== c.latest);
  return h("article",{className:"rounded-2xl border px-4 py-4", style:{borderColor:"var(--line)", background:"var(--card)"}},
    h("div",{className:"flex items-center gap-3"},
      h("div",{className:"shrink-0 w-10 h-10 rounded-xl grid place-items-center", style:{background:"var(--bank-soft)", color:"var(--bank)"}}, Icon(c.icon)),
      h("div",{className:"min-w-0 flex-1"},
        h("h2",{className:"font-extrabold text-[15px] truncate"}, c.name),
        h("p",{className:"text-[11px] mono", style:{color:"var(--muted)"}}, c.cur + (c.monthly ? " · monthly payments" : " · monthly statement"))),
      h(Label,{style:toneStyle(st.tone)}, st.label)),
    h("p",{className:"text-[11px] font-bold uppercase tracking-wider mt-4 mb-1", style:{color:"var(--muted)"}}, c.monthly ? "This month" : "Latest statement"),
    h("ul",null, Row(c.latest)),
    others.length ? h(React.Fragment,null,
      h("p",{className:"text-[11px] font-bold uppercase tracking-wider mt-3 mb-1", style:{color:"var(--warn)"}}, `Earlier unpaid (${others.length})`),
      h("ul",null, others.map(y => Row(y)))) : null,
    c.paid.filter(y => y !== c.latest).length
      ? h("button",{onClick:() => setShowPaid(v => !v), className:"mt-2 text-xs font-bold flex items-center gap-1", style:{color:"var(--muted)"}, "aria-expanded":showPaid},
          Icon(showPaid ? "ChevronUp" : "ChevronDown",{size:14}), `${showPaid ? "Hide" : "Show"} paid months (${c.paid.filter(y => y !== c.latest).length})`)
      : null,
    showPaid ? h("ul",{className:"mt-1 opacity-80"}, c.paid.filter(y => y !== c.latest).map(y => Row(y))) : null,
    h("p",{className:"text-[11px] mt-3", style:{color:"var(--muted)"}}, c.note));
}

export function Skeleton(n){
  return h("section",{className:"rounded-2xl border overflow-hidden", style:{borderColor:"var(--line)", background:"var(--card)"}, "aria-label":"Loading"},
    Array.from({length:n||4}).map((_,i) => h("div",{key:i, className:"flex gap-3 px-4 py-3.5 border-b last:border-b-0", style:{borderColor:"var(--line)"}},
      h("div",{className:"skel w-10 h-10 rounded-full shrink-0"}),
      h("div",{className:"flex-1 flex flex-col gap-2 pt-1"},
        h("div",{className:"skel h-3.5 w-1/3"}), h("div",{className:"skel h-3 w-4/5"}), h("div",{className:"skel h-3 w-1/2"})))));
}

export function Banner({err, onAsk}){
  const c = errorCopy(err);
  return h("div",{className:"rounded-2xl border px-4 py-3 mb-3 flex gap-3 items-start", role:"status",
      style:{borderColor:"var(--line)", background:"var(--card)"}},
    h("span",{style:{color: c.deny ? "var(--warn)" : "var(--muted)"}}, Icon(c.deny ? "AlertTriangle" : "CloudOff",{size:18})),
    h("div",{className:"min-w-0 flex-1"},
      h("p",{className:"text-sm font-bold"}, c.title),
      h("p",{className:"text-xs mt-0.5 break-words", style:{color:"var(--muted)"}}, c.body),
      c.signin ? h("a",{href:"/api/auth/login", className:"inline-block mt-2 text-xs font-bold rounded-lg px-3 py-1.5",
        style:{background:"var(--fg)", color:"var(--bg)"}}, "Sign in with Google") : null));
}

export function Empty({tone, icon, title, body}){
  return h("div",{className:"rounded-2xl border px-6 py-10 text-center", style:{borderColor:"var(--line)", background:"var(--card)"}},
    h("div",{className:"mx-auto w-11 h-11 rounded-full grid place-items-center mb-3", style:{background:`var(--${tone}-soft)`, color:`var(--${tone})`}}, Icon(icon,{size:20})),
    h("p",{className:"font-bold"}, title),
    h("p",{className:"text-xs mt-1", style:{color:"var(--muted)"}}, body));
}

/* ---------- App ---------- */
