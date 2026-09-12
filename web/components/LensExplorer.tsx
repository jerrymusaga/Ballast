"use client";

import { useEffect, useState } from "react";
import Panel from "@/components/Panel";
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
            <span className={s.tabLabel}>{l.label.toUpperCase()}</span>
            <span className={`${s.tabCount} ${l.count === 0 ? s.zero : ""}`}>
              {l.party ? l.count : "—"}
            </span>
            <span className={s.tabRole}>{l.count === 0 ? "sees nothing" : l.role.toLowerCase()}</span>
          </button>
        ))}
      </div>

      {active && (
        <Panel
          code={String(lenses.findIndex((l) => l.id === active.id) + 1).padStart(2, "0")}
          title={`${active.label} — active contract set`}
          right={<>{active.count} VISIBLE</>}
          flush
        >
          <header className={s.head}>
            <p className={`prose ${s.blurb}`}>{active.blurb}</p>
            <div className={s.meta}>
              <span className={s.metaLabel}>PARTY</span>
              <code className={s.party}>{active.party ? shortParty(active.party) : "not allocated"}</code>
            </div>
          </header>

          {active.contracts.length === 0 ? (
            <div className={s.empty}>
              <h3>{active.party ? "Sees nothing" : "Not on this ledger"}</h3>
              <p>
                {active.party
                  ? "This party has no relationship to the fund, so when the ledger is asked what they can see, it returns nothing at all. That is the answer, not a missing feature — and it is the same answer anyone outside the fund gets."
                  : "This party has not been allocated. Run provisioning against the ledger first."}
              </p>
            </div>
          ) : (
            <table className={s.table}>
              <thead>
                <tr><th>WHAT THEY CAN SEE</th><th>VALUE</th><th className={s.right}>DETAIL</th></tr>
              </thead>
              <tbody>
                {active.contracts.map((c, i) => (
                  <tr key={i} className={c.secret ? s.secretRow : undefined}>
                    <td className={s.kind}>
                      <span className={s.plain}>
                        {c.plain}
                        {c.secret && <span className={s.tag}>private</span>}
                      </span>
                      <span className={s.tech}>{c.kind}</span>
                    </td>
                    <td className={s.headline}>{c.headline}</td>
                    <td className={`${s.detail} ${s.right}`}>{c.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {active.id === "investor" && (
            <p className={`prose ${s.verdict}`}>
              <b>The strategy is not in this list.</b> This investor can see what the fund is
              worth, how many units they hold, and the rules the fund promised to stay inside —
              everything needed to hold it to account. What they cannot see is the one thing
              that would let them, or anyone they told, trade ahead of it.
            </p>
          )}
        </Panel>
      )}

      {stale && <p className={s.stale}>Lost contact with the ledger — showing the last answer it gave.</p>}
    </div>
  );
}
