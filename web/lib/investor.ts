// The investor's side of the fund.
//
// Each visitor gets a FRESHLY ALLOCATED party. That is not a demo convenience — it is the
// honest shape of the thing. A newcomer to a Canton fund genuinely is a party with no
// relationship to it, and the ledger genuinely returns them nothing. Reusing a pre-seeded
// investor would skip the only part of the story that proves anything: watching an empty set
// become a position without ever revealing the strategy.

import "server-only";
import { allocateParty, connFromEnv, grantRights, listParties, type Conn } from "../../keeper/src/ledger.ts";
import { readFile } from "node:fs/promises";
import { activeContracts, create, exercise, numeric, packageIdFromDar, timestamp, type CreatedEvent } from "../../keeper/src/commands.ts";

/**
 * The package id of a vendored CIP-56 interface.
 *
 * Interface choices are exercised against the INTERFACE's template id, which lives in the
 * Splice package rather than in ours or the registry's. Read it from the DAR that is actually
 * deployed — a hardcoded id is wrong the moment the interfaces are updated, and it fails as
 * "invalid template", which points at the wrong thing entirely.
 */
let allocationIfacePkg: string | null = null;
async function splicePkg(): Promise<string> {
  if (allocationIfacePkg) return allocationIfacePkg;
  const name = "splice-api-token-allocation-instruction-v1";
  const url = new URL(`../../ledger/dars/${name}-1.0.0.dar`, import.meta.url);
  allocationIfacePkg = packageIdFromDar(await readFile(url), name);
  return allocationIfacePkg;
}

const isA = (e: CreatedEvent, module: string, entity: string) =>
  e.templateId.endsWith(`:Ballast.${module}:${entity}`);
const PKG_FROM = (tid: string) => tid.split(":")[0] ?? "";

export interface InvestorView {
  party: string;
  joined: boolean;
  units: string | null;
  canSee: Array<{ plain: string; detail: string; kind: string }>;
  cannotSee: string[];
  nav: string | null;
  perUnit: string | null;
}

interface Ctx {
  c: Conn;
  pkg: string;
  testPkg: string | null;
  manager: string;
  vault: string;
  btcReg: string;
  fund: CreatedEvent;
  bounds: CreatedEvent;
  index: CreatedEvent;
  priceSet: CreatedEvent;
  units: CreatedEvent;
}

async function ctx(): Promise<Ctx> {
  const c = connFromEnv();
  const all = await listParties(c);
  const need = (h: string) => {
    const p = all.find((x) => x.startsWith(`${h}::`));
    if (!p) throw new Error(`party ${h} is not on this ledger`);
    return p;
  };
  const manager = need("ballast-manager");
  const seen = await activeContracts(c, manager);
  const pick = (m: string, e: string) => {
    const f = seen.filter((x) => isA(x, m, e));
    return f[f.length - 1];
  };
  const fund = pick("Fund", "Fund");
  const bounds = pick("Mandate", "MandateBounds");
  const index = pick("Vault", "VaultIndex");
  const units = pick("Subscription", "UnitLedger");
  const priceSets = seen.filter((e) => isA(e, "Oracle", "PriceSet"));
  const priceSet = priceSets.sort((a, b) =>
    String((b.createArgument as any).asOf).localeCompare(String((a.createArgument as any).asOf)),
  )[0];
  if (!fund || !bounds || !index || !units || !priceSet) {
    throw new Error("the fund is not fully formed on this ledger — run formation and seed");
  }
  const anyHolding = (await activeContracts(c, need("ballast-vault"))).find(
    (e) => (e.createArgument as any).instrumentId !== undefined,
  );
  return {
    c, pkg: PKG_FROM(fund.templateId),
    testPkg: anyHolding ? PKG_FROM(anyHolding.templateId) : null,
    manager, vault: need("ballast-vault"), btcReg: need("ballast-lp"),
    fund, bounds, index, priceSet, units,
  };
}

/** A newcomer. Allocated fresh so the story starts where a real newcomer starts: nowhere. */
export async function newInvestor(): Promise<string> {
  const c = connFromEnv();
  const party = await allocateParty(c, `ballast-investor-${Date.now().toString(36)}`);
  await grantRights(c, [{ kind: "actAs", party }]);
  return party;
}

/** Daml TextMap encodes as a JSON OBJECT. Passing [] earns "Expected ujson.Obj". */
const EMPTY_META = { values: {} };

