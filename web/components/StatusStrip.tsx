import type { FundStatus } from "@/lib/lenses";
import s from "./StatusStrip.module.css";

const dash = "—";

export default function StatusStrip({ status, ledger }: { status: FundStatus; ledger: string }) {
  const cells: Array<[string, string, "amber" | "cyan" | "ink" | "dim"]> = [
    ["FUND", status.fundId ?? dash, "ink"],
    ["MANDATE", status.mandateVersion ? `v${status.mandateVersion} · PRIVATE` : dash, "amber"],
    ["NAV", status.nav ?? "not published", status.nav ? "cyan" : "dim"],
    ["UNITS", status.unitsInIssue ?? dash, "ink"],
    ["HOLDINGS", status.holdings === null ? dash : String(status.holdings), status.holdings ? "ink" : "dim"],
    ["RESERVED", status.reserved === null ? dash : String(status.reserved), "dim"],
    ["INVESTORS", status.investors === null ? dash : String(status.investors), "ink"],
    ["BAND", status.driftBand ?? dash, "cyan"],
    ["CAP", status.maxWeight ?? dash, "cyan"],
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
