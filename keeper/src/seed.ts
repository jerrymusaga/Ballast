// Give the demo fund something to be a fund OF.
//
// Formation creates a fund that owns nothing, which is correct — a fund owns nothing until it
// is funded — but it makes every number on the terminal read as zero, and a screen of zeroes
// looks like a broken product rather than an empty one.
//
// This issues demo assets, points the vault index at them, publishes a NAV and issues units.
// On a network with real registries this step is replaced by acquiring real cBTC; nothing else
// changes, because the fund only ever sees `ContractId Holding`.
//
// MUST RUN BEFORE `provision:formation-done`. Wiring assets into the vault needs the vault's
// signature, which that step deliberately revokes — the same rule that stops the manager
// moving fund assets also stops it seeding them.
//
//   npm run seed -- --apply

import { readFile } from "node:fs/promises";
import { connFromEnv, listParties, uploadDar } from "./ledger.ts";
import {
  activeContracts, create, darLocation, exercise, numeric,
  packageIdFromDar, templateId, timestamp, tuple2,
} from "./commands.ts";

const PRODUCT_DIR = "../../ledger/ballast/";
const TEST_DIR = "../../ledger/ballast-test/";

const BTC = "60000";
const ETH = "2000";
const BTC_QTY = "12";
const ETH_QTY = "180";
// 12 x 60,000 + 180 x 2,000 = 1,080,000 against 1,080 units — a unit is worth exactly 1,000.
const UNITS_TOTAL = "1080";
const ALICE_UNITS = "120";
const BOB_UNITS = "960";

async function pkg(dir: string) {
  const yaml = await readFile(new URL(`${dir}daml.yaml`, import.meta.url), "utf8");
  const loc = darLocation(yaml);
  const bytes = await readFile(new URL(`${dir}${loc.file}`, import.meta.url));
  return { ...loc, bytes, id: packageIdFromDar(bytes, loc.name) };
}

async function main() {
  const apply = process.argv.includes("--apply");
  if (!apply && !process.argv.includes("--plan")) {
    console.error("usage: seed.ts --plan | --apply");
    process.exit(2);
  }

  const c = connFromEnv();
  const product = await pkg(PRODUCT_DIR);
  const test = await pkg(TEST_DIR);
  const all = await listParties(c);
  const need = (hint: string) => {
    const p = all.find((x) => x.startsWith(`${hint}::`));
    if (!p) throw new Error(`party ${hint} not allocated — run provision first`);
    return p;
  };

  const manager = need("ballast-manager");
  const vault = need("ballast-vault");
  const oracle = need("ballast-oracle");
  const alice = need("ballast-alice");
  const bob = need("ballast-bob");
  const btcReg = need("ballast-lp");      // stands in as the cBTC registry locally
  const ethReg = need("ballast-oracle");  // and as the cETH registry

  const cBTC = { admin: btcReg, id: "cBTC" };
  const cETH = { admin: ethReg, id: "cETH" };

  const ptid = (m: string, e: string) => templateId(product.id, `Ballast.${m}`, e);
  const ttid = (e: string) => templateId(test.id, "Ballast.Testing.Registry", e);

  console.log(`product : ${product.name} v${product.version}`);
  console.log(`registry: ${test.name} v${test.version}  (demo assets only)`);
  if (!apply) return console.log("\n(plan only — nothing was created)");

  // The local test registry has to exist on the ledger before it can issue anything.
  await uploadDar(c, test.bytes);
  console.log("uploaded demo registry package");

  // ── issue the assets ──
  const issue = async (registry: string, instrument: object, amount: string) => {
    const ev = await create(
      c,
      { actAs: [registry, vault], label: "issue" },
      ttid("TestHolding"),
      { admin: registry, owner: vault, instrumentId: instrument, amount: numeric(amount) },
    );
    return ev.contractId;
  };
  const hBtc = await issue(btcReg, cBTC, BTC_QTY);
  const hEth = await issue(ethReg, cETH, ETH_QTY);
  console.log(`issued ${BTC_QTY} cBTC and ${ETH_QTY} cETH to the vault`);

  // ── replace the empty index with one that points at them ──
  const seen = await activeContracts(c, vault);
  const emptyIndex = seen.find(
    (e) => e.templateId.endsWith("Ballast.Vault:VaultIndex") &&
      ((e.createArgument as any).holdings ?? []).length === 0,
  );
  if (emptyIndex) {
    await exercise(c, { actAs: [manager, vault], label: "archive-index" },
      ptid("Vault", "VaultIndex"), emptyIndex.contractId, "Archive", {});
  }
  const index = await create(
    c,
    { actAs: [manager, vault], label: "index" },
    ptid("Vault", "VaultIndex"),
    { manager, vault, fundId: "BALLAST-01", holdings: [hBtc, hEth], pending: [] },
  );
  console.log("vault index now lists both holdings");

  // ── units, and who holds them ──
  const units = seen.find((e) => e.templateId.endsWith("Ballast.Subscription:UnitLedger"));
  if (units) {
    await exercise(c, { actAs: [manager, vault], label: "archive-units" },
      ptid("Subscription", "UnitLedger"), units.contractId, "Archive", {});
  }
  await create(c, { actAs: [manager, vault], label: "units" }, ptid("Subscription", "UnitLedger"),
    { manager, vault, fundId: "BALLAST-01", totalUnits: numeric(UNITS_TOTAL) });
  for (const [who, n] of [[alice, ALICE_UNITS], [bob, BOB_UNITS]] as const) {
    await create(c, { actAs: [manager], label: "position" }, ptid("Subscription", "Position"),
      { manager, investor: who, fundId: "BALLAST-01", units: numeric(n) });
  }
  console.log(`issued ${UNITS_TOTAL} units — ${ALICE_UNITS} to one investor, ${BOB_UNITS} to the other`);

  // ── a fresh price set, then publish a NAV from it ──
  const prices = await create(c, { actAs: [oracle], label: "prices" }, ptid("Oracle", "PriceSet"), {
    oracle,
    prices: [tuple2(cBTC, numeric(BTC)), tuple2(cETH, numeric(ETH))],
    asOf: timestamp(),
    consumers: [manager, vault],
  });

  const fund = (await activeContracts(c, manager)).find((e) => e.templateId.endsWith("Ballast.Fund:Fund"));
  if (!fund) throw new Error("no Fund on this ledger — run formation first");
  await exercise(c, { actAs: [manager], readAs: [vault], label: "nav" },
    ptid("Fund", "Fund"), fund.contractId, "PublishNav",
    { vaultIndexCid: index.contractId, priceSetCid: prices.contractId });
  console.log("published a NAV computed on-ledger from holdings the investors cannot see");

  console.log("\nThe fund is now real. Next: npm run provision:formation-done");
}

main().catch((e) => {
  console.error(`\nfailed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
