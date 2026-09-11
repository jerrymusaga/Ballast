import type { Lens } from "@/lib/lenses";
import s from "./DisclosureMatrix.module.css";

/**
 * Who can see what, as a grid.
 *
 * Rows are contract types, columns are parties, and a filled cell means the ledger returned
 * that contract to that party. The Mandate row is the argument: filled under the two parties
 * that run the fund, empty under everyone else, including the investors whose money it is.
 */
export default function DisclosureMatrix({ lenses }: { lenses: Lens[] }) {
  const kinds: string[] = [];
  for (const l of lenses) {
    for (const c of l.contracts) if (!kinds.includes(c.kind)) kinds.push(c.kind);
  }
  kinds.sort((a, b) => (a === "Mandate" ? -1 : b === "Mandate" ? 1 : a.localeCompare(b)));

  const seenBy = (kind: string, lens: Lens) => lens.contracts.filter((c) => c.kind === kind);

  if (kinds.length === 0) {
    return <p className={s.none}>No contracts on this ledger yet — run formation first.</p>;
  }

  return (
    <div className={s.scroll}>
      <table className={s.grid}>
        <thead>
          <tr>
            <th className={s.corner}>CONTRACT</th>
            {lenses.map((l) => (
              <th key={l.id} className={l.id === "investor" ? `${s.col} ${s.colFocus}` : s.col}>
                <span className={s.colName}>{l.label.toUpperCase()}</span>
                <span className={s.colRole}>{l.role}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {kinds.map((kind) => {
            const secret = lenses.some((l) => seenBy(kind, l).some((c) => c.secret));
            return (
              <tr key={kind} className={secret ? s.secretRow : undefined}>
                <th className={s.rowHead}>
                  {kind}
                  {secret && <span className={s.priv}>PRIVATE</span>}
                </th>
                {lenses.map((l) => {
                  const hits = seenBy(kind, l);
                  return (
                    <td key={l.id} className={l.id === "investor" ? `${s.cell} ${s.cellFocus}` : s.cell}>
                      {hits.length > 0 ? (
                        <span className={secret ? s.dotSecret : s.dot} title={hits[0]?.headline}>●</span>
                      ) : (
                        <span className={s.blank}>·</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
          <tr className={s.totals}>
            <th className={s.rowHead}>VISIBLE</th>
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
