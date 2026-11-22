"use client";
// Recurring charges: one card per service with charge history, price changes,
// the next charge, and Keep / Cancel choices.
import React from "react";
import {
  Sparkles, TrendingUp, TrendingDown, Minus, ExternalLink, Receipt, CalendarClock,
  CircleCheck, CircleX, TriangleAlert, Clock, Repeat, ChevronDown, ChevronUp,
} from "lucide-react";
import { SERVICES, DAY, SCAN_DAYS, fmtMoney, summarize, mergeHistory, isValidStatus } from "@/lib/recurring";

const ICONS = { Sparkles };
const fmtDay = (ms) => new Date(ms).toLocaleDateString("en-GB", { timeZone: "Asia/Muscat", day: "numeric", month: "short", year: "numeric" });
const rel = (ms, now) => {
  const d = Math.round((ms - now) / DAY);
  if (d === 0) return "today";
  if (d === 1) return "tomorrow";
  if (d === -1) return "yesterday";
  return d > 0 ? `in ${d} days` : `${-d} days ago`;
};
const gmailLink = (id) => `https://mail.google.com/mail/u/0/#all/${id}`;
const soft = (tone) => ({ background: `var(--${tone}-soft)`, color: `var(--${tone})` });

function Label({ tone, children }) {
  return (
    <span className="shrink-0 text-[11px] font-bold uppercase tracking-wider rounded-md px-1.5 py-0.5"
      style={tone === "chip" ? { background: "var(--chip)", color: "var(--muted)" } : soft(tone)}>
      {children}
    </span>
  );
}

function Btn({ onClick, href, tone = "plain", disabled, children }) {
  const style = tone === "primary" ? { background: "var(--fg)", color: "var(--bg)", borderColor: "var(--fg)" }
    : tone === "ok" ? { ...soft("ok"), borderColor: "var(--ok)" }
    : tone === "warn" ? { ...soft("warn"), borderColor: "var(--warn)" }
    : { background: "var(--card)", color: "var(--fg)", borderColor: "var(--line)" };
  const cls = "inline-flex items-center justify-center gap-1.5 text-xs font-bold rounded-lg px-3 py-2 border disabled:opacity-40";
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" onClick={onClick} className={cls} style={style} aria-disabled={disabled}>
        {children}
      </a>
    );
  }
  return <button type="button" onClick={onClick} disabled={disabled} className={cls} style={style}>{children}</button>;
}

const STATE_LABEL = {
  null: { text: "Active", tone: "ok" },
  keep: { text: "Keeping", tone: "ok" },
  cancel_pending: { text: "Cancellation pending", tone: "warn" },
  cancelled: { text: "Cancelled", tone: "chip" },
};

