import s from "./loading.module.css";

/**
 * Shown while the server reads every party's active contract set.
 *
 * This is a real loading state, not a staged delay — Next renders it for exactly as long as
 * those queries take. The lines are the work actually being done, in order, so a slow ledger
 * tells you where it is rather than leaving you watching a spinner.
 */
const LINES = [
  "establishing link to participant node",
  "reading ledger version",
  "enumerating allocated parties",
  "querying active contract set · manager",
  "querying active contract set · vault",
  "querying active contract set · investor",
  "querying active contract set · counterparty",
  "querying active contract set · market",
  "assembling disclosure matrix",
];

export default function Loading() {
  return (
    <main className={s.boot}>
      <div className={s.inner}>
        <p className={s.title}>BALLAST TERMINAL</p>
        <ul className={s.lines}>
          {LINES.map((l, i) => (
            <li key={l} className={s.line} style={{ animationDelay: `${i * 90}ms` }}>
              <span className={s.tick}>▸</span>
              <span>{l}</span>
              <span className={s.dots} />
            </li>
          ))}
        </ul>
        <p className={s.foot}>
          <span className={s.cursor}>█</span> awaiting ledger
        </p>
      </div>
    </main>
  );
}
