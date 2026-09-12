"use client";

import { useEffect, useState } from "react";
import s from "./RebalanceConsole.module.css";

interface FundState {
  ready: boolean;
  reason?: string;
  fundId: string;
  nav: string;
  perUnit: string | null;
  unitsInIssue: string | null;
  holdings: Array<{ instrument: string; quantity: string; price: string; value: string; weight: string }>;
  driftPct: string;
  bandPct: string;
  breached: boolean;
  verdict: string;
  legs: Array<{ instrument: string; delta: string; execPrice: string; side: "BUY" | "SELL" }>;
  proofs: number;
}

export interface FundStateView extends FundState {}

interface Result {
  ok: boolean;
  title: string;
  detail: string;
  ledgerError?: string;
}

const MOVES = [
  { mode: "honest", label: "Obey the rules", hint: "Trade exactly what the strategy requires.", tone: "good" as const },
  { mode: "skim", label: "Skim the proceeds", hint: "Sell as required; buy back a tenth less.", tone: "bad" as const },
  { mode: "timid", label: "Under-trade", hint: "A fifth of what is required.", tone: "bad" as const },
];

export default function RebalanceConsole({ initial }: { initial: FundState | null }) {
  const [fund, setFund] = useState<FundState | null>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<(Result & { mode: string }) | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/fund", { cache: "no-store" });
      setFund(await r.json());
    } catch {
      setFund({ ready: false, reason: "could not reach the ledger" } as FundState);
    }
  };

  // Server-rendered on first paint, then kept current. Without the initial value the page
  // opens on a spinner, which is a poor first impression for a screen whose whole job is to
  // show that something real is already running.
  useEffect(() => { if (!initial) load(); }, [initial]);

  const run = async (mode: string) => {
    setBusy(mode);
    setResult(null);
    try {
      const r = await fetch("/api/actions/rebalance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      setResult({ ...(await r.json()), mode });
      await load();
    } catch (e) {
      setResult({ mode, ok: false, title: "Request failed", detail: String(e) });
    } finally {
      setBusy(null);
    }
  };

  if (!fund) return <div className={s.loading}>reading the fund…</div>;
  if (!fund.ready) {
    return (
      <div className={s.loading}>
        No fund on this ledger. {fund.reason}
      </div>
    );
  }

  return (
    <div className={s.console}>
      {/* what the fund looks like right now */}
      <div className={s.book}>
        <div className={s.bookHead}>
          <span className={s.label}>THE FUND HOLDS</span>
          <span className={s.worth}>worth {fund.nav} · {fund.perUnit} per unit</span>
        </div>
        <table className={s.holdings}>
          <tbody>
            {fund.holdings.map((h) => (
              <tr key={h.instrument}>
                <td className={s.inst}>{h.instrument}</td>
                <td className={s.qty}>{h.quantity}</td>
                <td className={s.px}>@ {h.price}</td>
                <td className={s.val}>{h.value}</td>
                <td className={s.wt}>{h.weight}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* why a trade is due */}
      <div className={fund.breached ? `${s.drift} ${s.driftOn}` : s.drift}>
        <span className={s.label}>{fund.breached ? "A REBALANCE IS DUE" : "NO REBALANCE DUE"}</span>
        <p className="prose">
          Drifted <b>{fund.driftPct}</b> against a <b>{fund.bandPct}</b> limit.{" "}
          {fund.breached
            ? "It must trade — without ever revealing what it is trading towards."
            : "Nothing may trade until it drifts past the limit."}
        </p>
        {fund.breached && fund.legs.length > 0 && (
          <div className={s.legs}>
            {fund.legs.map((l) => (
              <span key={l.instrument} className={s.leg}>
                <span className={l.side === "SELL" ? s.sell : s.buy}>{l.side}</span>
                {l.delta} {l.instrument}
              </span>
            ))}
            <span className={s.legNote}>computed from the book above, not stored anywhere</span>
          </div>
        )}
      </div>

      {/* act */}
      <div className={s.moves}>
        <span className={s.label}>PROPOSE A TRADE</span>
        <div className={s.buttons}>
          {MOVES.map((m) => (
            <button
              key={m.mode}
              className={`${s.move} ${m.tone === "bad" ? s.moveBad : s.moveGood}`}
              onClick={() => run(m.mode)}
              disabled={busy !== null || !fund.breached}
            >
              <span className={s.moveLabel}>
                {busy === m.mode ? "submitting…" : m.label}
              </span>
              <span className={s.moveHint}>{m.hint}</span>
            </button>
          ))}
        </div>
      </div>

      {/* what the ledger said */}
      {result && (
        <div className={result.ok ? `${s.result} ${s.ok}` : `${s.result} ${s.no}`} role="status">
          <span className={s.resultTag}>{result.ok ? "✓ COMMITTED" : "✕ REFUSED"}</span>
          <div>
            <h4 className={s.resultTitle}>{result.title}</h4>
            <p className="prose">{result.detail}</p>
            {result.ledgerError && (
              <pre className={s.ledgerSaid}>the ledger said: {result.ledgerError}</pre>
            )}
          </div>
        </div>
      )}

      <p className={`prose ${s.foot}`}>
        {fund.proofs > 0
          ? `${fund.proofs} proof${fund.proofs === 1 ? "" : "s"} on this ledger — visible to investors, and none contains a weight.`
          : "No rebalance accepted yet."}
      </p>
    </div>
  );
}
