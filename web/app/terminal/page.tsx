import Link from "next/link";
import DisclosureMatrix from "@/components/DisclosureMatrix";
import LensExplorer from "@/components/LensExplorer";
import Panel from "@/components/Panel";
import StatusStrip from "@/components/StatusStrip";
import { readLenses, statusFrom, type Lens } from "@/lib/lenses";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function Terminal() {
  let lenses: Lens[] = [];
  let ledger = "";
  let error: string | null = null;
  try {
    const d = await readLenses();
    lenses = d.lenses;
    ledger = d.ledger;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  if (error) {
    return (
      <main className={s.main}>
        <div className="wrap">
          <Panel code="!!" title="No ledger connected">
            <p className={`prose ${s.errText}`}>
              The terminal reads everything from a live participant node. There is deliberately
              nothing to show without one — no cached snapshot, no sample data.
            </p>
            <pre className={s.trace}>{error}</pre>
            <p className={`prose ${s.errText}`}>
              Start a sandbox and provision it, then reload. The steps are in{" "}
              <code>keeper/README.md</code>.
            </p>
          </Panel>
        </div>
      </main>
    );
  }

  const status = statusFrom(lenses);
  const investor = lenses.find((l) => l.id === "investor");

  return (
    <main className={s.main}>
      <div className="wrap">
        <StatusStrip status={status} ledger={ledger} />

        <Panel
          code="01"
          title="Disclosure matrix"
          right={<><span className={s.live}>●</span> LIVE</>}
          flush
        >
          <DisclosureMatrix lenses={lenses} />
          <p className={`prose ${s.note}`}>
            One active-contract-set query per party, rendered unmodified. The <b>MANDATE</b> row
            is the argument — filled for the two parties that run the fund, blank for the
            investors whose money it is, and blank because the ledger does not return it rather
            than because this page withholds it.
            {investor && ` The investor sees ${investor.count} contracts; the strategy is not among them.`}
          </p>
        </Panel>

        <LensExplorer initial={lenses} />

        <Panel code="03" title="Check it yourself" flush>
          <div className={s.checks}>
            <div className={s.check}>
              <span className={s.checkK}>PACKAGE</span>
              <p className="prose">The deployed package contains no token template, so it cannot be minting its own pretend assets.</p>
              <code className={s.cmd}>unzip -l ledger/ballast/.daml/dist/ballast-0.2.0.dar | grep dalf</code>
            </div>
            <div className={s.check}>
              <span className={s.checkK}>POLICY</span>
              <p className="prose">The mandate refuses nine ways to deviate. Each test differs from a good rebalance in exactly one dimension.</p>
              <code className={s.cmd}>cd ledger && daml build --all && cd ballast-test && daml test</code>
            </div>
            <div className={s.check}>
              <span className={s.checkK}>KEEPER</span>
              <p className="prose">Exact fixed-point arithmetic matching Daml&rsquo;s Decimal, so a rebalance is never rejected for an invisible rounding error.</p>
              <code className={s.cmd}>cd keeper && npm test</code>
            </div>
          </div>
          <div className={s.more}>
            <Link href="/verify" className={s.moreLink}>▸ FULL VERIFICATION CHECKLIST</Link>
          </div>
        </Panel>
      </div>
    </main>
  );
}
