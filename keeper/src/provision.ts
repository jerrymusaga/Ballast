// Deploy Ballast to a Canton validator: upload the package, allocate the parties, grant the
// rights.
//
// ┌─ THE ONE THING THAT MUST NOT BE GOT WRONG ─────────────────────────────────────────────┐
// │ The manager gets ReadAs on the vault. NEVER CanActAs.                                   │
// │                                                                                         │
// │ Fund assets are CIP-56 holdings signed by (registry, vault), so moving them needs the    │
// │ vault's authority. If the submitting user could act as the vault, the manager could move │
// │ assets directly and the mandate would stop being a constraint and start being a comment. │
// │ Everything the policy contract guarantees rests on this one grant being right, and it is │
// │ a single word's difference in a JSON body.                                               │
// │                                                                                         │
// │ Formation is the exception: creating the Fund and Mandate genuinely needs both           │
// │ signatures, so provisioning grants actAs on the vault, performs formation, and then the  │
// │ grant must be dropped. `--formation-done` does that and is a required second step.       │
// └────────────────────────────────────────────────────────────────────────────────────────┘
//
// Run (credentials come from keeper/.env, which is gitignored):
//   npm run provision:plan     # show what would happen, change nothing
//   npm run provision:apply    # do it

import { readFile } from "node:fs/promises";
import {
  type Conn, type Right,
  connFromEnv, grantRights, listPackages, listParties, listRights,
  allocateParty, uploadDar, version,
} from "./ledger.ts";

/** Party roles, and the rights the submitting user is allowed to hold over each. */
const ROLES = [
  { hint: "ballast-manager", right: "actAs" as const, why: "submits every command" },
  { hint: "ballast-vault", right: "readAs" as const, why: "NEVER actAs — see the note above" },
  { hint: "ballast-oracle", right: "actAs" as const, why: "publishes signed price sets" },
  { hint: "ballast-lp", right: "actAs" as const, why: "demo counterparty for the block trade" },
  { hint: "ballast-alice", right: "actAs" as const, why: "demo investor" },
  { hint: "ballast-bob", right: "actAs" as const, why: "demo investor" },
];

const DAR = "../../ledger/ballast/.daml/dist/ballast-0.1.0.dar";

async function main() {
  const args = new Set(process.argv.slice(2));
  const apply = args.has("--apply");
  if (!apply && !args.has("--plan")) {
    console.error("usage: provision.ts --plan | --apply [--formation-done]");
    process.exit(2);
  }

  const c: Conn = connFromEnv();
  console.log(`ledger:  ${c.baseUrl}`);
  console.log(`user:    ${c.userId}`);

  if (args.has("--formation-done")) return dropFormationRights(c, apply);

  const v = await version(c);
  console.log(`version: ${JSON.stringify(v).slice(0, 120)}`);

  const existing = await listParties(c);
  console.log(`\nparties already on this validator: ${existing.length}`);

  // ── packages ──
  const dar = await readFile(new URL(DAR, import.meta.url));
  console.log(`\nDAR:     ${DAR} (${(dar.length / 1024).toFixed(0)} KiB)`);
  if (apply) {
    const before = (await listPackages(c)).length;
    await uploadDar(c, dar);
    const after = (await listPackages(c)).length;
    console.log(`uploaded — packages ${before} → ${after}`);
  } else {
    console.log("would upload");
  }

  // ── parties ──
  const parties: Record<string, string> = {};
  console.log("");
  for (const role of ROLES) {
    const found = existing.find((p) => p.startsWith(`${role.hint}::`));
    if (found) {
      parties[role.hint] = found;
      console.log(`party  ${role.hint.padEnd(18)} exists`);
    } else if (apply) {
      parties[role.hint] = await allocateParty(c, role.hint);
      console.log(`party  ${role.hint.padEnd(18)} allocated`);
    } else {
      console.log(`party  ${role.hint.padEnd(18)} would allocate`);
    }
  }

  // ── rights ──
  console.log("");
  const rights: Right[] = [];
  for (const role of ROLES) {
    const party = parties[role.hint];
    if (!party) continue;
    rights.push({ kind: role.right, party });
    console.log(`right  ${role.right.padEnd(6)} ${role.hint.padEnd(18)} — ${role.why}`);
  }
  // Formation needs the vault to sign the Fund and Mandate once. Granted here, dropped after.
  const vault = parties["ballast-vault"];
  if (vault) {
    rights.push({ kind: "actAs", party: vault });
    console.log(`right  actAs  ballast-vault      — FORMATION ONLY; run --formation-done to drop`);
  }

  if (apply) {
    await grantRights(c, rights);
    console.log("\nrights granted");
    console.log("\n⚠  Formation is not finished. Create the Fund and Mandate, then run:");
    console.log("     node --experimental-strip-types src/provision.ts --apply --formation-done");
  } else {
    console.log("\n(plan only — nothing was changed)");
  }

  console.log("\nparty ids:");
  for (const [hint, id] of Object.entries(parties)) console.log(`  ${hint} = ${id}`);
}

/**
 * Revoke the vault's actAs grant once formation is done.
 *
 * The API grants rights but this build has no verified revoke call, so this reports what must
 * be true rather than pretending to have done it. Leaving actAs on the vault in place is the
 * single worst configuration mistake available here, so it fails loudly rather than quietly.
 */
async function dropFormationRights(c: Conn, apply: boolean) {
  const current = await listRights(c);
  const json = JSON.stringify(current);
  const vaultActAs = /CanActAs[^}]*ballast-vault/.test(json);
  console.log(`\nvault actAs currently granted: ${vaultActAs ? "YES" : "no"}`);
  if (!vaultActAs) {
    console.log("✓ the manager cannot act as the vault — the mandate binds.");
    return;
  }
  console.error(
    "\n✗ The submitting user can still act as the vault.\n" +
      "  While that is true, the manager can move fund assets without the mandate's\n" +
      "  approval and the policy contract guarantees nothing.\n\n" +
      "  Revoke it before demoing or deploying anything on top:\n" +
      `    DELETE ${c.baseUrl}/v2/users/${c.userId}/rights  (body: the CanActAs vault right)\n`,
  );
  if (apply) process.exit(1);
}

main().catch((e) => {
  console.error(`\nfailed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
