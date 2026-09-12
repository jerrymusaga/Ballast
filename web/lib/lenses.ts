// Server-side only. Reads what each party can see, straight from the ledger.
//
// The one thing this module must never do is decide what a party sees. Every lens is a
// separate active-contract-set query submitted as a different party, and the result is
// Canton's answer. When the investor's lens omits the Mandate, that is the protocol refusing
// to return it — nothing here could surface it.

import "server-only";
import { connFromEnv, listParties } from "../../keeper/src/ledger.ts";
import { activeContracts, type CreatedEvent } from "../../keeper/src/commands.ts";

export interface LensContract {
  /** The Daml template name. Kept so anything on screen can be checked against the code. */
  kind: string;
  /** What it is, in words someone who has never read the code would use. */
  plain: string;
  /** One line on why it exists — the reason a reader should care that it is or is not here. */
  what: string;
  headline: string;
  detail: string;
  secret?: boolean;
  /** Sort weight: the contracts that carry the argument come first. */
  rank: number;
}

export interface Lens {
  id: string;
  label: string;
  role: string;
  blurb: string;
  party: string | null;
  count: number;
  contracts: LensContract[];
}

export const LENSES = [
  { id: "manager", hint: "ballast-manager", label: "Manager", role: "Runs the fund",
    blurb: "Proposes every trade and decides none of them. Sees the whole book, including the mandate it cannot deviate from." },
  { id: "vault", hint: "ballast-vault", label: "Vault", role: "Holds the assets",
    blurb: "The fund itself. Owns every position, signs the constitution, and never acts alone." },
  { id: "investor", hint: "ballast-alice", label: "Investor", role: "Holds units",
    blurb: "Can prove the rules held without ever seeing the strategy. The absence in this column is the product." },
  { id: "lp", hint: "ballast-lp", label: "Counterparty", role: "Trades the other side",
    blurb: "A dealer on a bilateral block. Learns its own leg, at execution, and nothing about the rest of the book." },
  { id: "market", hint: "ballast-market", label: "Market", role: "Everyone else",
    blurb: "No relationship to the fund. Not a stakeholder on anything, so the ledger returns an empty set." },
] as const;

const entity = (tid: string) => tid.split(":").slice(-1)[0] ?? tid;
const num = (v: unknown) => (typeof v === "string" ? String(Number(v)) : String(v ?? ""));
const when = (v: unknown) => String(v ?? "").slice(0, 16).replace("T", " ") + " UTC";
/** Money with separators — a bare 1080000 is harder to read than it looks. */
const money = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
/** A drift band of 0.05 means five percent; showing the raw decimal makes readers do the work. */
const pct = (v: unknown) => `${(Number(v ?? 0) * 100).toFixed(1)}%`;

function describe(e: CreatedEvent): LensContract {
  const a = e.createArgument as Record<string, any>;
  const kind = entity(e.templateId);

  // Every label here is written for someone who has never seen this codebase. The template
  // name is kept alongside rather than replaced, so a reader can still tie any row back to
  // the Daml — plain language for understanding, the real name for checking.
  switch (kind) {
    case "Mandate":
      return {
        kind, rank: 0, secret: true,
        plain: "The strategy",
        what: "The exact target weights the fund must hold. This is the contract nobody outside the fund can read.",
        headline: `${(a.targets ?? []).length} target weights`,
        detail: `version ${a.version}`,
      };
    case "MandateBounds":
      return {
        kind, rank: 1,
        plain: "The rules investors can check",
        what: "The limits the fund promised to stay inside — which assets, how far it may drift, how much it may hold of any one thing.",
        headline: `drift ${pct(a.driftBand)} · cap ${pct(a.maxWeight)}`,
        detail: `${(a.universe ?? []).length} instruments · version ${a.version}`,
      };
    case "VaultIndex":
      return {
        kind, rank: 2,
        plain: "What the fund owns",
        what: "The full list of the fund's assets. Knowing this is knowing the portfolio, so it stays with the fund.",
        headline: `${(a.holdings ?? []).length} holdings`,
        detail: `${(a.pending ?? []).length} reserved for settlement`,
      };
    case "NavRecord":
      return {
        kind, rank: 3,
        plain: "What the fund is worth",
        what: "The total value, computed by the ledger from holdings the reader cannot see.",
        headline: money(a.nav),
        detail: when(a.asOf),
      };
    case "Position":
      return {
        kind, rank: 4,
        plain: "Units held",
        what: "One investor's stake. Each investor sees only their own — they are invisible to each other.",
        headline: `${num(a.units)} units`,
        detail: a.fundId,
      };
    case "Fund":
      return {
        kind, rank: 5,
        plain: "The fund itself",
        what: "Who runs it, who is invested, and which assets it accepts.",
        headline: a.fundId,
        detail: `${(a.investors ?? []).length} investors`,
      };
    case "UnitLedger":
      return {
        kind, rank: 6,
        plain: "Units in issue",
        what: "How many units exist in total. Value per unit is the fund's worth divided by this.",
        headline: `${num(a.totalUnits)} units`,
        detail: "total outstanding",
      };
    case "PriceSet":
      return {
        kind, rank: 7,
        plain: "Prices used",
        what: "Signed by an independent source, so the manager cannot mark its own book.",
        headline: `${(a.prices ?? []).length} instruments`,
        detail: when(a.asOf),
      };
    case "ComplianceRecord":
      return {
        kind, rank: 8,
        plain: "Proof a rebalance obeyed the rules",
        what: "Names the strategy version it satisfied — and no weight, instrument or counterparty.",
        headline: `mandate v${a.mandateVersion}`,
        detail: `${money(a.navBefore)} → ${money(a.navAfter)}`,
      };
    default:
      if (a.instrumentId && a.amount !== undefined) {
        return {
          kind: "Holding", rank: 9,
          plain: `${a.instrumentId.id} held`,
          what: "A real registry-issued asset. The fund holds it; it does not mint its own.",
          headline: `${num(a.amount)} ${a.instrumentId.id}`,
          detail: "CIP-56 registry asset",
        };
      }
      return { kind, rank: 10, plain: kind, what: "", headline: kind, detail: "" };
  }
}

