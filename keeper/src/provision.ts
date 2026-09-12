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
import { darLocation } from "./commands.ts";
import {
  type Conn, type Right,
  connFromEnv, grantRights, listPackages, listParties, listRights, revokeRights,
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
  // An outsider with no relationship to the fund. It exists so the "market" lens is answered
  // by a genuinely unrelated party rather than by an investor who happens to see little —
  // which would flatter the demo and misstate the claim.
  { hint: "ballast-market", right: "readAs" as const, why: "outsider — must see nothing" },
];

const PKG_DIR = "../../ledger/ballast/";

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
  const damlYaml = await readFile(new URL(`${PKG_DIR}daml.yaml`, import.meta.url), "utf8");
  const loc = darLocation(damlYaml);
  const dar = await readFile(new URL(`${PKG_DIR}${loc.file}`, import.meta.url));
  console.log(`\nDAR:     ${loc.name} v${loc.version} (${(dar.length / 1024).toFixed(0)} KiB)`);
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
 * Revoke the vault's formation-time actAs grant.
 *
 * This is the step that turns the mandate from a description into a constraint. While the
 * submitting user can act as the vault, the manager can move fund assets directly and the
 * policy contract guarantees nothing — so this verifies the outcome rather than trusting the
 * call, and exits non-zero if the grant is still there.
 */
async function dropFormationRights(c: Conn, apply: boolean) {
  const parties = await listParties(c);
  const vault = parties.find((p) => p.startsWith("ballast-vault::"));
  if (!vault) throw new Error("ballast-vault is not allocated on this validator");

  const granted = async () => /CanActAs[^}]*ballast-vault/.test(JSON.stringify(await listRights(c)));

  if (!(await granted())) {
    console.log("\n✓ the manager cannot act as the vault — the mandate binds.");
    return;
  }
  if (!apply) {
    console.log("\nvault actAs is still granted; would revoke it.");
    return;
  }

  await revokeRights(c, [{ kind: "actAs", party: vault }]);

  // Verify, rather than trust the response. This control is worth a second round trip.
  if (await granted()) {
    console.error(
      "\n✗ Revoke reported success but the vault actAs right is STILL granted.\n" +
        "  Do not deploy or demo on top of this: the manager can move fund assets without\n" +
        "  the mandate's approval and the policy contract guarantees nothing.",
    );
    process.exit(1);
  }
  console.log("\n✓ vault actAs revoked and verified gone — the mandate now binds.");
}

main().catch((e) => {
  console.error(`\nfailed: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
});
