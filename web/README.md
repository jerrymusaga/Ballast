# Ballast dashboard

A landing page and a lens viewer. No build step, no dependencies — Node 22.6+ serves the
TypeScript directly and the front end is plain JavaScript and hand-written CSS. A demo that
cannot fail to start is worth more than a fashionable toolchain.

    # a ledger must be running; a local sandbox is enough
    cd ledger && daml sandbox --json-api-port 7575 --dar ballast/.daml/dist/ballast-0.1.0.dar
    cd keeper && LEDGER_API_URL=http://localhost:7575 npm run provision:apply
    #            ... and formation, see keeper/README.md

    cd web && LEDGER_API_URL=http://localhost:7575 npm run dev   # → http://localhost:5173

## The one thing this server does not do

It never filters. Each lens is a separate `/v2/state/active-contracts` query submitted as a
different party, and what comes back is Canton's answer. When the investor's lens omits the
Mandate, that is the protocol refusing to return it — this code could not show it if it tried.

That distinction is the product, so the demo is arranged to be checkable rather than
impressive: the "market" lens is answered by a party with no relationship to the fund at all,
not by an investor who happens to see little. An earlier version pointed it at a real investor
and reported that the market could see two contracts, which flattered nothing and misstated
the claim.