export async function readLenses(): Promise<{ ledger: string; version: string | null; lenses: Lens[] }> {
  const c = connFromEnv();
  let version: string | null = null;
  try {
    const r = await fetch(`${c.baseUrl}/v2/version`, { cache: "no-store" });
    version = ((await r.json()) as { version?: string }).version ?? null;
  } catch { /* reported as offline below */ }

  const all = await listParties(c);
  const lenses: Lens[] = [];
  for (const l of LENSES) {
    const party = all.find((p) => p.startsWith(`${l.hint}::`)) ?? null;
    const seen = party ? await activeContracts(c, party) : [];
    lenses.push({
      id: l.id, label: l.label, role: l.role, blurb: l.blurb, party,
      count: seen.length,
      contracts: seen.map(describe).sort((a, b) => a.rank - b.rank || a.headline.localeCompare(b.headline)),
    });
  }
  return { ledger: c.baseUrl, version, lenses };
}

export interface FundStatus {
  fundId: string | null;
  mandateVersion: string | null;
  unitsInIssue: string | null;
  holdings: number | null;
  reserved: number | null;
  nav: string | null;
  navAsOf: string | null;
  pricedInstruments: number | null;
  investors: number | null;
  universe: number | null;
  driftBand: string | null;
  maxWeight: string | null;
}

/**
 * The fund's own numbers, read from the operator's lens.
 *
 * Deliberately assembled from the SAME per-party query the matrix uses rather than from a
 * privileged side channel — so if a figure appears here, a party could see it, and the status
 * strip cannot quietly know more than the lens it came from.
 */
export function statusFrom(lenses: Lens[]): FundStatus {
  const operator = lenses.find((l) => l.id === "manager");
  const pick = (kind: string) => operator?.contracts.find((c) => c.kind === kind) ?? null;
  const digits = (v: string | undefined) => (v ? (v.match(/[\d.]+/)?.[0] ?? null) : null);

  const fund = pick("Fund");
  const mandate = pick("Mandate");
  const units = pick("UnitLedger");
  const index = pick("VaultIndex");
  const nav = pick("NavRecord");
  const prices = pick("PriceSet");
  const bounds = pick("MandateBounds");

  return {
    fundId: fund?.headline ?? null,
    mandateVersion: mandate ? digits(mandate.headline) : null,
    unitsInIssue: units ? digits(units.headline) : null,
    holdings: index ? Number(digits(index.headline) ?? 0) : null,
    reserved: index ? Number(digits(index.detail) ?? 0) : null,
    nav: nav?.headline ?? null,
    navAsOf: nav?.detail ?? null,
    pricedInstruments: prices ? Number(digits(prices.headline) ?? 0) : null,
    investors: fund ? Number(digits(fund.detail) ?? 0) : null,
    universe: bounds ? Number(bounds.detail.match(/(\d+)\s+instruments/)?.[1] ?? 0) : null,
    driftBand: bounds?.detail.match(/band\s+([\d.]+)/)?.[1] ?? null,
    maxWeight: bounds?.detail.match(/cap\s+([\d.]+)/)?.[1] ?? null,
  };
}
