// What does a given party actually see?
//
// This is the three-lens demo, and it is deliberately not a UI trick. It makes one call to the
// ledger's active-contract-set endpoint per party and prints what comes back. The filtering is
// Canton's, enforced by the protocol; this program does not have the option of showing more.
//
// It doubles as the tool for finding real instruments: run it against a party that holds
// registry assets and it prints their InstrumentIds, which is how you learn cBTC's admin party
// on a given network rather than guessing it.
//
//   npm run inspect -- <party-id-or-hint> [more...]

import { connFromEnv } from "./ledger.ts";
import { activeContracts, type CreatedEvent } from "./commands.ts";

const entity = (tid: string): string => tid.split(":").slice(-1)[0] ?? tid;
const moduleOf = (tid: string): string => tid.split(":").slice(-2, -1)[0] ?? "";

function summarise(e: CreatedEvent): string {
  const a = e.createArgument as Record<string, any>;
  const name = entity(e.templateId);
  switch (name) {
    case "Fund":
      return `Fund ${a.fundId} — ${(a.investors ?? []).length} investors`;
    case "Mandate":
      return `Mandate v${a.version} — ${(a.targets ?? []).length} targets, band ${a.driftBand} (PRIVATE)`;
    case "MandateBounds":
      return `MandateBounds v${a.version} — band ${a.driftBand}, cap ${a.maxWeight}`;
    case "NavRecord":
      return `NAV ${a.nav} as of ${a.asOf}`;
    case "Position":
      return `Position ${a.units} units`;
    case "UnitLedger":
      return `UnitLedger ${a.totalUnits} units in issue`;
    case "VaultIndex":
      return `VaultIndex — ${(a.holdings ?? []).length} holdings, ${(a.pending ?? []).length} reserved`;
    case "ComplianceRecord":
      return `ComplianceRecord — mandate v${a.mandateVersion}, NAV ${a.navBefore} → ${a.navAfter}`;
    case "PriceSet":
      return `PriceSet — ${(a.prices ?? []).length} instruments as of ${a.asOf}`;
    default: {
      // Anything implementing the CIP-56 holding shape, whoever issued it.
      if (a.instrumentId && a.amount !== undefined) {
        return `${a.amount} ${a.instrumentId.id} (registry ${short(a.instrumentId.admin)})`;
      }
      return `${moduleOf(e.templateId)}:${name}`;
    }
  }
}

const short = (p: string): string => (p.length > 24 ? `${p.slice(0, 16)}…${p.slice(-4)}` : p);

async function main() {
  const wanted = process.argv.slice(2);
  if (wanted.length === 0) {
    console.error("usage: inspect.ts <party> [party...]");
    process.exit(2);
  }
  const c = connFromEnv();
  const { listParties } = await import("./ledger.ts");
  const all = await listParties(c);

  for (const hint of wanted) {
    const party = all.find((p) => p === hint) ?? all.find((p) => p.startsWith(`${hint}::`));
    console.log(`\n── ${hint} ${"─".repeat(Math.max(0, 56 - hint.length))}`);
    if (!party) {
      console.log("   no such party on this validator");
      continue;
    }
    const seen = await activeContracts(c, party);
    if (seen.length === 0) {
      console.log("   sees nothing");
      continue;
    }
    const byKind = new Map<string, CreatedEvent[]>();
    for (const e of seen) {
      const k = entity(e.templateId);
      byKind.set(k, [...(byKind.get(k) ?? []), e]);
    }
    for (const [kind, es] of [...byKind].sort()) {
      for (const e of es) console.log(`   ${kind.padEnd(18)} ${summarise(e)}`);
    }
    console.log(`   ${String(seen.length).padStart(3)} contracts visible`);
  }
}

main().catch((e) => {
  console.error(`\nfailed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
