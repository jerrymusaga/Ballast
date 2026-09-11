import LensExplorer from "@/components/LensExplorer";
import { readLenses, type Lens } from "@/lib/lenses";
import s from "./page.module.css";

export const dynamic = "force-dynamic";

export default async function LensesPage() {
  let lenses: Lens[] = [];
  let error: string | null = null;
  try {
    lenses = (await readLenses()).lenses;
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <main className={s.main}>
      <div className="wrap">
        <p className="eyebrow">Live from the ledger</p>
        <h1 className={s.h1}>The lenses</h1>
        <p className={s.lede}>
          Pick a party. What you see is what Canton is willing to show them — one
          active-contract-set query per party, returned unmodified. This page could not reveal
          the mandate to an investor if it wanted to, because the ledger does not return it.
        </p>

        {error ? (
          <div className={s.offline}>
            <h2>No ledger connected</h2>
            <p>The lenses are read from a live participant node, so there is deliberately nothing
               to show without one.</p>
            <code className={s.err} style={{ fontFamily: "var(--font-mono)" }}>{error}</code>
          </div>
        ) : (
          <LensExplorer initial={lenses} />
        )}
      </div>
    </main>
  );
}
