import Link from "next/link";
import DisclosureMatrix from "@/components/DisclosureMatrix";
import Panel from "@/components/Panel";
import { readLenses, type Lens } from "@/lib/lenses";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

const BINDS = [
  ["REAL ASSETS", "The vault holds genuine CIP-56 registry instruments. Ballast defines no asset of its own — the deployed package contains no token template at all."],
  ["LEDGER DECIDES", "Nine ways to deviate are refused: trading before the band breaks, under-trading, trades that are not self-financing, prices away from the oracle, breaching the cadence floor."],
  ["PROOF, NOT TRUST", "Each rebalance emits a record citing the mandate version it satisfied — and no weight, instrument or counterparty. The manager cannot forge one alone."],
  ["ATOMIC OR NOTHING", "Validation and settlement are one transaction. If the mandate refuses, the assets do not move. Not a warning. No state change at all."],
];

const LIMITS = [
  ["REGISTRY", "A CIP-56 registry co-signs the holdings it issues, so it sees the fund's position in that one instrument. Spread the basket and no single registry reconstructs it."],
  ["NAV INVERSION", "Each published NAV is one linear equation in the holdings. Enough observations and the portfolio solves. Breadth, cadence and rounding are the dials."],
  ["COUNTERPARTY", "You cannot trade without telling the other side. Real funds rotate dealers rather than pretend otherwise, and so does this one."],
  ["ORACLE", "Trusted, and not claimed otherwise. The narrower claim: the manager cannot mark its own book, pick the price set, or pick the moment."],
];

export default async function Home() {
  let lenses: Lens[] = [];
  let ledger = "";
  let offline = false;
  try {
    const d = await readLenses();
    lenses = d.lenses;
    ledger = d.ledger;
  } catch {
    offline = true;
  }

  const investor = lenses.find((l) => l.id === "investor");

  return (
    <main className={s.main}>
      <div className="wrap">

        {/* ── headline ─────────────────────────────────── */}
        <div className={s.masthead}>
          <div className={s.mastLeft}>
            <h1 className={s.h1}>THE REBALANCE THE MARKET CAN&rsquo;T SEE</h1>
            <p className={`prose ${s.lede}`}>
              Every index fund publishes its rules so investors can trust it. That publication is
              what lets traders predict the trade and get there first — and the fund&rsquo;s own
              investors pay for it, on every rebalance, forever.
            </p>
            <div className={s.cta}>
              <Link href="/lenses" className={s.btn}>▸ OPEN LENSES</Link>
              <Link href="/verify" className={s.btnGhost}>VERIFY</Link>
            </div>
          </div>
          <dl className={s.readout}>
            {[
              ["MANDATE", "PRIVATE", "amber"],
              ["ASSETS", "CIP-56", "cyan"],
              ["POLICY", "ON-LEDGER", "cyan"],
              ["DEVIATIONS", "REFUSED", "green"],
            ].map(([k, v, tone]) => (
              <div key={k} className={s.readRow}>
                <dt>{k}</dt>
                <dd className={s[tone as "amber" | "cyan" | "green"]}>{v}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* ── the trap ─────────────────────────────────── */}
        <Panel code="01" title="The trap every index fund is in">
          <div className={s.trap}>
            <div>
              <h3 className={s.trapH}>PUBLISH THE RULES</h3>
              <p className="prose">Investors can check you followed the strategy. So can everyone
                 else — and public rules plus public prices make the next trade arithmetic.</p>
            </div>
            <div className={s.trapMid}><span className={s.pill}>THE SAME ACT</span></div>
            <div>
              <h3 className={s.trapH}>HIDE THE PORTFOLIO</h3>
              <p className="prose">Nobody front-runs you. But nobody can tell whether you followed
                 the strategy either, so investors are back to taking your word for it.</p>
            </div>
          </div>
          <p className={`prose ${s.resolve}`}>
            Canton discloses per party, so the two come apart. The mandate lives in a contract the
            ledger reads and nobody else does — <b>the strategy stays private and still binds.</b>{" "}
            A rebalance that breaks it does not commit, so investors get proof without disclosure.
          </p>
        </Panel>

        {/* ── matrix ───────────────────────────────────── */}
        <Panel
          code="02"
          title="Disclosure matrix"
          right={<><span className={s.liveDot}>●</span> LIVE · {offline ? "NO LINK" : ledger.replace(/^https?:\/\//, "")}</>}
          flush
        >
          {offline ? (
            <p className={s.offline}>
              No ledger connected. The matrix is read from a live participant node — there is
              deliberately nothing to show without one.
            </p>
          ) : (
            <>
              <DisclosureMatrix lenses={lenses} />
              <p className={`prose ${s.matrixNote}`}>
                Each column is a separate active-contract-set query submitted as that party. The
                <b> MANDATE</b> row is the argument: filled for the two parties that run the fund,
                empty for the investors whose money it is — and empty because the ledger does not
                return it, not because this page withholds it.
                {investor && ` The investor sees ${investor.count} contracts and the strategy is not among them.`}
              </p>
            </>
          )}
        </Panel>

        {/* ── binds / limits ───────────────────────────── */}
        <div className={s.pair}>
          <Panel code="03" title="Why it binds" flush>
            <ul className={s.rows}>
              {BINDS.map(([k, d]) => (
                <li key={k} className={s.row}>
                  <span className={s.rowKey}>{k}</span>
                  <span className={`prose ${s.rowVal}`}>{d}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel code="04" title="What it does not hide" flush>
            <ul className={s.rows}>
              {LIMITS.map(([k, d]) => (
                <li key={k} className={s.row}>
                  <span className={`${s.rowKey} ${s.rowKeyWarn}`}>{k}</span>
                  <span className={`prose ${s.rowVal}`}>{d}</span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>

        <footer className={s.foot}>
          <span>BALLAST · PRIVATE INDEX FUND ON CANTON</span>
          <a href="https://github.com/jerrymusaga/Ballast" target="_blank" rel="noreferrer">SOURCE ↗</a>
          <Link href="/verify">VERIFY</Link>
        </footer>
      </div>
    </main>
  );
}