const num = (v: unknown) => Number(v ?? 0).toLocaleString("en-US", { maximumFractionDigits: 2 });

export async function readInvestor(party: string): Promise<InvestorView> {
  const c = connFromEnv();
  const seen = await activeContracts(c, party);

  const canSee = seen.map((e) => {
    const a = e.createArgument as any;
    if (isA(e, "Fund", "Fund")) return { plain: "The fund itself", detail: a.fundId, kind: "Fund" };
    if (isA(e, "Mandate", "MandateBounds"))
      return {
        plain: "The rules it promised to keep",
        detail: `drift ${(Number(a.driftBand) * 100).toFixed(1)}% · cap ${(Number(a.maxWeight) * 100).toFixed(0)}% · ${(a.universe ?? []).length} instruments`,
        kind: "MandateBounds",
      };
    if (isA(e, "Fund", "NavRecord")) return { plain: "What the fund is worth", detail: num(a.nav), kind: "NavRecord" };
    if (isA(e, "Subscription", "Position")) return { plain: "Your units", detail: `${num(a.units)} units`, kind: "Position" };
    if (isA(e, "Mandate", "ComplianceRecord"))
      return { plain: "Proof a rebalance obeyed the rules", detail: `strategy v${a.mandateVersion}`, kind: "ComplianceRecord" };
    const entity = e.templateId.split(":").slice(-1)[0] ?? "";
    if (entity === "TestHolding")
      return { plain: "Your own assets", detail: `${num(a.amount)} ${a.instrumentId?.id ?? ""} in your wallet`, kind: "Holding" };
    if (entity === "TestAllocationFactory")
      return { plain: "The registry you deposit through", detail: "issues and moves the asset", kind: "Factory" };
    return { plain: entity, detail: "", kind: entity };
  });

  const position = seen.find((e) => isA(e, "Subscription", "Position"));
  const nav = seen.find((e) => isA(e, "Fund", "NavRecord"));
  const units = position ? String((position.createArgument as any).units) : null;
  const navRaw = nav ? Number((nav.createArgument as any).nav) : null;

  // Named explicitly, because what is absent is the point and absence renders as nothing.
  const cannotSee = [
    "The strategy — the target weights the fund must hold",
    "What the fund owns — the actual portfolio",
    "Any other investor's position",
    "The prices the manager used, or the fund's internal records",
  ];

  let perUnit: string | null = null;
  if (navRaw && units) {
    try {
      const ul = await activeContracts(c, (await ctx()).manager);
      const total = ul.find((e) => isA(e, "Subscription", "UnitLedger"));
      const t = total ? Number((total.createArgument as any).totalUnits) : 0;
      if (t > 0) perUnit = num(navRaw / t);
    } catch { /* per-unit is a nicety, not worth failing the view over */ }
  }

  return {
    party,
    joined: canSee.some((c) => c.kind === "Fund"),
    units: units ? num(units) : null,
    canSee,
    cannotSee,
    nav: navRaw ? num(navRaw) : null,
    perUnit,
  };
}

