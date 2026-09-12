import Link from "next/link";
import DisclosureMatrix from "@/components/DisclosureMatrix";
import LensExplorer from "@/components/LensExplorer";
import Panel from "@/components/Panel";
import RebalanceConsole from "@/components/RebalanceConsole";
import StatusStrip from "@/components/StatusStrip";
import { readFundState } from "@/lib/fund";
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

  let fundState = null;
  try {
    fundState = await readFundState();
  } catch {
    // The console renders its own empty state; the rest of the page is still worth showing.
  }

  const status = statusFrom(lenses);
  const investor = lenses.find((l) => l.id === "investor");

  return (
    <main className={s.main}>
      <div className="wrap">
        <div className={s.intro}>
          <h1 className={s.h1}>Try to cheat this fund. You can&rsquo;t.</h1>
          <p className={`prose ${s.introP}`}>
            This is a real index fund on a Canton ledger — not a mock-up. You are holding the
            manager&rsquo;s keys. Below you can propose trades on its behalf, including dishonest
            ones, and watch the ledger decide. Then look at what everyone else was able to see
            while it happened.
          </p>
        </div>

        <StatusStrip status={status} ledger={ledger} />

        <Panel code="01" title="Act — propose a trade as the manager" flush>
          <RebalanceConsole initial={fundState} />
        </Panel>

        <Panel
          code="02"
          title="Observe — who could see any of that?"
          right={<><span className={s.live}>●</span> READ LIVE</>}
          flush
        >
          <DisclosureMatrix lenses={lenses} />
          <div className={s.verdict}>
            <span className={s.verdictK}>THE POINT</span>
            <p className="prose">
              Look at the first row. <b>The strategy is visible to the two parties that run the
              fund and to nobody else</b> — not even to the investors whose money it is. Yet
              those investors still see what the fund is worth, what they own, and the rules it
              promised to stay inside.
              {investor && ` This investor gets ${investor.count} of the ${
                lenses.find((l) => l.id === "manager")?.count ?? 0
              } things that exist.`}{" "}
              That is the product: you can check the fund without being able to copy it.
            </p>
          </div>
        </Panel>

        <Panel code="03" title="Inspect — look through one party's eyes" flush>
          <p className={`prose ${s.explain}`}>
            Pick someone. You are seeing exactly what the ledger hands them when they ask — no
            more, and nothing withheld by us.
          </p>
          <LensExplorer initial={lenses} />
        </Panel>

        <Panel code="04" title="Verify — don\u2019t take our word for it" flush>
          <div className={s.checks}>
            <div className={s.check}>
              <span className={s.checkK}>PACKAGE</span>
              <p className="prose">The deployed package contains no token template, so it cannot be minting its own pretend assets.</p>
              <code className={s.cmd}>unzip -l ledger/ballast/.daml/dist/ballast-*.dar | grep dalf</code>
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
