# Ballast dashboard

Next.js 16 · React 19 · TypeScript · CSS Modules. No UI framework and no Tailwind — the design
is bespoke, and framework defaults have a way of showing through.

    # a ledger must be running; a local sandbox is enough
    cd ledger && daml sandbox --json-api-port 7575 --dar ballast/.daml/dist/ballast-0.1.0.dar
    cd keeper && LEDGER_API_URL=http://localhost:7575 npm run provision:apply   # then formation

    cd web && npm install
    LEDGER_API_URL=http://localhost:7575 npm run dev      # → http://localhost:5173

## It never filters

Each lens is a separate `/v2/state/active-contracts` query submitted as a different party, run
on the server, and rendered unmodified. When the investor's lens omits the Mandate, that is the
protocol refusing to return it — this code could not surface it if it tried.

That distinction is the product, so the demo is built to be checkable rather than impressive.
The "market" lens is answered by a party with no relationship to the fund, not by an investor
who happens to see little.

## Sharing the ledger client

The app imports `../keeper/src/ledger.ts` rather than keeping its own copy, so the auth flows
and the JSON API encodings cannot drift between the CLI and the dashboard. Those encodings —
Decimal and Int64 as strings, `RelTime` as microseconds, tuples as `_1`/`_2` — are exactly the
kind of thing that ends up right in one copy and wrong in the other.

Turbopack is pointed at the repository root for this (`turbopack.root` in `next.config.ts`),
and told that `.ts` specifiers resolve to `.ts` files, which is what Node's type stripping
requires the keeper to write.
