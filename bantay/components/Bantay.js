"use client";
import React from "react";
import { RefreshCw, LogOut } from "lucide-react";
import { URGENT, buildFeed, buildSubs, buildCards, fmt } from "@/lib/rules";
import { Tab, Row, RenewalCard, BillsCard, CreditCardBox, Skeleton, Banner, Empty } from "@/components/parts";
import { RecurringSection, useRecurring } from "@/components/Recurring";

const h = React.createElement;

export function Logo({ size = 36 }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} className="shrink-0" role="img" aria-label="Bantay">
      <rect width="120" height="120" rx="26" fill="#3f4fb0" />
      <path d="M16 60 Q60 18 104 60 Q60 102 16 60 Z" fill="#ffffff" />
      <circle cx="60" cy="60" r="20" fill="#14201c" />
      <circle cx="60" cy="60" r="9" fill="#5cc8ad" />
      <circle cx="67" cy="52" r="5" fill="#ffffff" />
    </svg>
  );
}

const SIGNIN_ERRORS = {
  denied: "Sign-in was cancelled.",
  state: "The sign-in link expired. Please try again.",
  token: "Google didn't complete the sign-in. Please try again.",
  not_allowed: "This Google account isn't on Bantay's allowed list.",
  no_refresh: "Google didn't grant ongoing access. Please try again.",
  scope: "Bantay needs permission to read your Gmail. Tick that box on Google's screen.",
};

function SignIn({ error }) {
  return (
    <main className="mx-auto w-full max-w-md min-h-[80vh] flex flex-col items-center justify-center text-center gap-5 py-10">
      <Logo size={88} />
      <div>
        <h1 className="text-3xl font-extrabold">Bantay</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
          Keeps watch over your bank alerts, deliveries, bills and credit card dues in Gmail.
        </p>
      </div>
      {error ? (
        <p role="alert" className="text-sm font-semibold rounded-xl px-4 py-2" style={{ background: "var(--warn-soft)", color: "var(--warn)" }}>
          {SIGNIN_ERRORS[error] || "Sign-in failed. Please try again."}
        </p>
      ) : null}
      <a href="/api/auth/login" className="rounded-xl px-5 py-3 font-bold text-sm" style={{ background: "var(--fg)", color: "var(--bg)" }}>
        Sign in with Google
      </a>
      <p className="text-[11px] max-w-xs" style={{ color: "var(--muted)" }}>
        Read-only access. Bantay never sends, deletes or changes your mail, and keeps no copy of it.
      </p>
    </main>
  );
}

// Fetches a JSON route, refreshes on an interval while the page is visible and when you come back to it.
function useApi(url, intervalMs, enabled) {
  const [state, setState] = React.useState({ data: null, err: null, at: 0 });
  const busy = React.useRef(false);
  const load = React.useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      const res = await fetch(url, { cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setState((s) => ({ ...s, err: { code: body.error || "server_error", message: body.message } }));
      } else {
        setState({ data: body, err: null, at: body.at || Date.now() });
      }
    } catch {
      setState((s) => ({ ...s, err: { code: navigator.onLine ? "gmail_error" : "offline" } }));
    } finally {
      busy.current = false;
    }
  }, [url]);
  React.useEffect(() => {
    if (!enabled) return;
    load();
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, intervalMs);
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); };
  }, [enabled, load, intervalMs]);
  return { ...state, refresh: load };
}

// "Mark paid" choices: saved to Upstash Redis when configured, otherwise in this browser.
// Bills and cards wait for these to load, so a paid month never flashes back after a refresh.
const readLocal = () => { try { return JSON.parse(localStorage.getItem("bantay-paid") || "{}") || {}; } catch { return {}; } };

