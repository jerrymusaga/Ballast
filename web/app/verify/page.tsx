import Link from "next/link";
import Panel from "@/components/Panel";
import s from "./page.module.css";

const STEPS = [
  {
    t: "THE PRIVACY CLAIM, ON A REAL LEDGER",
    d: "Open the lenses. The investor sees the fund and the disclosed bounds; the Mandate holding the target weights is absent. Those counts are live active-contract-set answers from a running participant node — one query per party.",
    href: "/lenses", hrefLabel: "OPEN LENSES",
  },
  {
    t: "THE ASSETS ARE REAL, AND THE PACKAGE PROVES IT",
    d: "Ballast builds against the Canton Token Standard interfaces, and the deployed package contains no token implementation — so it cannot be minting its own pretend assets. The only token template in the repository lives in the test package and never ships.",
    code: "unzip -l ledger/ballast/.daml/dist/ballast-*.dar | grep dalf",
  },
  {
    t: "THE MANDATE REFUSES",
    d: "The policy suite is mostly refusals. Each differs from a known-good rebalance in exactly one dimension, and the suite ends by re-running the good one, so nothing passes for an unrelated reason.",
    code: "cd ledger && daml build --all && cd ballast-test && daml test",
  },
  {
    t: "THE KEEPER AGREES WITH THE LEDGER",
    d: "The off-ledger watcher computes trades in exact fixed-point arithmetic matching Daml's Decimal rather than floats, so a rebalance is never rejected for a rounding error nobody can see. It refuses to propose anything the mandate would reject.",
    code: "cd keeper && npm test",
  },
  {
    t: "READ WHAT IS NOT CLAIMED",
    d: "The limits sit on the front page, not in a footnote: the oracle is trusted, published NAV inverts given enough observations, the counterparty necessarily learns the trade, and the registry sees its own instrument.",
    href: "/", hrefLabel: "READ THE LIMITS",
  },
];

export default function VerifyPage() {
  return (
    <main className={s.main}>
      <div className="wrap">
        <Panel code="03" title="Verification checklist" right={<>5 MIN</>} flush>
          <p className={`prose ${s.lede}`}>
            Every claim on this site is checkable from the repository. None of it needs an
            account, a key, or our help — and the parts that could be faked are the parts made
            easiest to check.
          </p>
          <ol className={s.steps}>
            {STEPS.map((step, i) => (
              <li key={step.t} className={s.step}>
                <span className={s.num}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <h3 className={s.t}>{step.t}</h3>
                  <p className="prose">{step.d}</p>
                  {step.code && <pre className={s.code}>$ {step.code}</pre>}
                  {step.href && <Link href={step.href} className={s.link}>▸ {step.hrefLabel}</Link>}
                </div>
              </li>
            ))}
          </ol>
          <div className={s.src}>
            <span>SOURCE</span>
            <a href="https://github.com/jerrymusaga/Ballast" target="_blank" rel="noreferrer">github.com/jerrymusaga/Ballast ↗</a>
          </div>
        </Panel>
      </div>
    </main>
  );
}
