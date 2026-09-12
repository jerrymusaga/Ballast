import type { Lens } from "@/lib/lenses";
import s from "./DisclosureMatrix.module.css";

/**
 * Who can see what.
 *
 * Rows are things that exist on the ledger, named the way someone who has never read the code
 * would name them. Columns are the people involved. A filled cell means the ledger returned
 * that thing to that person when asked.
 *
 * The top row is the argument, which is why it is the top row.
 */
export default function DisclosureMatrix({ lenses }: { lenses: Lens[] }) {
  const rows = new Map<string, { plain: string; what: string; secret: boolean; rank: number }>();
  for (const l of lenses) {
    for (const c of l.contracts) {
      if (!rows.has(c.kind)) {
        rows.set(c.kind, { plain: c.plain, what: c.what, secret: Boolean(c.secret), rank: c.rank });
      }
    }
  }
  const ordered = [...rows.entries()].sort((a, b) => a[1].rank - b[1].rank);

  if (ordered.length === 0) {
    return <p className={s.none}>Nothing on this ledger yet — the fund has not been formed.</p>;
  }

  const sees = (kind: string, lens: Lens) => lens.contracts.filter((c) => c.kind === kind);

  return (
    <div className={s.scroll}>
      <table className={s.grid}>
        <thead>
          <tr>
            <th className={s.corner}>WHAT EXISTS ON THE LEDGER</th>
            {lenses.map((l) => (
              <th key={l.id} className={l.id === "investor" ? `${s.col} ${s.colFocus}` : s.col}>
                <span className={s.colName}>{l.label.toUpperCase()}</span>
                <span className={s.colRole}>{l.role.toLowerCase()}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ordered.map(([kind, row]) => (
            <tr key={kind} className={row.secret ? s.secretRow : undefined}>
              <th className={s.rowHead}>
                <span className={s.plain}>
                  {row.plain}
                  {row.secret && <span className={s.priv}>PRIVATE</span>}
                </span>
                <span className={s.what}>{row.what}</span>
                <span className={s.tech}>{kind}</span>
              </th>
              {lenses.map((l) => {
                const hits = sees(kind, l);
                const focus = l.id === "investor";
                return (
                  <td key={l.id} className={focus ? `${s.cell} ${s.cellFocus}` : s.cell}>
                    {hits.length > 0 ? (
                      <>
                        <span className={row.secret ? s.dotSecret : s.dot}>●</span>
                        <span className={s.value}>{hits.map((h) => h.headline).join(" · ")}</span>
                      </>
                    ) : (
                      <>
                        <span className={s.blank}>·</span>
                        <span className={s.valueNone}>not returned</span>
                      </>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr className={s.totals}>
            <th className={s.rowHead}><span className={s.plain}>Total each party can see</span></th>
            {lenses.map((l) => (
              <td key={l.id} className={l.id === "investor" ? `${s.cell} ${s.cellFocus}` : s.cell}>
                <span className={l.count === 0 ? s.zero : s.total}>{l.party ? l.count : "—"}</span>
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
