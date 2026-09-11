import DisclosureMatrix from "@/components/DisclosureMatrix";
import LensExplorer from "@/components/LensExplorer";
import Panel from "@/components/Panel";
import { readLenses, type Lens } from "@/lib/lenses";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function LensesPage() {
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
            <p className={`prose ${s.err}`}>
              The lenses are read from a live participant node, so there is deliberately nothing
              to show without one.
            </p>
            <pre className={s.trace}>{error}</pre>
          </Panel>
        </div>
      </main>
    );
  }

  return (
    <main className={s.main}>
      <div className="wrap">
        <Panel
          code="02"
          title="Disclosure matrix"
          right={<>LIVE · {ledger.replace(/^https?:\/\//, "")}</>}
          flush
        >
          <DisclosureMatrix lenses={lenses} />
          <p className={`prose ${s.note}`}>
            One active-contract-set query per party, rendered unmodified. This page could not
            reveal the mandate to an investor if it tried — the ledger does not return it.
          </p>
        </Panel>

        <LensExplorer initial={lenses} />
      </div>
    </main>
  );
}
