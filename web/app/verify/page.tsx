import Link from "next/link";
import s from "./page.module.css";

const STEPS = [
  {
    t: "The privacy claim, on a real ledger",
    d: "Open the Lenses tab. The investor sees the fund and the disclosed bounds; the Mandate holding the target weights is absent. Those counts are live active-contract-set answers from a running participant node, one query per party.",
    href: "/lenses",
    hrefLabel: "Open the lenses",
  },
  {
    t: "The assets are real, and the package proves it",
    d: "Ballast builds against the Canton Token Standard interfaces, and the deployed package contains no token implementation — so it cannot be minting its own pretend assets. The only token template in the repository lives in the test package and never ships.",
    code: "unzip -l ledger/ballast/.daml/dist/ballast-0.1.0.dar | grep dalf",
  },
  {
    t: "The mandate refuses",
    d: "The policy suite is mostly refusals. Each differs from a known-good rebalance in exactly one dimension, and the suite ends by re-running the good one, so nothing passes for an unrelated reason.",
    code: "cd ledger && daml build --all && cd ballast-test && daml test",
  },
  {
    t: "The keeper agrees with the ledger",
    d: "The off-ledger watcher computes trades in exact fixed-point arithmetic matching Daml's Decimal rather than using floats, so a rebalance is never rejected for a rounding error nobody can see. It refuses to propose anything the mandate would reject.",
    code: "cd keeper && npm test",
  },
  {
    t: "Read what is not claimed",
    d: "The limits sit on the front page, not in a footnote: the oracle is trusted, published NAV inverts given enough observations, the counterparty necessarily learns the trade, and the registry sees its own instrument.",
    href: "/",
    hrefLabel: "Read the limits",
  },
];

export default function VerifyPage() {
  return (
    <main className={s.main}>
      <div className="wrap">
        <p className="eyebrow">Five minutes</p>
        <h1 className={s.h1}>Verify it yourself</h1>
        <p className={s.lede}>
          Every claim on this site is checkable from the repository. None of this needs an
          account, a key, or our help — and the parts that could be faked are the parts we make
          easiest to check.
        </p>

        <ol className={s.steps}>
          {STEPS.map((step, i) => (
            <li key={step.t} className={s.step}>
              <span className={s.num} style={{ fontFamily: "var(--font-mono)" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <div className={s.body}>
                <h2>{step.t}</h2>
                <p>{step.d}</p>
                {step.code && (
                  <pre className={s.code} style={{ fontFamily: "var(--font-mono)" }}>{step.code}</pre>
                )}
                {step.href && (
                  <Link href={step.href} className={s.link}>
                    {step.hrefLabel}
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden>
                      <path d="M3 8h9M8.5 4.5L12 8l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ol>

        <div className={s.source}>
          <span>The whole thing is public.</span>
          <a href="https://github.com/jerrymusaga/Ballast" target="_blank" rel="noreferrer">github.com/jerrymusaga/Ballast</a>
        </div>
      </div>
    </main>
  );
}
