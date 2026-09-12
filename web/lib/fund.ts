// Server-side: read the fund's live state, and act on it.
//
// Everything here is derived from the ledger as it stands right now. No figure on the screen
// is a constant in this file — the drift, the legs, the verdict all come from reading the
// actual portfolio and running the same policy the keeper runs. That matters beyond
// tidiness: a demo with hardcoded numbers is indistinguishable from a mock-up, and the whole
// argument of this product is that you do not have to take our word for anything.

import "server-only";
import { connFromEnv, listParties, type Conn } from "../../keeper/src/ledger.ts";
import { activeContracts, exercise, numeric, type CreatedEvent } from "../../keeper/src/commands.ts";
import { decide, key, type Leg, type Mandate, type Position, type Prices } from "../../keeper/src/policy.ts";
import { dec, str } from "../../keeper/src/decimal.ts";

const PKG_FROM = (tid: string) => tid.split(":")[0] ?? "";
const isA = (e: CreatedEvent, module: string, entity: string) =>
  e.templateId.endsWith(`:Ballast.${module}:${entity}`);

export interface FundState {
  ready: boolean;
  reason?: string;
  fundId: string;
  nav: string;
  perUnit: string | null;
  unitsInIssue: string | null;
  holdings: Array<{ instrument: string; quantity: string; price: string; value: string; weight: string }>;
  driftPct: string;
  bandPct: string;
  breached: boolean;
  verdict: string;
  /** What the keeper would propose, computed from the live book. */
  legs: Array<{ instrument: string; delta: string; execPrice: string; side: "BUY" | "SELL" }>;
  proofs: number;
}

interface Resolved {
  c: Conn;
  pkg: string;
  manager: string;
  vault: string;
  fund: CreatedEvent;
  mandate: CreatedEvent;
  index: CreatedEvent;
  priceSet: CreatedEvent;
  holdings: CreatedEvent[];
  units: CreatedEvent | undefined;
  proofs: CreatedEvent[];
}

async function resolve(): Promise<Resolved> {
  const c = connFromEnv();
  const all = await listParties(c);
  const need = (hint: string) => {
    const p = all.find((x) => x.startsWith(`${hint}::`));
    if (!p) throw new Error(`party ${hint} is not on this ledger`);
    return p;
  };
  const manager = need("ballast-manager");
  const vault = need("ballast-vault");

  const seen = await activeContracts(c, manager);
  const vaultSeen = await activeContracts(c, vault);

  const fund = seen.find((e) => isA(e, "Fund", "Fund"));
  const mandate = seen.find((e) => isA(e, "Mandate", "Mandate"));
  const index = seen.find((e) => isA(e, "Vault", "VaultIndex"));
  if (!fund || !mandate || !index) throw new Error("the fund has not been formed on this ledger");

  // Most recent price set wins; an older one would be refused as stale anyway.
  const priceSets = seen.filter((e) => isA(e, "Oracle", "PriceSet"));
  const priceSet = priceSets.sort((a, b) =>
    String((b.createArgument as any).asOf).localeCompare(String((a.createArgument as any).asOf)),
  )[0];
  if (!priceSet) throw new Error("no price set on this ledger");

  const held = new Set(((index.createArgument as any).holdings ?? []) as string[]);
  const holdings = vaultSeen.filter((e) => held.has(e.contractId));

  return {
    c, pkg: PKG_FROM(fund.templateId), manager, vault, fund, mandate, index, priceSet, holdings,
    units: seen.find((e) => isA(e, "Subscription", "UnitLedger")),
    proofs: seen.filter((e) => isA(e, "Mandate", "ComplianceRecord")),
  };
}

const fmt = (d: bigint) => Number(str(d)).toLocaleString("en-US", { maximumFractionDigits: 4 });
const pct = (d: bigint) => `${(Number(str(d)) * 100).toFixed(2)}%`;

export async function readFundState(): Promise<FundState> {
  const r = await resolve();
  const m = r.mandate.createArgument as any;
  const ps = r.priceSet.createArgument as any;

  const prices: Prices = new Map();
  for (const row of ps.prices ?? []) prices.set(key(row._1), dec(String(row._2)));

  const positions: Position[] = r.holdings.map((h) => {
    const a = h.createArgument as any;
    return { instrument: a.instrumentId, quantity: dec(String(a.amount)) };
  });

  const mandate: Mandate = {
    targets: (m.targets ?? []).map((t: any) => ({ instrument: t.instrument, target: dec(String(t.target)) })),
    driftBand: dec(String(m.driftBand)),
    maxWeight: dec(String(m.maxWeight)),
  };

  // The SAME decision function the off-ledger keeper uses, on the live book.
  const d = decide(mandate, positions, prices);

  const navNum = Number(str(d.nav));
  const units = r.units ? Number((r.units.createArgument as any).totalUnits) : null;

  return {
    ready: true,
    fundId: (r.fund.createArgument as any).fundId,
    nav: navNum.toLocaleString("en-US", { maximumFractionDigits: 2 }),
    perUnit: units ? (navNum / units).toLocaleString("en-US", { maximumFractionDigits: 2 }) : null,
    unitsInIssue: units ? units.toLocaleString("en-US") : null,
    holdings: positions.map((p) => {
      const price = prices.get(key(p.instrument))!;
      const value = Number(str(p.quantity)) * Number(str(price));
      return {
        instrument: p.instrument.id,
        quantity: fmt(p.quantity),
        price: Number(str(price)).toLocaleString("en-US"),
        value: value.toLocaleString("en-US", { maximumFractionDigits: 0 }),
        weight: `${((value / navNum) * 100).toFixed(1)}%`,
      };
    }),
    driftPct: pct(d.drift),
    bandPct: pct(mandate.driftBand),
    breached: d.rebalance,
    verdict: d.reason,
    legs: d.legs.map((l: Leg) => ({
      instrument: l.instrument.id,
      delta: fmt(l.delta < 0n ? -l.delta : l.delta),
      execPrice: Number(str(l.execPrice)).toLocaleString("en-US"),
      side: l.delta < 0n ? "SELL" : "BUY",
    })),
    proofs: r.proofs.length,
  };
}

