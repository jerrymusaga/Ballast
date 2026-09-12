import Link from "next/link";
import s from "./page.module.css";

// Deliberately static. The front door should open instantly and never depend on a ledger
// being up — live state is the terminal's job, and a landing page that hangs because a
// participant node is down is a landing page that fails at the worst moment.

const PROOF = [
  ["REAL REGISTRY ASSETS", "The vault holds genuine CIP-56 instruments. Ballast defines no asset of its own — the deployed package contains no token template at all."],
  ["THE LEDGER DECIDES", "Nine ways to deviate are refused outright. If the mandate says no, the transaction does not commit and the assets do not move."],
  ["PROOF WITHOUT DISCLOSURE", "Each rebalance emits a record citing the mandate version it satisfied — and no weight, no instrument, no counterparty."],
];

const LIMITS = [
  ["REGISTRY", "A CIP-56 registry co-signs the holdings it issues, so it sees the fund's position in that one instrument. Spread the basket and no single registry reconstructs it."],
  ["NAV INVERSION", "Each published NAV is one linear equation in the holdings. Enough observations and the portfolio solves. Breadth, cadence and rounding are the dials."],
  ["COUNTERPARTY", "You cannot trade without telling the other side. Real funds rotate dealers rather than pretend otherwise, and so does this one."],
  ["ORACLE", "Trusted, and not claimed otherwise. The narrower claim: the manager cannot mark its own book, pick the price set, or pick the moment."],
];

export default function Home() {
  return (
    <main>
      <section className={s.hero}>
        <div className="wrap">
          <p className={s.eyebrow}>PRIVATE INDEX FUND · CANTON NETWORK</p>
          <h1 className={s.h1}>
            The rebalance the market<br />can&rsquo;t see coming.
          </h1>
          <p className={`prose ${s.lede}`}>
            Every index fund publishes its rules so investors can trust it. That publication is
            exactly what lets traders predict the trade and get there first — and the fund&rsquo;s
            own investors pay for it, on every rebalance, forever.
          </p>
          <div className={s.cta}>
            <Link href="/terminal" className={s.launch}>
              <span className={s.launchIcon}>▸</span>
              LAUNCH TERMINAL
            </Link>
            <Link href="/invest" className={s.secondary}>JOIN AS AN INVESTOR</Link>
          </div>
          <p className={s.hint}>Live disclosure matrix, read from a running Canton participant.</p>
        </div>
      </section>

      <section className={s.trapSec}>
        <div className="wrap">
          <div className={s.trap}>
            <div className={s.trapSide}>
              <span className={s.trapTag}>OPTION A</span>
              <h2>Publish the rules</h2>
              <p className="prose">Investors can check you followed the strategy. So can everyone
                 else — and public rules plus public prices make the next trade arithmetic.</p>
            </div>
            <div className={s.trapPivot}><span className={s.pill}>THE SAME ACT</span></div>
            <div className={s.trapSide}>
              <span className={s.trapTag}>OPTION B</span>
              <h2>Hide the portfolio</h2>
              <p className="prose">Nobody front-runs you. But nobody can tell whether you followed
                 the strategy either, so investors are back to taking your word for it.</p>
            </div>
          </div>
          <p className={`prose ${s.resolve}`}>
            Canton discloses per party, so the two come apart. The mandate lives in a contract the
            ledger reads and nobody else does — <b>the strategy stays private and still binds.</b>{" "}
            A rebalance that breaks it does not commit, so investors get proof without disclosure.
          </p>
        </div>
      </section>

      <section className={s.sec}>
        <div className="wrap">
          <h2 className={s.h2}>Opacity is old. Opacity you don&rsquo;t have to trust is the product.</h2>
          <p className={`prose ${s.sub}`}>
            Semi-transparent ETFs have hidden portfolios for years. What they cannot do is prove
            the strategy was followed without showing you the strategy.
          </p>
          <div className={s.proof}>
            {PROOF.map(([k, d]) => (
              <article key={k} className={s.proofCard}>
                <span className={s.proofK}>{k}</span>
                <p className="prose">{d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={s.sec}>
        <div className="wrap">
          <h2 className={s.h2}>What it does not hide</h2>
          <p className={`prose ${s.sub}`}>
            A privacy claim is worth exactly what its threat model is worth. The guarantee is
            against traders who would front-run the rebalance — not against everyone.
          </p>
          <ul className={s.limits}>
            {LIMITS.map(([k, d], i) => (
              <li key={k} className={s.limit}>
                <span className={s.limitN}>{String(i + 1).padStart(2, "0")}</span>
                <span className={s.limitK}>{k}</span>
                <p className="prose">{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className={s.closer}>
        <div className="wrap">
          <h2 className={s.closerH}>See it for yourself.</h2>
          <p className={`prose ${s.closerP}`}>
            Five parties, one ledger, five different answers. Nothing on the next screen is
            filtered by us — every column is Canton answering a query for that party.
          </p>
          <Link href="/terminal" className={s.launch}>
            <span className={s.launchIcon}>▸</span>
            LAUNCH TERMINAL
          </Link>
        </div>
      </section>

      <footer className={s.foot}>
        <div className={`wrap ${s.footRow}`}>
          <span>BALLAST · PRIVATE INDEX FUND ON CANTON</span>
          <a href="https://github.com/jerrymusaga/Ballast" target="_blank" rel="noreferrer">SOURCE ↗</a>
          <Link href="/verify">VERIFY</Link>
        </div>
      </footer>
    </main>
  );
}