export function RecurringCard({ sum, now, canSave, onStatus, busy }) {
  const { svc, paid, latest, change, next, state } = sum;
  const [showAll, setShowAll] = React.useState(false);
  const label = state ? STATE_LABEL[state] : latest ? STATE_LABEL.null : { text: "No recent charges", tone: "chip" };
  const Icon = ICONS[svc.icon] || Repeat;
  const list = showAll ? paid : paid.slice(0, 4);
  const set = (s) => onStatus(svc.key, s ? { state: s, at: Date.now() } : null);

  return (
    <article className="rounded-2xl border px-4 py-4" style={{ borderColor: "var(--line)", background: "var(--card)" }}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="shrink-0 w-10 h-10 rounded-xl grid place-items-center" style={soft("sub")}>
          <Icon size={18} aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-extrabold text-[15px] truncate">{svc.name}</h3>
          <p className="text-[11px] mono" style={{ color: "var(--muted)" }}>
            {svc.provider} · {svc.renewal === "auto" ? "renews automatically" : "manual renewal"}
          </p>
        </div>
        <Label tone={label.tone}>{label.text}</Label>
      </div>

      {/* Latest charge and price change */}
      {latest ? (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Last charge</p>
          <p className="mt-0.5 flex items-baseline gap-2 flex-wrap">
            <span className="mono text-xl font-semibold">{fmtMoney(latest.amount, latest.currency, latest.decimals)}</span>
            <span className="text-xs" style={{ color: "var(--muted)" }}>{fmtDay(latest.date)} · {rel(latest.date, now)}</span>
          </p>
          {change ? (
            <p className="mt-2 text-sm font-semibold flex items-start gap-1.5 rounded-lg px-2.5 py-2"
              style={change.dir === "up" ? soft("warn") : change.dir === "down" ? soft("ok") : { background: "var(--chip)", color: "var(--muted)" }}>
              <span className="mt-0.5 shrink-0">
                {change.dir === "up" ? <TrendingUp size={16} aria-hidden="true" /> : change.dir === "down" ? <TrendingDown size={16} aria-hidden="true" /> : <Minus size={16} aria-hidden="true" />}
              </span>
              <span className="min-w-0 break-words">{change.text}</span>
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 text-sm" style={{ color: "var(--muted)" }}>
          No {svc.name} receipts found in the last {SCAN_DAYS} days.
        </p>
      )}

      {/* Next charge */}
      {next ? (
        <div className="mt-3 flex items-start gap-2 text-sm">
          <CalendarClock size={16} className="mt-0.5 shrink-0" style={{ color: "var(--sub)" }} aria-hidden="true" />
          <p className="min-w-0">
            <span className="font-bold">{next.label}</span>
            <span className="mono">{" · "}{next.kind === "estimated" ? "~" : ""}{fmtDay(next.date)}</span>
            <span style={{ color: "var(--muted)" }}> ({rel(next.date, now)})</span>
            {next.amount != null ? <span className="mono"> · {fmtMoney(next.amount, next.currency, next.decimals)}</span> : null}
            {next.kind === "estimated" ? (
              <span className="block text-[11px]" style={{ color: "var(--muted)" }}>
                {next.late ? "This date has passed and no new receipt has arrived yet." : "Worked out from how often you've been charged."}
              </span>
            ) : next.threadId ? (
              <a href={gmailLink(next.threadId)} target="_blank" rel="noopener noreferrer" className="block text-[11px] underline" style={{ color: "var(--muted)" }}>
                From the renewal notice
              </a>
            ) : null}
          </p>
        </div>
      ) : null}

      {/* Warnings */}
      {sum.chargedAfterCancel ? (
        <Alert>
          Charged {fmtMoney(sum.chargedAfterCancel.amount, sum.chargedAfterCancel.currency, sum.chargedAfterCancel.decimals)} on {fmtDay(sum.chargedAfterCancel.date)}, after you cancelled. Check your billing settings.
        </Alert>
      ) : null}
      {sum.failed ? <Alert>A payment failed on {fmtDay(sum.failed.date)}. Update your payment method to keep the plan.</Alert> : null}

      {/* Decision */}
      <Decision sum={sum} now={now} canSave={canSave} busy={busy} set={set} />

      {/* Charge history */}
      {paid.length ? (
        <div className="mt-4">
          <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: "var(--muted)" }}>Charge history</p>
          <ul>
            {list.map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 border-b last:border-b-0" style={{ borderColor: "var(--line)" }}>
                <Receipt size={15} className="shrink-0" style={{ color: "var(--muted)" }} aria-hidden="true" />
                <span className="text-sm flex-1 min-w-0">
                  <span className="mono">{fmtDay(c.date)}</span>
                  {c.receiptNo ? <span className="block mono text-[11px] truncate" style={{ color: "var(--muted)" }}>#{c.receiptNo}</span> : null}
                </span>
                <span className="mono text-sm font-semibold shrink-0">{fmtMoney(c.amount, c.currency, c.decimals)}</span>
                {c.threadId ? (
                  <a href={gmailLink(c.threadId)} target="_blank" rel="noopener noreferrer" aria-label={`Open receipt from ${fmtDay(c.date)}`}
                    className="shrink-0 w-8 h-8 grid place-items-center rounded-lg border" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                    <ExternalLink size={14} aria-hidden="true" />
                  </a>
                ) : <span className="w-8 shrink-0" />}
              </li>
            ))}
          </ul>
          {paid.length > 4 ? (
            <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs font-bold flex items-center gap-1" style={{ color: "var(--muted)" }} aria-expanded={showAll}>
              {showAll ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
              {showAll ? "Show fewer" : `Show all ${paid.length} charges`}
            </button>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}

function Alert({ children }) {
  return (
    <p role="alert" className="mt-3 text-sm font-semibold flex items-start gap-1.5 rounded-lg px-2.5 py-2" style={soft("warn")}>
      <TriangleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

function Decision({ sum, now, canSave, busy, set }) {
  const { svc, state, next } = sum;
  const box = "mt-4 rounded-xl px-3 py-3 flex flex-col gap-2.5";
  const boxStyle = { background: "var(--bg)" };
  const row = "flex flex-wrap gap-2";
  const disabled = !canSave || busy;

  if (state === "keep") {
    return (
      <div className={box} style={boxStyle}>
        <p className="text-sm flex items-start gap-1.5">
          <CircleCheck size={16} className="mt-0.5 shrink-0" style={{ color: "var(--ok)" }} aria-hidden="true" />
          <span>
            You chose to keep this on {fmtDay(sum.statusAt)}.{" "}
            {svc.renewal === "auto" ? `${svc.provider} renews it automatically, so there's nothing else to do.` : "Renew it before it runs out."}
          </span>
        </p>
        <div className={row}>
          {svc.renewal === "manual" && svc.renewUrl ? <Btn href={svc.renewUrl} tone="primary">Renew now <ExternalLink size={12} aria-hidden="true" /></Btn> : null}
          <Btn href={svc.manageUrl} tone="warn" disabled={disabled} onClick={() => !disabled && set("cancel_pending")}>Cancel Subscription</Btn>
          <Btn onClick={() => set(null)} disabled={disabled}>Undo</Btn>
        </div>
      </div>
    );
  }

  if (state === "cancel_pending") {
    return (
      <div className={box} style={boxStyle}>
        <p className="text-sm flex items-start gap-1.5">
          <Clock size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} aria-hidden="true" />
          <span>
            Finish cancelling with {svc.provider}
            {next ? `, ideally before ${fmtDay(next.date)}` : ""}. {svc.cancelNote}
          </span>
        </p>
        <div className={row}>
          <Btn href={svc.manageUrl} tone="primary">{svc.manageLabel} <ExternalLink size={12} aria-hidden="true" /></Btn>
          <Btn href={svc.helpUrl}>{svc.helpLabel} <ExternalLink size={12} aria-hidden="true" /></Btn>
        </div>
        <div className={row}>
          <Btn onClick={() => set("cancelled")} tone="ok" disabled={disabled}><CircleCheck size={14} aria-hidden="true" /> Mark as Cancelled</Btn>
          <Btn onClick={() => set("keep")} disabled={disabled}>Keep instead</Btn>
        </div>
      </div>
    );
  }

  if (state === "cancelled") {
    return (
      <div className={box} style={boxStyle}>
        <p className="text-sm flex items-start gap-1.5">
          <CircleX size={16} className="mt-0.5 shrink-0" style={{ color: "var(--muted)" }} aria-hidden="true" />
          <span>
            Cancelled on {fmtDay(sum.cancelledAt)}
            {sum.confirmedByEmail ? ", confirmed by a cancellation email from " + svc.provider : ""}.
            {" "}Your charge history stays here.
          </span>
        </p>
        <div className={row}>
          {sum.confirmedByEmail && sum.cancelMail ? (
            <Btn href={gmailLink(sum.cancelMail.threadId)}>Open the email <ExternalLink size={12} aria-hidden="true" /></Btn>
          ) : null}
          <Btn onClick={() => set(null)} disabled={disabled}>Subscribed again? Track it</Btn>
        </div>
      </div>
    );
  }

  return (
    <div className={box} style={boxStyle}>
      <p className="text-sm font-semibold">
        {next ? `Decide before ${next.kind === "estimated" ? "about " : ""}${fmtDay(next.date)}.` : "What do you want to do with this subscription?"}
      </p>
      <div className={row}>
        <Btn onClick={() => set("keep")} tone="ok" disabled={disabled}><CircleCheck size={14} aria-hidden="true" /> Keep Subscription</Btn>
        <Btn href={svc.manageUrl} tone="warn" disabled={disabled} onClick={() => !disabled && set("cancel_pending")}>
          <CircleX size={14} aria-hidden="true" /> Cancel Subscription
        </Btn>
      </div>
      <p className="text-[11px]" style={{ color: "var(--muted)" }}>
        Cancel opens {svc.provider}'s billing settings in a new tab. Bantay can't cancel for you.
      </p>
    </div>
  );
}

/* ---------- Data: scan results, saved history and your choices ---------- */

const readLocal = (key, fallback) => {
  try { return JSON.parse(localStorage.getItem(key) || "null") ?? fallback; } catch { return fallback; }
};

// data: response from /api/gmail/recurring. Without Redis, history and choices are kept in this browser.
export function useRecurring(data, enabled) {
  const [status, setStatus] = React.useState(null); // {service: {state, at}}
  const [localCharges, setLocalCharges] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const storage = data ? data.storage : null;

  React.useEffect(() => {
    if (!enabled || !data) return;
    if (data.storage === "redis") {
      setStatus(data.status || {});
    } else {
      setStatus(readLocal("bantay-recurring", {}));
      // Browser mode: add newly found charges to the saved history
      const saved = readLocal("bantay-charges", {});
      const merged = {};
      for (const svc of SERVICES) {
        merged[svc.key] = mergeHistory(saved[svc.key] || [], (data.services[svc.key] || {}).charges || []);
      }
      try { localStorage.setItem("bantay-charges", JSON.stringify(merged)); } catch {}
      setLocalCharges(merged);
    }
  }, [data, enabled]);

  const onStatus = async (service, value) => {
    if (busy) return;
    if (value && !isValidStatus(value)) return;
    setBusy(true); setErr("");
    try {
      if (storage === "redis") {
        const res = await fetch("/api/recurring", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ service, status: value }),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok || !d.status) throw new Error();
        setStatus(d.status);
      } else {
        const next = { ...readLocal("bantay-recurring", {}) };
        if (value) next[service] = value; else delete next[service];
        localStorage.setItem("bantay-recurring", JSON.stringify(next));
        setStatus(next);
      }
    } catch {
      setErr("Couldn't save your choice. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  const sums = React.useMemo(() => {
    if (!data || status === null) return null;
    const now = Date.now();
    return SERVICES.map((svc) => {
      const ev = data.services[svc.key] || { charges: [] };
      const charges = storage === "redis" ? ev.charges : (localCharges ? localCharges[svc.key] : ev.charges);
      return summarize(svc, { ...ev, charges }, status[svc.key] || null, now);
    });
  }, [data, status, localCharges, storage]);

  return { sums, onStatus, busy, err, storage };
}

export function RecurringSection({ data, err, sums, onStatus, busy, saveErr, now, Banner, Skeleton }) {
  return (
    <section aria-labelledby="recurring-h" className="flex flex-col gap-3">
      <h2 id="recurring-h" className="text-[11px] font-bold uppercase tracking-wider px-1" style={{ color: "var(--muted)" }}>Recurring charges</h2>
      {err ? <Banner err={err} /> : null}
      {saveErr ? <p role="alert" className="text-xs font-semibold px-1" style={{ color: "var(--warn)" }}>{saveErr}</p> : null}
      {!sums ? (err ? null : Skeleton(1)) : sums.map((sum) => (
        <RecurringCard key={sum.svc.key} sum={sum} now={now} canSave={!!data} onStatus={onStatus} busy={busy} />
      ))}
      {data ? (
        <p className="text-[11px] px-1" style={{ color: "var(--muted)" }}>
          {data.storage === "redis" && data.firstImportAt
            ? `History saved since ${fmtDay(data.firstImportAt)}. The first check also imported the ${data.scanDays} days before that, and older charges stay here after their emails get old.`
            : `Charges from the last ${data.scanDays} days. History and choices are saved in this browser only. Add Upstash Redis on Vercel to keep them on every device.`}
        </p>
      ) : null}
    </section>
  );
}