export interface ActionResult {
  ok: boolean;
  title: string;
  detail: string;
  /** The ledger's own words when it refuses. Not paraphrased. */
  ledgerError?: string;
}

export type RebalanceMode = "honest" | "skim" | "timid";

/**
 * Ask the ledger to accept a rebalance.
 *
 *   honest — exactly what the policy computed from the live book.
 *   skim   — sell as required, but buy back less than the proceeds, keeping the difference.
 *   timid  — trade a fifth of what is required, leaving the fund still outside its own limit.
 *
 * The two deviations were chosen by running them. An earlier version proposed HALF the trade
 * as its deviation and the ledger accepted it — correctly, because half still lands inside the
 * band. A demo whose "violation" is actually compliant proves nothing, so each of these is now
 * one the mandate genuinely refuses, for a reason a reader can follow.
 */
export async function proposeRebalance(mode: RebalanceMode): Promise<ActionResult> {
  const r = await resolve();
  const state = await readFundState();
  if (!state.breached) {
    return { ok: false, title: "No rebalance is due", detail: state.verdict };
  }

  const m = r.mandate.createArgument as any;
  const ps = r.priceSet.createArgument as any;
  const prices: Prices = new Map();
  for (const row of ps.prices ?? []) prices.set(key(row._1), dec(String(row._2)));
  const positions: Position[] = r.holdings.map((h) => {
    const a = h.createArgument as any;
    return { instrument: a.instrumentId, quantity: dec(String(a.amount)) };
  });
  const mandate: Mandate = {
    targets: (m.targets ?? []).map((t: any) => ({ instrument: t.instrument, target: dec(String(t.target)) })),
    driftBand: dec(String(m.driftBand)),
    maxWeight: dec(String(m.maxWeight)),
  };
  const d = decide(mandate, positions, prices);

  const legs = d.legs.map((l) => {
    if (mode === "honest") return { instrument: l.instrument, delta: l.delta, execPrice: l.execPrice };
    if (mode === "timid") {
      // A fifth of the required trade. Moves the right way, nowhere near far enough.
      return { instrument: l.instrument, delta: l.delta / 5n, execPrice: l.execPrice };
    }
    // skim: sell everything required, buy back a tenth less, and pocket the difference.
    const delta = l.delta > 0n ? (l.delta * 9n) / 10n : l.delta;
    return { instrument: l.instrument, delta, execPrice: l.execPrice };
  });

  try {
    await exercise(
      r.c,
      { actAs: [r.manager], readAs: [r.vault], label: `rebalance-${mode}` },
      `${r.pkg}:Ballast.Mandate:Mandate`,
      r.mandate.contractId,
      "ValidateRebalance",
      {
        fundCid: r.fund.contractId,
        vaultIndexCid: r.index.contractId,
        priceSetCid: r.priceSet.contractId,
        legs: legs.map((l) => ({
          instrument: l.instrument,
          delta: numeric(str(l.delta)),
          execPrice: numeric(str(l.execPrice)),
        })),
        lastRebalance: null,
      },
    );
    return {
      ok: true,
      title: mode === "honest" ? "Accepted — and proved" : "Accepted",
      detail:
        "Checked against the private strategy and committed. Investors can now see a proof naming the strategy version it satisfied — and nothing else about it.",
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    // The mandate's own sentence, with Canton's scaffolding stripped off the front.
    // Raw looks like: UNHANDLED_EXCEPTION/DA.Exception.AssertionFailed:AssertionFailed
    // (error category 9): rebalance is not self-financing
    const cause = ledgerSentence(raw);
    return {
      ok: false,
      title: "Refused by the ledger",
      detail:
        "Nothing moved. This was not the app declining — the mandate is a contract, and the ledger would not record a trade that breaks it.",
      ledgerError: cause ?? raw.slice(0, 240),
    };
  }
}

/** Pull the human sentence out of a Canton error, or give back something short and honest. */
function ledgerSentence(raw: string): string {
  const m = /AssertionFailed[^:]*:\s*([^"\\]+)/.exec(raw);
  const text = (m?.[1] ?? raw).trim();
  return text
    .replace(/^.*?AssertionFailed[^:]*:\s*/, "")
    .replace(/\s*\(error category \d+\)\s*:?\s*/gi, "")
    .replace(/^[A-Z_]+\/[^:]+:\s*/, "")
    .trim()
    .slice(0, 200);
}
