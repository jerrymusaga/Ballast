// JSON Ledger API v2 client for the Seaport-hosted Canton validator.
//
// Small on purpose: only the calls Ballast actually makes. Every gotcha below cost real time
// on the previous project, so each is commented where it bites rather than in a wiki nobody
// reads.

export interface Conn {
  baseUrl: string;
  /** OIDC settings. Absent for an unauthenticated ledger, such as a local sandbox. */
  auth?: {
    tokenUrl: string;
    clientId: string;
    clientSecret: string;
    scope: string;
    audience: string;
  };
  /** The ledger user the token authenticates as. Commands MUST be submitted as this user. */
  userId: string;
}

export function connFromEnv(env: Record<string, string | undefined> = process.env): Conn {
  const need = (k: string): string => {
    const v = env[k];
    if (!v) throw new Error(`missing ${k} — see keeper/.env.example`);
    return v;
  };
  const baseUrl = need("LEDGER_API_URL").replace(/\/$/, "");

  // A local sandbox runs without auth. Treating that as a first-class case rather than a
  // special one means the deploy path can be exercised in full — upload, parties, rights,
  // submission, disclosure — without needing credentials to a hosted validator.
  if (!env.OIDC_CLIENT_SECRET) {
    return { baseUrl, userId: env.LEDGER_USER_ID ?? "participant_admin" };
  }

  return {
    baseUrl,
    auth: {
      tokenUrl: need("OIDC_TOKEN_URL"),
      clientId: need("OIDC_CLIENT_ID"),
      clientSecret: need("OIDC_CLIENT_SECRET"),
      scope: env.OIDC_SCOPE ?? "daml_ledger_api",
      audience: env.OIDC_AUDIENCE ?? need("OIDC_CLIENT_ID"),
    },
    userId: env.LEDGER_USER_ID ?? "6",
  };
}

let cached: { token: string; expiresAt: number } | null = null;

/** Client-credentials token, cached until shortly before it expires. Empty when unauthenticated. */
export async function bearer(c: Conn): Promise<string> {
  if (!c.auth) return "";
  if (cached && Date.now() < cached.expiresAt) return cached.token;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: c.auth.clientId,
    client_secret: c.auth.clientSecret,
    scope: c.auth.scope,
    audience: c.auth.audience,
  });
  const res = await fetch(c.auth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token request failed ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as { access_token: string; expires_in?: number };
  // Refresh a minute early rather than discovering expiry mid-submission.
  const ttl = (json.expires_in ?? 3600) * 1000 - 60_000;
  cached = { token: json.access_token, expiresAt: Date.now() + ttl };
  return json.access_token;
}

async function api<T>(c: Conn, path: string, init?: RequestInit): Promise<T> {
  const token = await bearer(c);
  const res = await fetch(`${c.baseUrl}${path}`, {
    ...init,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.body && !(init.body instanceof Uint8Array)
        ? { "Content-Type": "application/json" }
        : {}),
      ...init?.headers,
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${init?.method ?? "GET"} ${path} → ${res.status}: ${text.slice(0, 500)}`);
  return (text ? JSON.parse(text) : undefined) as T;
}

export const version = (c: Conn) => api<unknown>(c, "/v2/version");

// ── packages ────────────────────────────────────────────────────────────────

export async function listPackages(c: Conn): Promise<string[]> {
  const j = await api<any>(c, "/v2/packages");
  return Array.isArray(j) ? j : (j?.packageIds ?? j?.package_ids ?? []);
}

/** Upload a DAR. Body is raw bytes, not JSON, not multipart. */
export async function uploadDar(c: Conn, dar: Uint8Array): Promise<void> {
  const token = await bearer(c);
  const res = await fetch(`${c.baseUrl}/v2/packages`, {
    method: "POST",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type": "application/octet-stream",
    },
    body: dar as unknown as BodyInit,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`DAR upload → ${res.status}: ${text.slice(0, 500)}`);
}

// ── parties ─────────────────────────────────────────────────────────────────

export interface PartyDetails {
  party: string;
}

export async function listParties(c: Conn): Promise<string[]> {
  const j = await api<{ partyDetails?: PartyDetails[] }>(c, "/v2/parties");
  return (j.partyDetails ?? []).map((p) => p.party);
}

export async function allocateParty(c: Conn, hint: string): Promise<string> {
  const j = await api<{ partyDetails?: PartyDetails }>(c, "/v2/parties", {
    method: "POST",
    body: JSON.stringify({ partyIdHint: hint, identityProviderId: "" }),
  });
  const party = j.partyDetails?.party;
  if (!party) throw new Error(`party allocation returned nothing for hint "${hint}"`);
  return party;
}

// ── user rights ─────────────────────────────────────────────────────────────
//
// This is where the whole security model is enforced operationally, so it gets its own type
// rather than a boolean. Granting CanActAs on the vault would let the manager move fund assets
// directly, and every guarantee the mandate makes would become decoration.

export type Right =
  | { kind: "actAs"; party: string }
  | { kind: "readAs"; party: string };

const encodeRight = (r: Right) =>
  r.kind === "actAs"
    ? { kind: { CanActAs: { value: { party: r.party } } } }
    : { kind: { CanReadAs: { value: { party: r.party } } } };

/** Grant rights to the ledger user commands are submitted as. */
export async function grantRights(c: Conn, rights: Right[]): Promise<void> {
  // Three things this body needs that are easy to miss, each a 400 with a terse message:
  // the userId goes in the path AND the body, and `identityProviderId` is required even when
  // it is the empty string for the default provider.
  await api(c, `/v2/users/${encodeURIComponent(c.userId)}/rights`, {
    method: "POST",
    body: JSON.stringify({
      userId: c.userId,
      identityProviderId: "",
      rights: rights.map(encodeRight),
    }),
  });
}

export async function listRights(c: Conn): Promise<unknown> {
  return api(c, `/v2/users/${encodeURIComponent(c.userId)}/rights`);
}

/**
 * Revoke rights. The endpoint is PATCH on the same path — not DELETE, which returns 405, and
 * not a /revoke sub-path, which does not exist. Found by probing a local sandbox.
 *
 * This is how the vault's formation-time actAs grant is actually removed, rather than merely
 * reported. Leaving it in place is the single worst misconfiguration available here.
 */
export async function revokeRights(c: Conn, rights: Right[]): Promise<Right[]> {
  const r = await api<{ newlyRevokedRights?: unknown[] }>(
    c,
    `/v2/users/${encodeURIComponent(c.userId)}/rights`,
    {
      method: "PATCH",
      body: JSON.stringify({
        userId: c.userId,
        identityProviderId: "",
        rights: rights.map(encodeRight),
      }),
    },
  );
  return (r.newlyRevokedRights ?? []).length > 0 ? rights : [];
}