/** Admit them to the fund AND to the bounds, in one submission. Half-admission is a bug. */
export async function joinFund(party: string): Promise<{ ok: boolean; detail: string }> {
  const x = await ctx();
  try {
    await exercise(x.c, { actAs: [x.manager], label: "admit" },
      `${x.pkg}:Ballast.Fund:Fund`, x.fund.contractId, "AdmitInvestor", { newInvestor: party });
    await exercise(x.c, { actAs: [x.manager], label: "admit-bounds" },
      `${x.pkg}:Ballast.Mandate:MandateBounds`, x.bounds.contractId, "AdmitToBounds", { newInvestor: party });
    return {
      ok: true,
      detail: "Admitted. You are now an observer of the fund and of the rules it promised to keep — and of nothing else.",
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const cause = /AssertionFailed[^:]*:\s*(.+?)(?:"|\\n|$)/.exec(raw)?.[1]?.trim();
    return { ok: false, detail: cause ?? raw.slice(0, 200) };
  }
}

/**
 * Put money in and receive units.
 *
 * The deposit is a real CIP-56 allocation from the investor to the vault, executed inside
 * AcceptSubscription — so the units and the assets change hands in the same transaction, or
 * neither does.
 */
export async function subscribe(party: string, amount: string): Promise<{ ok: boolean; detail: string }> {
  const x = await ctx();
  if (!x.testPkg) return { ok: false, detail: "no asset registry on this ledger — run seed first" };

  // Subscription is five ledger round trips. Without knowing which one failed, a
  // CONTRACT_NOT_FOUND could be any of five contracts, and the message names none of them.
  let step = "starting";
  const ttid = (e: string) => `${x.testPkg}:Ballast.Testing.Registry:${e}`;
  const cBTC = { admin: x.btcReg, id: "cBTC" };

  try {
    // The investor needs something to deposit. On a real network they already hold it.
    step = "giving the investor something to deposit";
    const holding = await create(x.c, { actAs: [x.btcReg, party], label: "fund-investor" },
      ttid("TestHolding"), { admin: x.btcReg, owner: party, instrumentId: cBTC, amount: numeric(amount) });

    // A factory to reserve it through, reused if one already exists.
    step = "creating the registry factory";
    // Deliberately not reused. A factory has to list its users as observers, so a cached one
    // from an earlier visitor does not admit this one — and reusing a contract id across runs
    // is the same stale-reference bug that bit the DAR path and the package id.
    const factory = await create(x.c, { actAs: [x.btcReg], label: "factory" },
      ttid("TestAllocationFactory"), { admin: x.btcReg, users: [x.vault, party, x.manager] });

    const ref = `SUB-${Date.now().toString(36)}`;
    const now = new Date();
    const settlement = {
      executor: x.manager,
      settlementRef: { id: ref, cid: null },
      requestedAt: timestamp(now),
      allocateBefore: timestamp(new Date(now.getTime() + 3600e3)),
      settleBefore: timestamp(new Date(now.getTime() + 7200e3)),
      meta: EMPTY_META,
    };

    step = "reserving the deposit with the registry";
    const iface = await splicePkg();
    const allocRes = await exercise(x.c, { actAs: [party], label: "reserve" },
      `${iface}:Splice.Api.Token.AllocationInstructionV1:AllocationFactory`,
      factory.contractId, "AllocationFactory_Allocate", {
        expectedAdmin: x.btcReg,
        allocation: {
          settlement,
          transferLegId: "deposit",
          transferLeg: { sender: party, receiver: x.vault, amount: numeric(amount), instrumentId: cBTC, meta: EMPTY_META },
        },
        requestedAt: timestamp(now),
        inputHoldingCids: [holding.contractId],
        extraArgs: { context: EMPTY_META, meta: EMPTY_META },
      });

    const allocCid = findCreated(allocRes, "TestAllocation");
    if (!allocCid) return { ok: false, detail: "the registry did not complete the reservation" };

    step = "registering the subscription";
    const reqRes = await exercise(x.c, { actAs: [party], label: "request" },
      `${x.pkg}:Ballast.Fund:Fund`, x.fund.contractId, "RequestSubscription",
      { investor: party, settlementRef: ref });
    const reqCid = findCreated(reqRes, "SubscriptionRequest");
    if (!reqCid) return { ok: false, detail: "could not register the subscription" };

    step = "taking delivery and issuing units";
    await exercise(x.c, { actAs: [x.manager], readAs: [x.vault, party], label: "accept" },
      `${x.pkg}:Ballast.Subscription:SubscriptionRequest`, reqCid, "AcceptSubscription", {
        vaultIndexCid: x.index.contractId,
        priceSetCid: x.priceSet.contractId,
        unitLedgerCid: x.units.contractId,
        depositCid: allocCid,
        existingPosCid: null,
      });

    return {
      ok: true,
      detail: `Deposited ${amount} cBTC. Units were issued at the fund's value BEFORE your money arrived, so nobody already invested was diluted by your joining.`,
    };
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const cause = /AssertionFailed[^:]*:\s*(.+?)(?:"|\\n|$)/.exec(raw)?.[1]?.trim();
    return { ok: false, detail: `while ${step}: ${cause ?? raw.slice(0, 200)}` };
  }
}

function findCreated(tx: any, entity: string): string | null {
  const events: any[] = tx?.transaction?.events ?? tx?.events ?? [];
  for (const ev of events) {
    const e = ev?.CreatedEvent ?? ev?.created ?? ev;
    if (e?.templateId?.endsWith(`:${entity}`) && e?.contractId) return e.contractId;
  }
  return null;
}
