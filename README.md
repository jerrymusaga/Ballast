# Ballast

**A rules-based index fund the market cannot front-run — whose investors can still prove the rules were followed.**

*Ballast: the weight that keeps you steady — and it sits below the waterline.*

Built on Canton Network for HackCanton Season 3. The fund holds **real CIP-56 registry assets**,
not mirrored instruments.

---

## The problem

Every index fund publishes its methodology so investors can trust it isn't being cheated.

That publication is exactly what gets it front-run.

The rules are public and the prices are public, so traders can **predict** what the fund must buy
and when — and get there first. The fund then trades at a worse price, and its own investors pay
for it. Every rebalance. Forever. This is not hypothetical: the measured drag from index
reconstitution runs to tens of basis points a year on major index funds.

For a rules-based fund, **transparency and predictability are the same quantity.**

On a public chain it is worse: holdings sit in public state and orders sit in a public mempool.

## What is actually new here

Hiding a portfolio is not new. Active funds disclose on a lag for exactly this reason, and US
regulators approved semi-transparent ETF structures around 2019–2020 specifically so that active
strategies could not be front-run.

Every one of those structures has the same weakness: **once you stop showing the portfolio,
investors have to take the manager's word that the strategy was followed.** The industry's answer
is proxy baskets, indicative values and trusted third-party agents — machinery whose entire job is
to partially restore the trust that opacity destroyed.

Ballast replaces that machinery with the ledger. The mandate lives in a contract. The contract —
not the manager, not an auditor months later — decides whether a rebalance is admissible. Investors
do not need to see the portfolio to know the rules held, because a non-compliant rebalance could
not have committed.

**Opacity is old. Opacity you don't have to trust is the product.**

## The idea: three lenses on one fund

Canton discloses per party, so parties who share a ledger need not share a view of it.

| Lens | Sees |
|---|---|
| **Manager / vault** | The whole portfolio, the mandate, every position. |
| **Investor** | Their own position, the NAV, the mandate's *disclosed bounds*, and ledger-enforced proof that each rebalance satisfied the mandate. Not the portfolio, not the exact target weights, not other investors. |
| **Market** | Nothing. |

Note what the investor lens does *not* include. An earlier version of this design showed investors
the full mandate — but investors are market participants, and anyone can become one by buying a
single unit. Publishing exact target weights to investors re-creates the predictability the product
exists to remove: with weights, prices and NAV, the portfolio is arithmetic.

So the split is: **disclose the bounds, enforce the parameters.** Investors see the universe, the
cadence, the concentration and drift limits — enough to know what they own and to hold the fund to
it. The exact weights stay in a contract that only the ledger reads.

## What Ballast hides — and what it does not

A privacy claim is only worth what its threat model is worth. Ballast's guarantee is against
**traders who would front-run the rebalance**. Four honest limits:

**1. The instrument registry sees the fund's holdings of its own instrument.** This is structural,
not an implementation gap: a CIP-56 registry is a stakeholder in the holdings it administers,
because it must authorise transfers of them. Mitigation is architectural — a basket spread across
several registries means **no single registry sees the whole portfolio**, and none of them is the
adversary anyway.

**2. NAV leaks the portfolio, slowly.** Published NAV is one linear equation in the holdings:
`NAV_t = Σᵢ hᵢ · Pᵢ,ₜ`. Collect *n* NAV points between rebalances, with public prices, and you can
solve exactly for *n* holdings. This is unavoidable — a fund must price itself to accept
subscriptions, and every price it quotes is another equation. It is managed, not eliminated:
position **breadth is a privacy parameter** (more positions, more observations needed), NAV rounding
turns an exact solve into bounded-error least squares, and publication cadence sets the clock. The
target is that reconstruction is slower than the rebalance interval — not that it is impossible.

**3. The rebalance counterparty knows the trade.** You cannot trade without telling whoever is on
the other side. Real index funds handle this with bilateral dealer block trades rather than lit
markets, and Ballast does the same, rotating across liquidity providers so no one LP accumulates the
fund's flow. Privacy holds against the market; it does not hold against your own counterparty.

**4. Canton's privacy is disclosure-based, not cryptographic.** Parties are shown only the parts of
a transaction they are stakeholders in, enforced by the protocol. That is a different — and in some
respects weaker — trust model than a zero-knowledge chain, where a verifier validates what it cannot
read. Stakeholder structure itself can carry metadata.

## Why Canton

Not "impossible anywhere else" — a ZK chain could hide holdings behind proofs of compliance. The
honest claim is sharper and still strong:

- **Per-party disclosure is a protocol primitive, not a cryptographic construction you build.** The
  exact operation this product needs — publish a value computed *from* private state to a party who
  cannot see that state — falls straight out of Canton's sub-transaction privacy.
