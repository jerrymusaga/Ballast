import type { FundStatus } from "@/lib/lenses";
import s from "./StatusStrip.module.css";

const dash = "—";
const clean = (v: string) => Number(v.replace(/,/g, ""));
const money = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 });

/**
 * Five figures, not nine.
 *
 * A strip of every number the fund knows is a wall, and a wall is skipped. These are the ones
 * a reader forms an opinion from; the rest are a click away in the panels below.
 */
export default function StatusStrip({ status, ledger }: { status: FundStatus; ledger: string }) {
  const perUnit =
    status.nav && status.unitsInIssue && clean(status.unitsInIssue) > 0
      ? money(clean(status.nav) / clean(status.unitsInIssue))
      : null;

  const cells: Array<[string, string, "amber" | "cyan" | "ink" | "dim"]> = [
    ["FUND", status.fundId ?? dash, "ink"],
    ["THE STRATEGY", status.mandateVersion ? "PRIVATE" : dash, "amber"],
    ["WORTH", status.nav ? money(clean(status.nav)) : "not yet published", status.nav ? "cyan" : "dim"],
    ["PER UNIT", perUnit ?? dash, "cyan"],
    ["INVESTORS", status.investors === null ? dash : String(status.investors), "ink"],
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
