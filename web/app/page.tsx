import Link from "next/link";
import LensStrip from "@/components/LensStrip";
import { readLenses, type Lens } from "@/lib/lenses";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

const BINDS = [
  { t: "Real registry assets", d: "The vault holds genuine CIP-56 instruments. Ballast defines no asset of its own — the deployed package contains no token template at all, which is checkable in one command." },
  { t: "The ledger decides", d: "Nine ways to deviate are refused outright: trading before the band is breached, under-trading, trades that are not self-financing, execution prices away from the oracle, breaching the cadence floor." },
  { t: "Proof without disclosure", d: "Every rebalance emits a record citing the mandate version it satisfied — and no weight, no instrument, no counterparty. The manager cannot forge one alone." },
  { t: "Settlement it cannot fake", d: "Validation and settlement are one transaction. If the mandate refuses, the assets do not move — not a warning, not a log line, no state change at all." },
];

const LIMITS = [
  { t: "The registry sees its own instrument", d: "A CIP-56 registry co-signs the holdings it issues, so it sees the fund's position in that one asset. Spread the basket across registries and no single one can reconstruct it." },
  { t: "Published NAV inverts, slowly", d: "Each NAV is one linear equation in the holdings. Enough observations between rebalances and the portfolio solves. Breadth, cadence and rounding are the dials — it is managed, not eliminated." },
  { t: "The counterparty knows the trade", d: "You cannot trade without telling whoever is on the other side. Real funds rotate dealers rather than pretend otherwise, and so does this one." },
  { t: "The oracle is trusted", d: "Ballast does not claim otherwise. The narrower claim is that the manager cannot mark its own book, cannot pick the price set, and cannot pick the moment." },
];

export default async function Home() {
  let lenses: Lens[] = [];
  let offline = false;
  try {
    lenses = (await readLenses()).lenses;
  } catch {
    offline = true;
  }

  return (
    <main>
      {/* ── hero ───────────────────────────────────────────── */}
      <section className={s.hero}>
        <div className="wrap">
          <p className="eyebrow">Private index fund · Canton Network</p>
          <h1 className={s.h1}>
            The rebalance the<br />market can&rsquo;t see coming.
          </h1>
          <p className={s.lede}>
            Every index fund publishes its rules so investors can trust it. That publication is
            exactly what lets traders predict the trade and get there first — and the fund&rsquo;s own
            investors pay for it, on every rebalance, forever.
          </p>
          <div className={s.cta}>
            <Link href="/lenses" className={`${s.btn} ${s.primary}`}>
              See what each party sees
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden>
                <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
            <Link href="/verify" className={`${s.btn} ${s.ghost}`}>Verify it yourself</Link>
          </div>
        </div>
      </section>

      {/* ── the trap ───────────────────────────────────────── */}
      <section className={s.trap}>
        <div className="wrap">
          <div className={s.trapGrid}>
            <div className={s.trapSide}>
              <h3>Publish the rules</h3>
              <p>Investors can check you followed the strategy. So can everyone else — and public
                 rules plus public prices make the next trade arithmetic.</p>
            </div>
            <div className={s.pill}>the same act</div>
            <div className={s.trapSide}>
              <h3>Hide the portfolio</h3>
              <p>Nobody front-runs you. But nobody can tell whether you followed the strategy
                 either, so investors are back to taking your word for it.</p>
            </div>
          </div>
          <p className={s.resolve}>
            Canton discloses per party, so the two come apart. The mandate lives in a contract the
            ledger reads and nobody else does — <b>the strategy stays private and still binds.</b>{" "}
            A rebalance that breaks it does not commit, so investors get proof without disclosure.
          </p>
        </div>
      </section>

      {/* ── live lenses ────────────────────────────────────── */}
      <section className={s.section}>
        <div className="wrap">
          <div className={s.head}>
            <p className="eyebrow">Live from the ledger</p>
            <h2 className={s.h2}>One ledger, five different realities</h2>
            <p className={s.sub}>
              Each count is a separate active-contract-set query submitted as a different party.
              This page has no filter to apply — what you see is what Canton returned.
            </p>
          </div>

          {offline ? (
            <div className={s.offline}>
              <h3>No ledger connected</h3>
              <p>The lenses are read from a live participant node. Start one and reload — there is
                 deliberately nothing to show without it.</p>
            </div>
          ) : (
            <LensStrip lenses={lenses} />
          )}

          <div className={s.note}>
            <b>Read the investor column.</b> They hold units, receive the NAV, and can prove every
            rebalance obeyed the mandate — while the contract holding the target weights is simply
            absent from what the ledger will return them. That absence is the entire product.
          </div>
        </div>
      </section>

      {/* ── what binds ─────────────────────────────────────── */}
      <section className={s.section}>
        <div className="wrap">
          <div className={s.head}>
            <p className="eyebrow">Why it holds</p>
            <h2 className={s.h2}>Opacity is old. Opacity you don&rsquo;t have to trust is the product.</h2>
            <p className={s.sub}>
              Semi-transparent ETFs have hidden portfolios for years. What they cannot do is prove
              the strategy was followed without showing you the strategy.
            </p>
          </div>
          <div className={s.grid4}>
            {BINDS.map((b) => (
              <article key={b.t} className={s.tile}>
                <h3>{b.t}</h3>
                <p>{b.d}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── honest limits ──────────────────────────────────── */}
      <section className={s.section}>
        <div className="wrap">
          <div className={s.head}>
            <p className="eyebrow">Stated plainly</p>
            <h2 className={s.h2}>What Ballast does not hide</h2>
            <p className={s.sub}>
              A privacy claim is worth exactly what its threat model is worth. The guarantee is
              against traders who would front-run the rebalance — not against everyone.
            </p>
          </div>
          <div className={s.limits}>
            {LIMITS.map((l, i) => (
              <article key={l.t} className={s.limit}>
                <span className={s.limitNum} style={{ fontFamily: "var(--font-mono)" }}>
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <h3>{l.t}</h3>
                  <p>{l.d}</p>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <footer className={s.footer}>
        <div className={`wrap ${s.footRow}`}>
          <span>Ballast — a private index fund on Canton</span>
          <a href="https://github.com/jerrymusaga/Ballast" target="_blank" rel="noreferrer">Source</a>
          <Link href="/verify">Verify</Link>
        </div>
      </footer>
    </main>
  );
}
