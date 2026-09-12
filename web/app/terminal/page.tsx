import Link from "next/link";
import DisclosureMatrix from "@/components/DisclosureMatrix";
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

  return (
    <main className={s.main}>
      <div className="wrap">
        <div className={s.intro}>
          <h1 className={s.h1}>Try to cheat this fund. You can&rsquo;t.</h1>
          <p className={`prose ${s.introP}`}>
            You are holding the manager&rsquo;s keys to a real fund on a Canton ledger. Propose a
            trade — including a dishonest one — and watch the ledger decide.
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
              The strategy is visible to the two parties that run the fund and to nobody else —
              not even the investors whose money it is. They still see what the fund is worth,
              what they own, and the rules it promised to keep.
            </p>
          </div>
        </Panel>

        <p className={`prose ${s.onward}`}>
          Want to look through one party&rsquo;s eyes in detail, or check any of this against the
          repository? <Link href="/invest" className={s.link}>Join the fund as an investor</Link>{" "}
          or <Link href="/verify" className={s.link}>run the checks yourself</Link>.
        </p>

      </div>
    </main>
  );
}
