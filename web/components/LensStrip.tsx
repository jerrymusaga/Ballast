import type { Lens } from "@/lib/lenses";
import s from "./LensStrip.module.css";

/** The five lenses at a glance. Counts come from the ledger; this component only renders. */
export default function LensStrip({ lenses }: { lenses: Lens[] }) {
  return (
    <div className={s.strip}>
      {lenses.map((l) => {
        const blind = l.count === 0;
        const hasSecret = l.contracts.some((c) => c.secret);
        return (
          <article key={l.id} className={`${s.card} ${l.id === "investor" ? s.focus : ""}`}>
            <header className={s.head}>
              <h3 className={s.label}>{l.label}</h3>
              <span className={s.role}>{l.role}</span>
            </header>

            <div className={s.count}>
              <span className={`${s.n} ${blind ? s.zero : ""}`} style={{ fontFamily: "var(--font-mono)" }}>
                {l.party ? l.count : "—"}
              </span>
              <span className={s.unit}>
                {blind ? "sees nothing" : `contract${l.count === 1 ? "" : "s"}`}
              </span>
            </div>

            <ul className={s.kinds}>
              {l.contracts.map((c, i) => (
                <li key={i} className={c.secret ? s.secret : undefined}>
                  {c.kind}
                  {c.secret && <span className={s.tag}>private</span>}
                </li>
              ))}
              {blind && <li className={s.none}>the ledger returns an empty set</li>}
            </ul>

            {l.id === "investor" && !hasSecret && (
              <p className={s.callout}>No Mandate. The weights are not withheld by this page — they are not returned.</p>
            )}
          </article>
        );
      })}
    </div>
  );
}
