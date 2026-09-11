// The keeper's decision: should the fund rebalance, and into what?
//
// This mirrors `Ballast.Mandate` deliberately and exactly. The keeper proposes; the ledger
// decides. If the two disagree, one of two bad things happens — the keeper proposes trades
// the ledger rejects (noisy but safe), or it fails to propose trades the ledger would have
// accepted (a rebalance quietly never happens). Neither is acceptable, so every rule here has
// a counterpart in the Daml and the arithmetic is exact on both sides.
//
// Nothing here self-executes. This module returns a proposal; a human or a scheduler submits
// it, and the mandate has the last word.

import { type Dec, ZERO, abs, add, dec, div, mul, str, sub, sum, max } from "./decimal.ts";

/** The ledger refuses a rebalance whose cash residual exceeds this fraction of NAV. */
export const SELF_FINANCING_TOLERANCE = dec("0.0000001");

export interface InstrumentId {
  admin: string;
  id: string;
}

export const key = (i: InstrumentId): string => `${i.admin}:${i.id}`;

export interface TargetWeight {
  instrument: InstrumentId;
  target: Dec;
}

export interface Mandate {
  targets: TargetWeight[];
  /** Max |actual weight − target weight| tolerated before a rebalance is allowed. */
  driftBand: Dec;
  /** Concentration cap on any single instrument. */
  maxWeight: Dec;
}

/** What the fund holds, per instrument — including assets reserved but not yet settled. */
export interface Position {
  instrument: InstrumentId;
  quantity: Dec;
}

export interface Leg {
  instrument: InstrumentId;
  /** Signed change in quantity: positive buys, negative sells. */
  delta: Dec;
  execPrice: Dec;
}

export type Prices = Map<string, Dec>;

export function priceOf(prices: Prices, i: InstrumentId): Dec {
  const p = prices.get(key(i));
  if (p === undefined) throw new Error(`no price for ${i.id}`);
  if (p <= ZERO) throw new Error(`non-positive price for ${i.id}`);
  return p;
}

export function quantityOf(positions: Position[], i: InstrumentId): Dec {
  const k = key(i);
  return sum(positions.filter((p) => key(p.instrument) === k).map((p) => p.quantity));
}

/** NAV = Σ quantity × price. The one primitive; everything else is derived from it. */
export function nav(positions: Position[], prices: Prices): Dec {
  return sum(positions.map((p) => mul(p.quantity, priceOf(prices, p.instrument))));
}

/**
 * The largest absolute deviation of any target instrument from its target weight.
 *
 * Taken over the TARGETS rather than the holdings, so an instrument the fund has fallen out
 * of entirely registers as fully drifted instead of silently scoring zero.
 */
export function maxDrift(m: Mandate, positions: Position[], prices: Prices, navNow: Dec): Dec {
  if (navNow <= ZERO) throw new Error("cannot measure drift in a fund with no value");
  return m.targets.reduce((worst, t) => {
    const value = mul(quantityOf(positions, t.instrument), priceOf(prices, t.instrument));
    return max(worst, abs(sub(div(value, navNow), t.target)));
  }, ZERO);
}

export interface Decision {
  rebalance: boolean;
  reason: string;
  drift: Dec;
  nav: Dec;
  legs: Leg[];
}

/**
 * Decide whether to rebalance, and compute the legs that restore the targets.
 *
 * The subtle part is the last step. Computing each leg independently from its target leaves a
 * rounding residual, because target quantities rarely land on 10 decimal places. The ledger
 * checks that a rebalance is self-financing — value sold must pay for value bought — to within
 * 1e-7 of NAV, so a residual of a few units in the tenth decimal place is enough to have an
 * otherwise perfect rebalance rejected. The keeper therefore closes the residual explicitly by
 * adjusting the largest leg, rather than hoping it rounds away.
 */