- **The assets already exist.** CIP-56 gives real registry-issued instruments on the same ledger. On
  a transparent chain you would have to build the privacy *and* mint stand-ins for the assets.

What stays true: on a chain with no privacy layer at all, this fund cannot exist as designed —
public state and a public mempool make the rebalance predictable by construction. The claim is that
Canton makes it *cheap and native*, not that it is the only place it is *conceivable*.

## How it works

1. A basket is defined over real CIP-56 instruments by `InstrumentId`, with private target weights.
2. Investors subscribe; units are minted against real deposits. Positions are private per investor.
3. Prices move and the basket drifts from its targets.
4. When drift breaches the policy band, an off-ledger keeper proposes a rebalance.
5. The **policy contract validates it on-ledger** against the private mandate — the manager cannot
   deviate, and the trade does not commit if it would.
6. Assets move atomically via CIP-56 transfer/allocation. Investors get proof of compliance; the
   market saw nothing.

## Design principles

- **Real assets, addressed by `InstrumentId`** — no mirrored or invented instruments.
- **Policy on-ledger** — the manager proposes, the contract decides.
- **Disclose the bounds, enforce the parameters** — publishing exact weights would restore the
  predictability the product exists to remove.
- **Nothing self-executes** — an off-ledger keeper proposes; the ledger validates.
- **Breadth is a privacy parameter** — position count is a security setting, not just a strategy
  choice.

## Layout

```
ledger/
  dars/           real CIP-56 interface DARs (Apache-2.0, Digital Asset), vendored
  ballast/        the product package — NO token template, NO daml-script
    Valuation     reads holdings through the CIP-56 interface; aggregates per instrument
    Vault         the VaultIndex — the fund's holdings, enumerated on the ledger
    Oracle        signed, freshness-checked price sets
    Fund          NAV published from the index at oracle prices
    Mandate       the private strategy, and the policy that enforces it
  ballast-test/   the test registry + proofs — never deployed
```

The split is deliberate. Ballast defines no asset of its own, and the packaging enforces it: the
deployed DAR contains only `ballast` plus the two CIP-56 interface packages. The one token
template in this repo exists solely so the local test suite has an issuer, and it lives in the
package that never leaves your machine.

## Versions

| | | |
|---|---|---|
| Daml SDK | `3.4.11` | latest stable release, and the version Seaport's build runner has pre-installed |
| CIP-56 interfaces | `splice-api-token-*-v1` `1.0.0` | package ids verified identical to those pinned by Splice `0.8.0`, the current release |

Splice 0.8.0 also ships a **v2** token-standard generation. Ballast deliberately targets v1:
v2 lives only on a separate, weekly-reset "Token Standard V2 DevNet" requiring alpha protocol 35,
not on the DevNet where real cBTC and cETH exist. Targeting v2 would mean holding no real assets.

## Status

```
cd ledger && daml build --all && cd ballast-test && daml test
```

Proven so far, on **real CIP-56 `Holding` interface contracts**, in 8 scripts:

- **`fourLenses`** — a NAV computed from holdings is disclosed to investors who cannot see
  those holdings; the market sees nothing; the two instrument registries each see only their
  own leg; and the price oracle values the fund without learning anything about it.
- **`navRefusesBadInputs`** — eight ways to bias a NAV, all refused: a price set that omits an
  instrument, a non-positive price, a stale one, a post-dated one, one from an oracle the fund
  never appointed, an index that double-counts, an index listing another vault's assets, and
  an index belonging to another fund.
- **`policyAdmitsACompliantRebalance`** and five refusal scripts — the mandate admits a
  rebalance that obeys it and refuses nine ways to deviate, including trading before the drift
  band is breached, under-trading, trades that are not self-financing, execution prices away
  from the oracle, and rebalancing inside the cadence floor. The compliance proof cannot be
  forged, and the mandate cannot be rewritten by the manager alone.

### What is deliberately still not claimed

- **The oracle is trusted.** Ballast does not claim otherwise. What it claims is narrower and
  checkable: the manager cannot mark its own book, cannot pick which price set to value
  against, and cannot pick the moment. That is where a real fund puts the trust too — in an
  administrator rather than in the portfolio manager.
- **Settlement is not built yet.** `ValidateRebalance` decides whether a rebalance is
  admissible; it does not yet move the assets or update the index. Until CIP-56 allocation
  settlement lands, the policy is proven and the plumbing is not.
- **NAV still leaks the portfolio, slowly.** Nothing above changes the linear algebra. Breadth,
  cadence and rounding remain the dials.

Not built yet: subscribe and redeem, the rebalance settlement itself, and the keeper.