function useMarks(enabled) {
  const [storage, setStorage] = React.useState(null); // null while loading | "redis" | "browser"
  const [marks, setMarks] = React.useState({});
  const [loadErr, setLoadErr] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [err, setErr] = React.useState("");
  const saving = React.useRef(false);

  const load = React.useCallback(async () => {
    if (saving.current) return;
    try {
      const res = await fetch("/api/marks", { cache: "no-store" });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.storage === "redis") { setStorage("redis"); setMarks(d.paid || {}); setLoadErr(false); }
      else if (res.ok && d.storage === "browser") { setStorage("browser"); setMarks(readLocal()); setLoadErr(false); }
      else setLoadErr(true); // keep what we had; never fall back to an empty list
    } catch {
      setLoadErr(true);
    }
  }, []);

  React.useEffect(() => {
    if (!enabled) return;
    load();
    // Pick up marks made on your other devices when you come back to Bantay, and retry after a failed load
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onVis);
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 120000);
    return () => { document.removeEventListener("visibilitychange", onVis); window.removeEventListener("focus", onVis); clearInterval(t); };
  }, [enabled, load]);

  React.useEffect(() => {
    if (!enabled || !loadErr) return;
    const t = setTimeout(load, 5000);
    return () => clearTimeout(t);
  }, [enabled, loadErr, load]);

  const save = async (keys, value) => {
    if (busy || !storage) return;
    setBusy(keys[0]); setErr(""); saving.current = true;
    try {
      if (storage === "redis") {
        const res = await fetch("/api/marks", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(value ? { set: keys } : { unset: keys }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.paid) throw new Error();
        setMarks(d.paid);
      } else {
        const next = readLocal(); // start from what's saved now, not from this screen's copy
        for (const k of keys) { if (value) next[k] = true; else delete next[k]; }
        localStorage.setItem("bantay-paid", JSON.stringify(next));
        setMarks(next);
      }
    } catch {
      setErr("Couldn't save. Check your connection and try again.");
    } finally {
      saving.current = false;
      setBusy(null);
    }
  };
  return { storage, marks, busy, err, loadErr, save };
}

// Adds a second, sturdier key for each mark: the bill's email thread.
// Then a mark still matches even if a bill's month is read differently on a later refresh.
function withThreadKeys(keys, subs, cards) {
  const out = new Set(keys);
  for (const k of keys) {
    const card = k.match(/^card:([^:]+):(\d{4}-\d{2})$/);
    if (card) {
      const c = (cards || []).find((x) => x.key === card[1]);
      const y = c && c.cycles.find((x) => x.month === card[2]);
      if (y && y.threadId) out.add(`t:${c.key}:${y.threadId}`);
      continue;
    }
    const bill = k.match(/^([a-z]+):(\d{4}-\d{2})$/);
    if (bill) {
      const s = (subs || []).find((x) => x.def.key === bill[1] && x.kind === "bills");
      const b = s && s.unpaid.concat(s.paid).find((x) => x.month === bill[2]);
      if (b && b.mail && b.mail.threadId) out.add(`t:${b.mail.threadId}`);
    }
  }
  return [...out];
}

