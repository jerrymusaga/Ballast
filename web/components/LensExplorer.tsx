"use client";

import { useEffect, useState } from "react";
import type { Lens } from "@/lib/lenses";
import s from "./LensExplorer.module.css";

const shortParty = (p: string) => (p.length > 36 ? `${p.slice(0, 24)}…${p.slice(-6)}` : p);

export default function LensExplorer({ initial }: { initial: Lens[] }) {
  const [lenses, setLenses] = useState<Lens[]>(initial);
  const [selected, setSelected] = useState<string>("investor");
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let alive = true;
    const poll = async () => {
      try {
        const r = await fetch("/api/lenses", { cache: "no-store" });
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (alive && Array.isArray(d.lenses)) { setLenses(d.lenses); setStale(false); }
      } catch {
        if (alive) setStale(true);
      }
    };
    const t = setInterval(poll, 6000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const active = lenses.find((l) => l.id === selected) ?? lenses[0];

  return (
    <div className={s.explorer}>
      <div className={s.tabs} role="tablist" aria-label="Parties">
        {lenses.map((l) => (
          <button
            key={l.id}
            role="tab"
            aria-selected={l.id === selected}
            className={`${s.tab} ${l.id === selected ? s.on : ""}`}
            onClick={() => setSelected(l.id)}
          >
            <span className={s.tabLabel}>{l.label}</span>
            <span className={`${s.tabCount} ${l.count === 0 ? s.zero : ""}`} style={{ fontFamily: "var(--font-mono)" }}>
              {l.party ? l.count : "—"}
            </span>
          </button>
        ))}
      </div>

      {active && (
        <section className={s.panel} aria-live="polite">
          <header className={s.head}>
            <div>
              <h2 className={s.title}>{active.label}</h2>
              <p className={s.blurb}>{active.blurb}</p>
            </div>
            <div className={s.meta}>
              <span className={s.metaLabel}>party</span>
              <code className={s.party} style={{ fontFamily: "var(--font-mono)" }}>
                {active.party ? shortParty(active.party) : "not allocated"}
              </code>
            </div>
          </header>

          {active.contracts.length === 0 ? (
            <div className={s.empty}>
              <h3>{active.party ? "Sees nothing" : "Not on this ledger"}</h3>
              <p>
                {active.party
                  ? "Not a stakeholder on any contract in this fund, so the active-contract-set query comes back empty. Nothing is being hidden by this page — there is nothing to return."
                  : "This party has not been allocated. Run provisioning against the ledger first."}
              </p>
            </div>
          ) : (
            <table className={s.table}>
              <thead>
                <tr><th>Contract</th><th>Value</th><th className={s.right}>Detail</th></tr>
              </thead>
              <tbody>
                {active.contracts.map((c, i) => (
                  <tr key={i} className={c.secret ? s.secretRow : undefined}>
                    <td className={s.kind} style={{ fontFamily: "var(--font-mono)" }}>
                      {c.kind}
                      {c.secret && <span className={s.tag}>private</span>}
                    </td>
                    <td className={s.headline}>{c.headline}</td>
                    <td className={`${s.detail} ${s.right}`} style={{ fontFamily: "var(--font-mono)" }}>{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {active.id === "investor" && (
            <p className={s.verdict}>
              The <b>Mandate</b> is missing from this table, and that is the product. The investor
              holds units, receives the NAV and can prove every rebalance obeyed the strategy —
              without the ledger ever returning the strategy itself.
            </p>
          )}
        </section>
      )}

      {stale && <p className={s.stale}>Lost contact with the ledger — showing the last answer it gave.</p>}
    </div>
  );
}
