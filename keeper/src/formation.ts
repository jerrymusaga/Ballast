// Formation: bring a fund into existence on a real ledger.
//
// This is the one moment the vault genuinely signs alongside the manager — the Fund and the
// Mandate are the fund's constitution, and both parties are party to it. Every later act of
// the manager derives its authority from these contracts rather than from the vault's key,
// which is why the vault's actAs grant must be dropped once this has run. See provision.ts.
//
//   npm run formation -- --plan
//   npm run formation -- --apply

import { readFile } from "node:fs/promises";
import { connFromEnv, listParties } from "./ledger.ts";
import { create, int64, packageIdFromDar, relTime, templateId, timestamp, tuple2 } from "./commands.ts";

const DAR = "../../ledger/ballast/.daml/dist/ballast-0.1.0.dar";

/**
 * Package ids are derived from package CONTENT, so they change whenever the Daml does. Reading
 * it from the DAR that is actually deployed keeps the two from drifting; an env override is
 * there for pointing at a package built elsewhere, such as by Seaport's own build runner.
 */
async function packageId(): Promise<string> {
  if (process.env.BALLAST_PKG) return process.env.BALLAST_PKG;
  return packageIdFromDar(await readFile(new URL(DAR, import.meta.url)), "ballast");
}

const FUND_ID = process.env.BALLAST_FUND_ID ?? "BALLAST-01";

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply && !process.argv.includes("--plan")) {
    console.error("usage: formation.ts --plan | --apply");
    process.exit(2);
  }
  const c = connFromEnv();
  const PKG = await packageId();
  const tid = (module: string, entity: string) => templateId(PKG, `Ballast.${module}`, entity);
  const all = await listParties(c);
  const need = (hint: string): string => {
    const p = all.find((x) => x.startsWith(`${hint}::`));
    if (!p) throw new Error(`party ${hint} not allocated — run provision first`);
    return p;
  };

  const manager = need("ballast-manager");
  const vault = need("ballast-vault");
  const oracle = need("ballast-oracle");
  const alice = need("ballast-alice");
  const bob = need("ballast-bob");

  // The instruments the fund is defined over. These must be REAL registry instruments on the
  // target network — run `npm run inspect -- <a-party-holding-assets>` to read their admin
  // party off an actual holding rather than guessing it.
  const cbtcAdmin = process.env.CBTC_ADMIN;
  const cethAdmin = process.env.CETH_ADMIN;
  if (!cbtcAdmin || !cethAdmin) {
    throw new Error(
      "set CBTC_ADMIN and CETH_ADMIN to the registry parties of the real instruments.\n" +
        "  Find them with:  npm run inspect -- <party that holds cBTC>",
    );
  }
  const cBTC = { admin: cbtcAdmin, id: process.env.CBTC_ID ?? "cBTC" };
  const cETH = { admin: cethAdmin, id: process.env.CETH_ID ?? "cETH" };

  const both = { actAs: [manager, vault], label: "formation" };
  const asOracle = { actAs: [oracle], label: "prices" };

  const plan = [
    ["Fund", "Fund", both, {
      manager, vault, fundId: FUND_ID, oracle,
      maxPriceAge: relTime(3600),
      accepted: [cBTC],
      payout: cBTC,
      investors: [alice, bob],
    }],
    // The private half: target weights live here and are disclosed to nobody.
    ["Mandate", "Mandate", both, {
      manager, vault, fundId: FUND_ID, version: int64(1),
      targets: [
        { instrument: cBTC, target: "0.6" },
        { instrument: cETH, target: "0.4" },
      ],
      driftBand: "0.05",
      maxWeight: "0.8",
      minRebalanceGap: relTime(3600),
      priceTolerance: "0.01",
    }],
    // The disclosed half: what investors are entitled to hold the fund to. No weights.
    ["Mandate", "MandateBounds", both, {
      manager, vault, fundId: FUND_ID, version: int64(1),
      universe: [cBTC, cETH],
      driftBand: "0.05",
      maxWeight: "0.8",
      minRebalanceGap: relTime(3600),
      investors: [alice, bob],
    }],
    ["Subscription", "UnitLedger", both, {
      manager, vault, fundId: FUND_ID, totalUnits: "0",
    }],
    // Empty on purpose. The fund owns nothing until it is funded with real assets, and an
    // index that claimed otherwise would be the exact lie the index exists to prevent.
    ["Vault", "VaultIndex", both, {
      manager, vault, fundId: FUND_ID, holdings: [], pending: [],
    }],
    ["Oracle", "PriceSet", asOracle, {
      oracle,
      prices: [tuple2(cBTC, "60000"), tuple2(cETH, "2000")],
      asOf: timestamp(),
      consumers: [manager, vault],
    }],
  ] as const;

  console.log(`package: ${PKG.slice(0, 16)}…`);
  console.log(`fund:    ${FUND_ID}`);
  console.log(`cBTC:    ${cBTC.id} @ ${cbtcAdmin.slice(0, 20)}…`);
  console.log(`cETH:    ${cETH.id} @ ${cethAdmin.slice(0, 20)}…\n`);

  for (const [module, entity, sub, args] of plan) {
    if (!apply) {
      console.log(`would create ${entity}`);
      continue;
    }
    const ev = await create(c, { ...sub, label: entity }, tid(module, entity), args as Record<string, unknown>);
    console.log(`created ${entity.padEnd(14)} ${ev.contractId.slice(0, 24)}…`);
  }

  if (apply) {
    console.log("\nFormation complete. The vault's actAs grant is no longer needed:");
    console.log("  npm run provision:formation-done");
    console.log("\nThe fund owns nothing yet. Fund the vault with real assets, then add them");
    console.log("to the VaultIndex before publishing a NAV.");
  } else {
    console.log("\n(plan only — nothing was created)");
  }
}

main().catch((e) => {
  console.error(`\nfailed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