export default function Bantay() {
  const [me, setMe] = React.useState(undefined);
  const [signinError, setSigninError] = React.useState(null);
  React.useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    if (p.get("error")) { setSigninError(p.get("error")); window.history.replaceState(null, "", "/"); }
    fetch("/api/me", { cache: "no-store" }).then((r) => r.json()).then(setMe).catch(() => setMe({ signedIn: false }));
  }, []);

  const on = !!(me && me.signedIn);
  let saved = "bank";
  try { saved = (typeof window !== "undefined" && localStorage.getItem("gs-tab")) || "bank"; } catch {}
  const [tab, setTab] = React.useState("bank");
  React.useEffect(() => { if (["bank", "ship", "sub"].includes(saved)) setTab(saved); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (t) => { setTab(t); try { localStorage.setItem("gs-tab", t); } catch {} };

  const feedW = useApi("/api/gmail/feed", 60000, on);
  const subW = useApi("/api/gmail/subs", 600000, on);
  const cardW = useApi("/api/gmail/cards", 600000, on);
  const recW = useApi("/api/gmail/recurring", 600000, on);
  const rec = useRecurring(recW.data, on);
  const { storage, marks, busy: markBusy, err: markErr, loadErr: marksLoadErr, save: saveMarks } = useMarks(on);
  const [busy, setBusy] = React.useState(false);
  const [now, setNow] = React.useState(Date.now());
  React.useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(t); }, []);

  const { feed, unreadSubs } = React.useMemo(
    () => (feedW.data ? buildFeed(feedW.data.payload) : { feed: null, unreadSubs: new Set() }),
    [feedW.data]
  );
  const subs = React.useMemo(
    () => (subW.data ? buildSubs(subW.data.payload, now, subW.data.details || {}, marks) : null),
    [subW.data, now, marks]
  );
  const cards = React.useMemo(
    () => (cardW.data ? buildCards(cardW.data.cardPayload, cardW.data.bmPayload, cardW.data.details || {}, marks, now) : null),
    [cardW.data, now, marks]
  );

  if (me === undefined) return <main className="mx-auto w-full max-w-md pt-6">{Skeleton(3)}</main>;
  if (!on) return <SignIn error={signinError} />;

  const refresh = async () => {
    if (busy) return;
    setBusy(true);
    await Promise.all([feedW.refresh(), subW.refresh(), cardW.refresh(), recW.refresh()]);
    setBusy(false); setNow(Date.now());
  };

  const banks = (feed || []).filter((m) => m.cat === "bank");
  const ships = (feed || []).filter((m) => m.cat === "ship");
  const recAlerts = (rec.sums || []).reduce((n, x) => n + x.alerts.length, 0);
  const cardAlerts = (cards || []).reduce((n, c) => n + c.unpaid.filter((y) => y !== c.latest || y.status === "unpaid").length, 0);
  const subAlerts = (subs || []).filter((s) => s.def.key !== "claude").reduce((n, s) => n + (s.kind === "bills" ? s.unpaid.filter((b) => b.overdue).length : (["check", "renews"].includes(s.status) ? 1 : 0)), 0) + cardAlerts + recAlerts;
  const synced = Math.max(feedW.at, subW.at, cardW.at, recW.at);
  const canMark = !!storage;
  const onMark = (keys, value) => saveMarks(withThreadKeys(keys, subs, cards), value);
  // Hold bills and cards back until your paid marks have loaded (or clearly failed)
  const marksReady = !!storage || marksLoadErr;
  const marksNote = !storage && marksLoadErr
    ? h("p", { className: "text-xs font-semibold px-1", style: { color: "var(--warn)" }, role: "alert" },
        "Couldn't load your paid marks, so paid months may show for now. Retrying…")
    : null;

  let body;
  if (tab === "sub") {
    body = h(React.Fragment, null,
      h("div", { className: "mb-5" },
        h(RecurringSection, { data: recW.data, err: recW.err, sums: rec.sums, onStatus: rec.onStatus, busy: rec.busy, saveErr: rec.err, now, Banner, Skeleton })),
      subW.err ? h(Banner, { err: subW.err }) : null,
      subs === null || !marksReady ? (subW.err ? null : Skeleton(3))
        : h("div", { className: "flex flex-col gap-3" },
            marksNote,
            markErr ? h("p", { className: "text-xs font-semibold px-1", style: { color: "var(--warn)" }, role: "alert" }, markErr) : null,
            h("h2", { className: "text-[11px] font-bold uppercase tracking-wider px-1", style: { color: "var(--muted)" } }, "Bills & subscriptions"),
            subs.filter((s) => s.def.key !== "claude").map((s) => s.kind === "renewal"
              ? h(RenewalCard, { key: s.def.key, s, unread: unreadSubs, now })
              : h(BillsCard, { key: s.def.key, s, unread: unreadSubs, now, canMark, onMark, busyKey: markBusy }))),
      h("h2", { className: "text-[11px] font-bold uppercase tracking-wider px-1 mt-4 mb-3", style: { color: "var(--muted)" } }, "Credit cards"),
      cardW.err ? h(Banner, { err: cardW.err }) : null,
      cards === null || !marksReady ? (cardW.err ? null : Skeleton(2))
        : cards.length
          ? h("div", { className: "flex flex-col gap-3" }, cards.map((c) => h(CreditCardBox, { key: c.key, c, unread: unreadSubs, canMark, onMark, busyKey: markBusy })))
          : h("p", { className: "text-xs px-1", style: { color: "var(--muted)" } }, "No credit card statements or payments found in the last 7 months."),
      h("p", { className: "text-[11px] mt-4 px-1", style: { color: "var(--muted)" } },
        (storage === "browser" ? "Mark paid choices are saved in this browser only. Add Upstash Redis on Vercel to sync them across devices. " : "") +
        "Next dates are estimated from how often each bill has arrived. Tap a month to open its email in Gmail."));
  } else {
    const list = tab === "bank" ? banks : ships;
    const tone = tab === "bank" ? "bank" : "ship";
    const urgent = list.filter((m) => URGENT.has(m.kind)).length;
    body = h(React.Fragment, null,
      feedW.err ? h(Banner, { err: feedW.err }) : null,
      feed === null ? (feedW.err ? null : Skeleton(4))
        : list.length
          ? h(React.Fragment, null,
              h("p", { className: "text-xs font-semibold px-1 mb-2", style: { color: "var(--muted)" } },
                urgent ? `${urgent} need${urgent === 1 ? "s" : ""} action now · ${list.length} unread` : `${list.length} unread`),
              h("section", { className: "rounded-2xl border overflow-hidden", style: { borderColor: "var(--line)" } }, list.map((m) => h(Row, { key: m.threadId, m, now }))))
          : h(Empty, {
              tone, icon: "CheckCheck",
              title: tab === "bank" ? "No unread bank alerts in the last 3 days" : "No unread order or delivery updates in the last 3 days",
              body: tab === "bank" ? "Transactions, transfers, security and payment-due alerts show here." : "Orders, shipping, delivery and customs updates show here.",
            }),
      h("p", { className: "text-[11px] mt-4 px-1 leading-relaxed", style: { color: "var(--muted)" } },
        "Unread, important mail from the last 3 days only (up to 15): no promotions, newsletters or statements. Read emails leave this feed automatically. Checks Gmail every minute and when you return to this page."));
  }

  return (
    <main className="mx-auto w-full max-w-md pb-8">
      <header className="sticky sticky-top z-20 pt-4 pb-3" style={{ background: "var(--bg)" }}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Logo />
            <div className="min-w-0">
              <h1 className="text-lg font-extrabold leading-tight">Bantay</h1>
              <p className="mono text-[11px] truncate" style={{ color: "var(--muted)" }}>
                {feed === null ? "Checking Gmail…" : `Important only · updated ${synced ? fmt(synced, { hour: "2-digit", minute: "2-digit" }) : "—"}`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={refresh} disabled={busy} aria-label="Refresh"
              className="w-9 h-9 rounded-xl grid place-items-center border disabled:opacity-40"
              style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--fg)" }}>
              <span className={busy ? "spin inline-flex" : "inline-flex"}><RefreshCw size={16} aria-hidden="true" /></span>
            </button>
            <form action="/api/auth/logout" method="post">
              <button type="submit" aria-label={`Sign out ${me.email || ""}`} title={me.email || "Sign out"}
                className="w-9 h-9 rounded-xl grid place-items-center border"
                style={{ borderColor: "var(--line)", background: "var(--card)", color: "var(--muted)" }}>
                <LogOut size={16} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>
        <div role="tablist" className="mt-3 flex gap-1 p-1 rounded-2xl border" style={{ background: "var(--card)", borderColor: "var(--line)" }}>
          {h(Tab, { active: tab === "bank", onClick: () => pick("bank"), label: "Banks", count: feed ? banks.length : null, icon: "Landmark", tone: "bank" })}
          {h(Tab, { active: tab === "ship", onClick: () => pick("ship"), label: "Logistics", count: feed ? ships.length : null, icon: "Truck", tone: "ship" })}
          {h(Tab, { active: tab === "sub", onClick: () => pick("sub"), label: "Subscriptions", count: subAlerts ? subAlerts : null, alert: true, icon: "Repeat", tone: "sub" })}
        </div>
      </header>
      {body}
    </main>
  );
}
