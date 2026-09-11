// Daml-compatible fixed-point arithmetic.
//
// The keeper computes the trade; the ledger decides whether to accept it. That only works if
// both sides agree on the arithmetic, and IEEE doubles do not agree with Daml's Decimal.
// `Mandate.ValidateRebalance` checks that a rebalance is self-financing to within 1e-7 of NAV
// — on a million-dollar fund that is a tenth of a cent — so a leg computed in floating point
// can be rejected for a rounding error nobody can see.
//
// So the keeper does not use floats. A Daml `Decimal` is a fixed-point number with exactly 10
// decimal places, which a bigint scaled by 10^10 represents exactly. Every value the keeper
// sends to the ledger is therefore a number the ledger can hold without rounding it.

/** A Daml Decimal: the real value multiplied by 10^10, held exactly. */
export type Dec = bigint;

export const SCALE = 10n ** 10n;
export const ZERO: Dec = 0n;
export const ONE: Dec = SCALE;

/** Parse a decimal string or safe number. Rejects anything that would silently lose precision. */
export function dec(value: string | number): Dec {
  const s = typeof value === "number" ? String(value) : value.trim();
  if (!/^-?\d+(\.\d+)?$/.test(s)) throw new Error(`not a decimal: ${value}`);
  const neg = s.startsWith("-");
  const [whole, frac = ""] = (neg ? s.slice(1) : s).split(".");
  if (frac.length > 10) throw new Error(`more than 10 decimal places: ${value}`);
  const scaled = BigInt(whole) * SCALE + BigInt(frac.padEnd(10, "0") || "0");
  return neg ? -scaled : scaled;
}

/** Render for the ledger API, which takes decimals as strings. */
export function str(d: Dec): string {
  const neg = d < 0n;
  const n = neg ? -d : d;
  const whole = n / SCALE;
  const frac = (n % SCALE).toString().padStart(10, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
}

/** Integer division rounding half to even — the tie-break Daml's Decimal uses. */
function divRound(num: bigint, den: bigint): bigint {
  if (den === 0n) throw new Error("division by zero");
  const neg = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const q = n / d;
  const r = n % d;
  const twice = r * 2n;
  const roundUp = twice > d || (twice === d && q % 2n === 1n);
  const res = roundUp ? q + 1n : q;
  return neg ? -res : res;
}

export const add = (a: Dec, b: Dec): Dec => a + b;
export const sub = (a: Dec, b: Dec): Dec => a - b;
export const mul = (a: Dec, b: Dec): Dec => divRound(a * b, SCALE);
export const div = (a: Dec, b: Dec): Dec => divRound(a * SCALE, b);
export const abs = (a: Dec): Dec => (a < 0n ? -a : a);
export const sum = (xs: Dec[]): Dec => xs.reduce((a, b) => a + b, 0n);
export const max = (a: Dec, b: Dec): Dec => (a > b ? a : b);
