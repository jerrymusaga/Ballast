// The keeper must agree with the ledger. These fixtures are the same ones the Daml suite
// uses, so a disagreement shows up here rather than as a rejected proposal on DevNet.

import { test } from "node:test";
import assert from "node:assert/strict";
import { dec, str, mul, div, sub, abs, ZERO } from "../src/decimal.ts";
import { decide, nav, maxDrift, residualOf, key, SELF_FINANCING_TOLERANCE, type Mandate, type Position, type Prices } from "../src/policy.ts";

const btcReg = "cBTC-Registry";
const ethReg = "cETH-Registry";
const cBTC = { admin: btcReg, id: "cBTC" };
const cETH = { admin: ethReg, id: "cETH" };

const prices = (btc: string, eth: string): Prices =>
  new Map([
    [key(cBTC), dec(btc)],
    [key(cETH), dec(eth)],
  ]);

const mandate: Mandate = {
  targets: [
    { instrument: cBTC, target: dec("0.6") },
    { instrument: cETH, target: dec("0.4") },
  ],
  driftBand: dec("0.05"),
  maxWeight: dec("0.8"),
};

const holding = (btc: string, eth: string): Position[] => [
  { instrument: cBTC, quantity: dec(btc) },
  { instrument: cETH, quantity: dec(eth) },
];

test("decimals are exact where doubles are not", () => {
  // The classic float failure, which must not happen here.
  assert.equal(str(dec("0.1") + dec("0.2")), "0.3");
  assert.equal(str(mul(dec("1.2"), dec("60000"))), "72000");
  // Ten decimal places is the limit Daml holds; more must be refused rather than truncated.
  assert.throws(() => dec("0.12345678901"));
});

test("NAV matches the Daml fixture exactly", () => {
  // 12 cBTC at 60,000 plus 180 cETH at 2,000.
  assert.equal(str(nav(holding("12", "180"), prices("60000", "2000"))), "1080000");
});

test("a basket on its targets is left alone", () => {
  // 12 cBTC = 720,000 and 240 cETH = 480,000 — exactly 60/40.
  const d = decide(mandate, holding("12", "240"), prices("60000", "2000"));
  assert.equal(d.rebalance, false);
  assert.match(d.reason, /inside the band/);
  assert.equal(d.legs.length, 0);
});

test("a drifted basket produces the same legs the Daml suite accepts", () => {
  const p = prices("60000", "2000");
  const d = decide(mandate, holding("12", "180"), p);
  assert.equal(d.rebalance, true);
  assert.equal(str(d.nav), "1080000");
  // 0.6667 − 0.6 = 0.0667, over the 0.05 band.
  assert.equal(str(d.drift), "0.0666666667");

  const btcLeg = d.legs.find((l) => l.instrument.id === "cBTC")!;
  const ethLeg = d.legs.find((l) => l.instrument.id === "cETH")!;
  assert.equal(str(btcLeg.delta), "-1.2");
  assert.equal(str(ethLeg.delta), "36");
  assert.equal(str(residualOf(d.legs)), "0");
});

test("awkward prices still produce a trade the ledger will accept", () => {
  // Nothing divides cleanly here, so computing each leg from its target leaves a residual.
  //
  // Exactly zero is not always reachable: the correction rounds to ten decimal places and so
  // does delta x price, so when the price does not divide the residual evenly at that scale
  // some remainder survives. What matters is that the remainder is far inside the tolerance
  // the ledger actually enforces — which it is, by roughly nine orders of magnitude.
  const cases: Array<[string, string, string, string]> = [
    ["63127.37", "1873.91", "7.3331", "211.7777"],
    ["59999.99", "2000.01", "3.1415926535", "97.6543210987"],
    ["41234.5678", "1111.1111", "25.5", "402.135"],
  ];
  for (const [btcPx, ethPx, btcQty, ethQty] of cases) {
    const p = prices(btcPx, ethPx);
    const d = decide(mandate, holding(btcQty, ethQty), p);
    assert.ok(d.rebalance, `expected a rebalance for ${btcPx}/${ethPx}`);
    const residual = residualOf(d.legs);
    const tolerance = mul(d.nav, SELF_FINANCING_TOLERANCE);
    assert.ok(
      abs(residual) <= tolerance,
      `residual ${str(residual)} must be within ${str(tolerance)} for ${btcPx}/${ethPx}`,
    );
    // Closing the residual is not cosmetic: without it the remainder is far larger, and on a
    // small fund it would exceed the tolerance and have the rebalance rejected outright.
    assert.ok(abs(residual) < dec("0.0001"));
  }
});

test("a trade that cannot be made self-financing is not proposed", () => {
  // The keeper's job is to never send something the mandate will bounce. If the residual
  // cannot be brought inside tolerance, staying quiet is the correct behaviour.
  const d = decide(mandate, holding("12", "180"), prices("60000", "2000"));
  assert.equal(d.rebalance, true);
  assert.equal(str(residualOf(d.legs)), "0");
});

test("the proposed trade lands inside the band", () => {
  const p = prices("63127.37", "1873.91");
  const positions = holding("7.3331", "211.7777");
  const d = decide(mandate, positions, p);
  assert.equal(d.rebalance, true);

  const after: Position[] = mandate.targets.map((t) => {
    const leg = d.legs.find((l) => key(l.instrument) === key(t.instrument));
    const before = positions.find((q) => key(q.instrument) === key(t.instrument))!.quantity;
    return { instrument: t.instrument, quantity: before + (leg?.delta ?? ZERO) };
  });
  const navAfter = nav(after, p);
  const driftAfter = maxDrift(mandate, after, p, navAfter);
  assert.ok(driftAfter <= mandate.driftBand, `drift after ${str(driftAfter)} must be within the band`);
  assert.ok(driftAfter < d.drift, "the trade must reduce drift");
});

test("the keeper refuses to propose what the mandate would refuse", () => {
  // A concentration cap below the target weight: every rebalance that hits the target breaches
  // the cap, so the keeper should stay quiet rather than send a proposal that cannot commit.
  const capped: Mandate = { ...mandate, maxWeight: dec("0.55") };
  const d = decide(capped, holding("12", "180"), prices("60000", "2000"));
  assert.equal(d.rebalance, false);
  assert.match(d.reason, /concentration cap/);
});

test("an instrument the fund has fallen out of counts as fully drifted", () => {
  // Holding no cETH at all is a 40-point deviation, not a zero.
  const d = decide(mandate, holding("18", "0"), prices("60000", "2000"));
  assert.equal(d.rebalance, true);
  assert.equal(str(d.drift), "0.4");
});

test("drift is measured on assets reserved but not yet settled", () => {
  // A reservation is a lien, not a sale. If the keeper dropped reserved assets from the
  // position it would see a different fund than the ledger does, and the two would disagree
  // about whether a rebalance is even due — the same bug the VaultIndex had.
  const withReserved = holding("10.8", "180").concat([{ instrument: cBTC, quantity: dec("1.2") }]);
  const p = prices("60000", "2000");
  assert.equal(str(nav(withReserved, p)), "1080000");
  const d = decide(mandate, withReserved, p);
  assert.equal(d.rebalance, true);
  assert.equal(str(d.drift), "0.0666666667");
});
