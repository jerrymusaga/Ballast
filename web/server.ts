// The Ballast dashboard server.
//
// It does two things: serve the static app, and answer "what does this party see?" by asking
// the ledger once per party. That second part is the product, so it is worth being precise
// about what this server does NOT do: it never filters. Each lens is a separate
// active-contract-set query submitted as a different party, and what comes back is Canton's
// answer. If the manager's lens shows a contract the investor's does not, that is the
// protocol, not this file.

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import { connFromEnv, listParties } from "../keeper/src/ledger.ts";
import { activeContracts, type CreatedEvent } from "../keeper/src/commands.ts";

const PUBLIC = fileURLToPath(new URL("./public/", import.meta.url));
const PORT = Number(process.env.PORT ?? 5173);

/** The lenses, in the order the story is told. */
const LENSES = [
  { id: "manager", hint: "ballast-manager", label: "Manager", blurb: "Runs the fund. Proposes every trade, decides none of them." },
  { id: "vault", hint: "ballast-vault", label: "Vault", blurb: "The fund itself. Owns every asset; signs, but never acts alone." },
  { id: "investor", hint: "ballast-alice", label: "Investor", blurb: "Holds units. Can prove the rules held without seeing the strategy." },
  { id: "lp", hint: "ballast-lp", label: "Counterparty", blurb: "The dealer on the other side of a block trade. Sees its own leg, at execution." },
  { id: "market", hint: "ballast-market", label: "Market", blurb: "Everyone else. Not a stakeholder on anything, and the ledger returns nothing." },
];

const entity = (tid: string) => tid.split(":").slice(-1)[0] ?? tid;

/** A contract, described for a human, with the one field that matters pulled out. */
function describe(e: CreatedEvent) {
  const a = e.createArgument as Record<string, any>;
  const kind = entity(e.templateId);
  const dec = (v: unknown) => (typeof v === "string" ? String(Number(v)) : String(v ?? ""));
  switch (kind) {
    case "Fund": return { kind, headline: a.fundId, detail: `${(a.investors ?? []).length} investors` };
    case "Mandate": return { kind, headline: `v${a.version} · PRIVATE`, detail: `${(a.targets ?? []).length} target weights, band ${dec(a.driftBand)}`, secret: true };
    case "MandateBounds": return { kind, headline: `v${a.version}`, detail: `band ${dec(a.driftBand)}, cap ${dec(a.maxWeight)}, ${(a.universe ?? []).length} instruments` };
    case "NavRecord": return { kind, headline: dec(a.nav), detail: `as of ${String(a.asOf).slice(0, 19).replace("T", " ")}` };
    case "Position": return { kind, headline: `${dec(a.units)} units`, detail: a.fundId };
    case "UnitLedger": return { kind, headline: `${dec(a.totalUnits)} units`, detail: "in issue" };
    case "VaultIndex": return { kind, headline: `${(a.holdings ?? []).length} holdings`, detail: `${(a.pending ?? []).length} reserved` };
    case "ComplianceRecord": return { kind, headline: `mandate v${a.mandateVersion}`, detail: `NAV ${dec(a.navBefore)} → ${dec(a.navAfter)}` };
    case "PriceSet": return { kind, headline: `${(a.prices ?? []).length} instruments`, detail: `as of ${String(a.asOf).slice(0, 19).replace("T", " ")}` };
    default:
      if (a.instrumentId && a.amount !== undefined) {
        return { kind: "Holding", headline: `${dec(a.amount)} ${a.instrumentId.id}`, detail: "CIP-56 registry asset" };
      }
      return { kind, headline: kind, detail: "" };
  }
}

async function lenses() {
  const c = connFromEnv();
  const all = await listParties(c);
  const out = [];
  for (const lens of LENSES) {
    const party = all.find((p) => p.startsWith(`${lens.hint}::`));
    const seen = party ? await activeContracts(c, party) : [];
    out.push({
      ...lens,
      party: party ?? null,
      count: seen.length,
      contracts: seen.map(describe).sort((x, y) => x.kind.localeCompare(y.kind)),
    });
  }
  return { ledger: c.baseUrl, lenses: out };
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  try {
    if (url.pathname === "/api/lenses") {
      const data = await lenses();
      res.writeHead(200, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
      return res.end(JSON.stringify(data));
    }
    if (url.pathname === "/api/health") {
      const c = connFromEnv();
      const r = await fetch(`${c.baseUrl}/v2/version`);
      const v = (await r.json()) as { version?: string };
      res.writeHead(200, { "Content-Type": MIME[".json"], "Cache-Control": "no-store" });
      return res.end(JSON.stringify({ ok: r.ok, ledger: c.baseUrl, version: v.version ?? null }));
    }

    // Static. Everything unknown falls through to the app shell so client routing works.
    const rel = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const safe = normalize(rel).replace(/^(\.\.[/\\])+/, "");
    let file = join(PUBLIC, safe);
    let body: Buffer;
    try {
      body = await readFile(file);
    } catch {
      file = join(PUBLIC, "index.html");
      body = await readFile(file);
    }
    res.writeHead(200, { "Content-Type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(body);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.writeHead(502, { "Content-Type": MIME[".json"] });
    res.end(JSON.stringify({ error: message }));
  }
});

server.listen(PORT, () => {
  console.log(`Ballast dashboard → http://localhost:${PORT}`);
  console.log(`ledger            → ${process.env.LEDGER_API_URL ?? "(unset — see keeper/.env.example)"}`);
});
