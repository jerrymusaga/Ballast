"use client";

import { useState } from "react";
import s from "./InvestorFlow.module.css";

interface View {
  party: string;
  joined: boolean;
  units: string | null;
  canSee: Array<{ plain: string; detail: string; kind: string }>;
  cannotSee: string[];
  nav: string | null;
  perUnit: string | null;
}

const post = async (body: object) =>
  (await fetch("/api/investor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })).json();

export default function InvestorFlow() {
  const [view, setView] = useState<View | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null);
  const [amount, setAmount] = useState("2");

  const refresh = async (party: string) => {
    const r = await fetch(`/api/investor?party=${encodeURIComponent(party)}`, { cache: "no-store" });
    setView(await r.json());
  };

  const arrive = async () => {
    setBusy("new"); setNote(null);
    const { party } = await post({ action: "new" });
    await refresh(party);
    setBusy(null);
  };

  const act = async (action: string, extra: object = {}) => {
    if (!view) return;
    setBusy(action); setNote(null);
    const r = await post({ action, party: view.party, ...extra });
    setNote({ ok: Boolean(r.ok), text: r.detail ?? "" });
    await refresh(view.party);
    setBusy(null);
  };

  const step = !view ? 0 : !view.joined ? 1 : !view.units ? 2 : 3;

  return (
    <div className={s.flow}>
      <ol className={s.rail}>
        {["Arrive", "Join the fund", "Put money in", "See what you can see"].map((label, i) => (
          <li key={label} className={`${s.step} ${i === step ? s.now : ""} ${i < step ? s.done : ""}`}>
            <span className={s.num}>{i < step ? "✓" : String(i + 1).padStart(2, "0")}</span>
            <span>{label}</span>
          </li>
        ))}
      </ol>

      <div className={s.stage}>
        {step === 0 && (
          <div className={s.panel}>
            <h3 className={s.h}>You have no relationship to this fund</h3>
            <p className="prose">
              Press the button and the ledger will allocate you a brand-new identity — a real
              Canton party, created just now. Then look at what it can see.
            </p>
            <button className={s.go} onClick={arrive} disabled={busy !== null}>
              {busy ? "allocating…" : "▸ ARRIVE AS A NEWCOMER"}
            </button>
          </div>
        )}

        {view && (
          <>
            <div className={s.who}>
              <span className={s.label}>YOU ARE</span>
              <code className={s.party}>{view.party.slice(0, 30)}…</code>
              {view.units && <span className={s.holding}>holding {view.units} units</span>}
            </div>

            {step === 1 && (
              <div className={s.panel}>
                <h3 className={s.h}>The ledger returns you nothing</h3>
                <p className="prose">
                  You asked it what you can see and the answer was an empty set — not a blank
                  screen we drew, an empty answer. You are not a stakeholder on anything this
                  fund has. That is what an outsider is.
                </p>
                <button className={s.go} onClick={() => act("join")} disabled={busy !== null}>
                  {busy === "join" ? "asking the manager…" : "▸ ASK TO JOIN THE FUND"}
                </button>
              </div>
            )}

            {step === 2 && (
              <div className={s.panel}>
                <h3 className={s.h}>You are in — and the strategy is still dark</h3>
                <p className="prose">
                  You can now see the fund and the rules it promised to keep. You cannot see the
                  target weights, and you never will. Put some money in and watch units appear
                  without that changing.
                </p>
                <div className={s.deposit}>
                  <label className={s.label} htmlFor="amt">DEPOSIT</label>
                  <input
                    id="amt" className={s.input} value={amount}
                    onChange={(e) => setAmount(e.target.value)} inputMode="decimal"
                  />
                  <span className={s.unit}>cBTC</span>
                  <button className={s.go} onClick={() => act("subscribe", { amount })} disabled={busy !== null}>
                    {busy === "subscribe" ? "depositing…" : "▸ SUBSCRIBE"}
                  </button>
                </div>
              </div>
            )}

            {note && (
              <div className={note.ok ? `${s.note} ${s.ok}` : `${s.note} ${s.bad}`}>
                <span className={s.noteTag}>{note.ok ? "✓" : "✕"}</span>
                <p className="prose">{note.text}</p>
              </div>
            )}

            <div className={s.split}>
              <div className={s.col}>
                <span className={s.label}>WHAT THE LEDGER GIVES YOU</span>
                {view.canSee.length === 0 ? (
                  <p className={s.empty}>Nothing at all.</p>
                ) : (
                  <ul className={s.list}>
                    {view.canSee.map((c, i) => (
                      <li key={i}>
                        <span className={s.itemName}>{c.plain}</span>
                        <span className={s.itemDetail}>{c.detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className={s.col}>
                <span className={`${s.label} ${s.labelWarn}`}>WHAT IT WILL NEVER GIVE YOU</span>
                <ul className={`${s.list} ${s.listDark}`}>
                  {view.cannotSee.map((c, i) => (
                    <li key={i}><span className={s.itemName}>{c}</span></li>
                  ))}
                </ul>
              </div>
            </div>

            {step === 3 && (
              <p className={`prose ${s.closing}`}>
                You hold {view.units} units of a fund whose strategy you have never seen, and you
                can still check every rebalance it makes against rules it published in advance.
                {!view.nav && " The fund's value is not in your list because it was last published before you joined — the next publication will include you."}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
