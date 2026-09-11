# Ballast keeper

The off-ledger half of the rebalance. It watches prices, notices when the basket has drifted
outside the mandate's band, and computes the trade that would restore it.

**It proposes. It never decides.** Every rule in `src/policy.ts` has a counterpart in
`ledger/ballast/daml/Ballast/Mandate.daml`, and the ledger's copy is the one that binds. If
the keeper is wrong, buggy, or malicious, the worst it can do is submit a proposal that fails
to commit.

## Why it does not use floating point

The keeper computes the trade and the ledger checks it. `ValidateRebalance` requires a
rebalance to be self-financing to within `1e-7` of NAV — on a million-dollar fund, a tenth of
a cent. A leg computed in IEEE doubles can miss that for a rounding error nobody can see, and
the rebalance is then rejected for reasons that look like nothing at all.

So `src/decimal.ts` implements Daml's `Decimal` exactly: a fixed-point number with ten decimal
places, held as a `bigint` scaled by 10^10, rounding half to even. Every number the keeper
sends is one the ledger can hold without rounding it.

Closing the residual to *exactly* zero is not always possible — the correction rounds at ten
places and so does `delta × price`, so when the price does not divide the residual evenly some
remainder survives, for the same reason a third of a cent cannot be paid. The keeper closes it
as far as the format allows and then refuses to propose at all if what is left would not clear
the ledger's tolerance.

## Running

    npm test

No dependencies and no build step: Node 22.6+ strips the types and runs the TypeScript
directly.

## Deploying

Credentials live in `keeper/.env`, which is gitignored and must never be committed. Copy
`.env.example` and fill in the OIDC client secret.

    npm run provision:plan     # show what would happen, change nothing
    npm run provision:apply    # upload the DAR, allocate parties, grant rights

**The grant that matters** is `readAs` on the vault, never `actAs`. Fund assets are CIP-56
holdings signed by (registry, vault), so moving them needs the vault's authority — and if the
submitting user holds it, the manager can move assets without the mandate's approval and every
guarantee the policy contract makes becomes a comment. It is one word's difference in a JSON
body, so `provision.ts` encodes the rule per role rather than leaving it to whoever runs it.

Formation is the one exception: creating the `Fund` and `Mandate` genuinely needs the vault's
signature. Provisioning grants it, and `npm run provision:formation-done` checks it has since
been dropped, failing loudly if it has not.

## Not built yet

Submitting commands — the client does packages, parties and rights, not yet the command
service — and the live price feed behind the oracle.
