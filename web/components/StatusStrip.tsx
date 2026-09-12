import type { FundStatus } from "@/lib/lenses";
import s from "./StatusStrip.module.css";

const dash = "—";

export default function StatusStrip({ status, ledger }: { status: FundStatus; ledger: string }) {
  // Labels a reader can act on without a glossary. "NAV" and "drift band" are terms of art;
  // "what the fund is worth" is what they mean.
  const money = (v: string | null) =>
    v === null ? dash : Number(v.replace(/,/g, "")).toLocaleString("en-US", { maximumFractionDigits: 0 });

  const perUnit =
    status.nav && status.unitsInIssue && Number(status.unitsInIssue) > 0
      ? money(String(Number(status.nav.replace(/,/g, "")) / Number(status.unitsInIssue)))
      : null;

  const cells: Array<[string, string, "amber" | "cyan" | "ink" | "dim"]> = [
    ["FUND", status.fundId ?? dash, "ink"],
    ["THE STRATEGY", status.mandateVersion ? "PRIVATE" : dash, "amber"],
    ["WHAT IT IS WORTH", status.nav ? money(status.nav) : "not yet published", status.nav ? "cyan" : "dim"],
    ["PER UNIT", perUnit ?? dash, "cyan"],
    ["UNITS IN ISSUE", status.unitsInIssue ?? dash, "ink"],
    ["ASSETS HELD", status.holdings === null ? dash : String(status.holdings), status.holdings ? "ink" : "dim"],
    ["INVESTORS", status.investors === null ? dash : String(status.investors), "ink"],
    ["MAY DRIFT BY", status.driftBand ? `${(Number(status.driftBand) * 100).toFixed(1)}%` : dash, "cyan"],
    ["MAX IN ONE ASSET", status.maxWeight ? `${(Number(status.maxWeight) * 100).toFixed(0)}%` : dash, "cyan"],
  ];

  return (
    <div className={s.strip}>
      <div className={s.cells}>
        {cells.map(([k, v, tone]) => (
          <div key={k} className={s.cell}>
            <span className={s.k}>{k}</span>
            <span className={`${s.v} ${s[tone]}`}>{v}</span>
          </div>
        ))}
      </div>
      <div className={s.src}>
        <span className={s.k}>SOURCE</span>
        <span className={s.srcV}>{ledger.replace(/^https?:\/\//, "")}</span>
      </div>
    </div>
  );
}