export function decide(m: Mandate, positions: Position[], prices: Prices): Decision {
  const navNow = nav(positions, prices);
  if (navNow <= ZERO) {
    return { rebalance: false, reason: "fund has no value", drift: ZERO, nav: navNow, legs: [] };
  }

  const drift = maxDrift(m, positions, prices, navNow);
  if (drift <= m.driftBand) {
    return {
      rebalance: false,
      reason: `drift ${fmt(drift)} is inside the band ${fmt(m.driftBand)}`,
      drift,
      nav: navNow,
      legs: [],
    };
  }

  // Target quantity for each instrument, and the trade that gets us there.
  const legs: Leg[] = m.targets.map((t) => {
    const price = priceOf(prices, t.instrument);
    const targetQty = div(mul(t.target, navNow), price);
    return {
      instrument: t.instrument,
      delta: sub(targetQty, quantityOf(positions, t.instrument)),
      execPrice: price,
    };
  });

  // Close the rounding residual, so the trade is self-financing to the tightest degree the
  // number format allows.
  //
  // Exactly zero is not always reachable, and it is worth being clear why rather than
  // pretending otherwise: the correction itself rounds to ten decimal places, and so does
  // `delta × price`. If the price does not divide the residual evenly at that scale, some
  // remainder survives — the same reason a third of a cent cannot be paid. So the goal is not
  // zero, it is comfortably inside what the ledger will accept.
  const closed = closeResidual(legs);
  const residual = residualOf(closed);
  const tolerance = mul(navNow, SELF_FINANCING_TOLERANCE);
  if (abs(residual) > tolerance) {
    return {
      rebalance: false,
      reason: `could not make the trade self-financing within tolerance (residual ${str(residual)})`,
      drift,
      nav: navNow,
      legs: [],
    };
  }

  const traded = closed.filter((l) => l.delta !== ZERO);
  if (traded.length === 0) {
    return { rebalance: false, reason: "drift breached but no trade would change anything", drift, nav: navNow, legs: [] };
  }

  // Never propose something the mandate will refuse. A rejected proposal is not harmful, but
  // it is noise that hides real failures, and the keeper can check the same things for free.
  const after: Position[] = m.targets.map((t) => ({
    instrument: t.instrument,
    quantity: add(
      quantityOf(positions, t.instrument),
      traded.find((l) => key(l.instrument) === key(t.instrument))?.delta ?? ZERO,
    ),
  }));
  const navAfter = nav(after, prices);
  const driftAfter = maxDrift(m, after, prices, navAfter);

  if (driftAfter > m.driftBand) {
    return { rebalance: false, reason: `computed trade would still leave drift at ${fmt(driftAfter)}`, drift, nav: navNow, legs: [] };
  }
  if (driftAfter >= drift) {
    return { rebalance: false, reason: "computed trade would not reduce drift", drift, nav: navNow, legs: [] };
  }
  for (const p of after) {
    if (p.quantity < ZERO) {
      return { rebalance: false, reason: `trade would short ${p.instrument.id}`, drift, nav: navNow, legs: [] };
    }
    if (mul(p.quantity, priceOf(prices, p.instrument)) > mul(navAfter, m.maxWeight)) {
      return { rebalance: false, reason: `trade would breach the concentration cap on ${p.instrument.id}`, drift, nav: navNow, legs: [] };
    }
  }

  return {
    rebalance: true,
    reason: `drift ${fmt(drift)} breached the band ${fmt(m.driftBand)}`,
    drift,
    nav: navNow,
    legs: traded,
  };
}

/**
 * Nudge the largest leg until the trade is as close to self-financing as the format allows.
 *
 * The largest leg absorbs the correction because the adjustment is proportionally smallest
 * there, so it disturbs the resulting weight least. Each pass must actually improve matters or
 * we stop: rounding makes it possible to oscillate, and a loop that trades one remainder for
 * an equal one would never terminate on its own.
 */
function closeResidual(legs: Leg[]): Leg[] {
  let best = legs;
  for (let pass = 0; pass < 4; pass++) {
    const residual = residualOf(best);
    if (residual === ZERO) break;
    let biggest = 0;
    for (let i = 1; i < best.length; i++) {
      if (abs(best[i].delta) > abs(best[biggest].delta)) biggest = i;
    }
    const adjustment = div(residual, best[biggest].execPrice);
    if (adjustment === ZERO) break;
    const candidate = best.map((l, i) =>
      i === biggest ? { ...l, delta: sub(l.delta, adjustment) } : l,
    );
    if (abs(residualOf(candidate)) >= abs(residual)) break;
    best = candidate;
  }
  return best;
}

/** Cash left over after a trade. Zero means exactly self-financing. */
export function residualOf(legs: Leg[]): Dec {
  return sum(legs.map((l) => mul(l.delta, l.execPrice)));
}

const fmt = (d: Dec): string => {
  const pct = (Number(d) / 1e10) * 100;
  return `${pct.toFixed(3)}%`;
};

export { dec };
