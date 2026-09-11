// Command submission and state queries against the JSON Ledger API v2.
//
// Shapes here are taken from a client that actually worked against this validator, not from
// documentation: the command body nests a second `commands` object, the active-contract-set
// query needs an explicit offset, and results arrive wrapped in `contractEntry.JsActiveContract`.
// None of that is guessable.
//
// One addition Ballast needs that a simpler app does not: `readAs`. The manager submits every
// command, but the fund's assets belong to the vault, and the manager is deliberately NOT
// allowed to act as it. So almost every Ballast submission is actAs manager + readAs vault —
// authority to use the vault's contracts comes from the vault's signature on the Fund, while
// the ability to SEE them has to be requested explicitly.

import { type Conn, bearer } from "./ledger.ts";

async function post<T>(c: Conn, path: string, body?: unknown): Promise<T> {
  const token = await bearer(c);
  const res = await fetch(`${c.baseUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} → ${res.status}: ${text.slice(0, 600)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

/** `<packageId>:<Module>:<Entity>` — how the ledger names a template. */
export const templateId = (pkg: string, module: string, entity: string): string =>
  `${pkg}:${module}:${entity}`;

export interface CreatedEvent {
  contractId: string;
  templateId: string;
  createArgument: Record<string, unknown>;
  signatories?: string[];
  observers?: string[];
}

export async function ledgerEnd(c: Conn): Promise<number> {
  const r = await post<{ offset: number }>(c, "/v2/state/ledger-end");
  return r.offset;
}

/**
 * The active contract set AS SEEN BY `party`.
 *
 * Worth stating plainly because it is the product: this returns what Canton is willing to show
 * that party and nothing else. The three-lens demo is not a UI trick over a filtered query —
 * it is four calls to this function with four different parties.
 */
export async function activeContracts(c: Conn, party: string): Promise<CreatedEvent[]> {
  const activeAtOffset = await ledgerEnd(c);
  const rows = await post<any[]>(c, "/v2/state/active-contracts", {
    filter: { filtersByParty: { [party]: { cumulative: [] } } },
    verbose: false,
    activeAtOffset,
  });
  return (rows ?? [])
    .map((r) => r?.contractEntry?.JsActiveContract?.createdEvent)
    .filter(Boolean) as CreatedEvent[];
}

export interface Submission {
  actAs: string[];
  readAs?: string[];
  label: string;
}

async function submit(c: Conn, s: Submission, commands: unknown[]): Promise<any> {
  return post<any>(c, "/v2/commands/submit-and-wait-for-transaction", {
    commands: {
      userId: c.userId,
      commandId: `ballast-${s.label}-${Date.now()}`,
      actAs: s.actAs,
      ...(s.readAs?.length ? { readAs: s.readAs } : {}),
      commands,
    },
  });
}

/** Pull the created contracts out of a transaction result. */
export function createdIn(tx: any): CreatedEvent[] {
  const events: any[] = tx?.transaction?.events ?? tx?.events ?? [];
  return events
    .map((e) => e?.CreatedEvent ?? e?.created ?? (e?.contractId && e?.templateId ? e : null))
    .filter(Boolean) as CreatedEvent[];
}

export async function create(
  c: Conn,
  s: Submission,
  tid: string,
  createArguments: Record<string, unknown>,
): Promise<CreatedEvent> {
  const tx = await submit(c, s, [{ CreateCommand: { templateId: tid, createArguments } }]);
  const created = createdIn(tx);
  const mine = created.find((e) => e.templateId?.endsWith(tid.split(":").slice(1).join(":")));
  const result = mine ?? created[0];
  if (!result) throw new Error(`create ${tid} returned no created event`);
  return result;
}

export async function exercise(
  c: Conn,
  s: Submission,
  tid: string,
  contractId: string,
  choice: string,
  choiceArgument: Record<string, unknown>,
): Promise<any> {
  return submit(c, s, [{ ExerciseCommand: { templateId: tid, contractId, choice, choiceArgument } }]);
}

// ── Daml value encodings ────────────────────────────────────────────────────
//
// The JSON API is strict about these and the failures are unhelpful, so they get helpers
// rather than being written out at each call site.

/** Numeric/Decimal travels as a STRING. A JSON number loses precision above 2^53 and rounds. */
export const numeric = (d: string): string => d;

/** Int64 travels as a string too — a bare number is rejected. */
export const int64 = (n: number | bigint): string => String(n);

/** RelTime is a record of microseconds, itself an Int64, so also a string. */
export const relTime = (seconds: number) => ({ microseconds: String(Math.round(seconds * 1e6)) });

/** Timestamp is ISO-8601 in UTC. */
export const timestamp = (d: Date = new Date()): string => d.toISOString();

/** Daml's `(a, b)` is DA.Types.Tuple2, which the JSON API spells with _1/_2. */
export const tuple2 = <A, B>(_1: A, _2: B) => ({ _1, _2 });

/**
 * Read the main package id out of a DAR.
 *
 * A package id is derived from the package's content, so it changes every time the Daml
 * changes — which makes a hardcoded constant a bug with a delay on it. (It was: the id was
 * captured before two modules were added, and formation then failed against a ledger that had
 * the DAR loaded, reporting the template as missing.)
 *
 * A DAR is a zip, and zip stores entry names as plain text in its headers, so the id can be
 * read straight out of the bytes without unpacking anything or taking a dependency.
 */
export function packageIdFromDar(dar: Uint8Array, packageName: string): string {
  const text = Buffer.from(dar).toString("latin1");
  const m = text.match(new RegExp(`${packageName}-[0-9.]+-([0-9a-f]{64})\\.dalf`));
  if (!m?.[1]) throw new Error(`could not find the package id for ${packageName} in the DAR`);
  return m[1];
}
