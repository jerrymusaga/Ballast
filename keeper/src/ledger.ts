// JSON Ledger API v2 client for the Seaport-hosted Canton validator.
//
// Small on purpose: only the calls Ballast actually makes. Every gotcha below cost real time
// on the previous project, so each is commented where it bites rather than in a wiki nobody
// reads.

/**
 * How to obtain a token.
 *
 * Two flows, because two kinds of ledger need two different things:
 *
 *  - `client_credentials` — a machine identity with its own secret. What a validator you
 *    operate yourself typically issues.
 *  - `password` / `refresh_token` — a HUMAN identity: you authenticate as yourself and the
 *    ledger acts on your behalf. This is what a shared node handed out to many participants
 *    uses, because there is no per-app secret to issue — each person already has an account.
 *    Exchange the password once for a refresh token, keep only that, and never store the
 *    password.
 */
export type Credentials =
  | { grant: "client_credentials"; clientId: string; clientSecret: string }
  | { grant: "password"; clientId: string; username: string; password: string }
  | { grant: "refresh_token"; clientId: string; refreshToken: string };

export interface Conn {
  baseUrl: string;
  /** OIDC settings. Absent for an unauthenticated ledger, such as a local sandbox. */
  auth?: {
    tokenUrl: string;
    scope: string;
    audience?: string;
    credentials: Credentials;
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
  const scope = env.OIDC_SCOPE ?? "daml_ledger_api";

  // A local sandbox runs without auth. Treating that as a first-class case rather than a
  // special one means the deploy path can be exercised in full — upload, parties, rights,
  // submission, disclosure — without credentials to any hosted validator.
  const hasSecret = Boolean(env.OIDC_CLIENT_SECRET);
  const hasRefresh = Boolean(env.OIDC_REFRESH_TOKEN);
  const hasPassword = Boolean(env.OIDC_USERNAME && env.OIDC_PASSWORD);
  if (!hasSecret && !hasRefresh && !hasPassword) {
    return { baseUrl, userId: env.LEDGER_USER_ID ?? "participant_admin" };
  }

  const clientId = need("OIDC_CLIENT_ID");
  const credentials: Credentials = hasRefresh
    ? { grant: "refresh_token", clientId, refreshToken: need("OIDC_REFRESH_TOKEN") }
    : hasSecret
      ? { grant: "client_credentials", clientId, clientSecret: need("OIDC_CLIENT_SECRET") }
      : { grant: "password", clientId, username: need("OIDC_USERNAME"), password: need("OIDC_PASSWORD") };

  return {
    baseUrl,
    auth: { tokenUrl: need("OIDC_TOKEN_URL"), scope, audience: env.OIDC_AUDIENCE, credentials },
    // On a shared node the ledger user IS the authenticated subject, so it comes from the
    // token's `sub` claim rather than being configured. Left unset, it is filled in on first
    // authentication.
    userId: env.LEDGER_USER_ID ?? "",
  };
}

/** Read a JWT's claims without verifying it — we only want `sub`, which the issuer set. */
function claims(jwt: string): Record<string, unknown> {
  try {
    const part = jwt.split(".")[1] ?? "";
    const padded = part.padEnd(part.length + ((4 - (part.length % 4)) % 4), "=");
    return JSON.parse(Buffer.from(padded, "base64url").toString("utf8"));
  } catch {
    return {};
  }
}

/**
 * The refresh token obtained by a password exchange.
 *
 * Kept so a password need never be stored: exchange it once, keep this, and every later run
 * authenticates without it.
 */
export let lastRefreshToken = "";

let cached: { token: string; expiresAt: number } | null = null;

/** Client-credentials token, cached until shortly before it expires. Empty when unauthenticated. */
export async function bearer(c: Conn): Promise<string> {
  if (!c.auth) return "";
  if (cached && Date.now() < cached.expiresAt) return cached.token;

  const cr = c.auth.credentials;
  const body = new URLSearchParams({
    grant_type: cr.grant,
    client_id: cr.clientId,
    scope: c.auth.scope,
    ...(c.auth.audience ? { audience: c.auth.audience } : {}),
    ...(cr.grant === "client_credentials" ? { client_secret: cr.clientSecret } : {}),
    ...(cr.grant === "password" ? { username: cr.username, password: cr.password } : {}),
    ...(cr.grant === "refresh_token" ? { refresh_token: cr.refreshToken } : {}),
  });
  const res = await fetch(c.auth.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`token request failed ${res.status}: ${text.slice(0, 300)}`);
  const json = JSON.parse(text) as {
    access_token: string;
    expires_in?: number;
    refresh_token?: string;
  };
  if (json.refresh_token) lastRefreshToken = json.refresh_token;

  // On a shared node the ledger user is whoever authenticated, so take it from the token
  // rather than making the operator paste a subject id they would have to look up.
  if (!c.userId) {
    const sub = claims(json.access_token).sub;
    if (typeof sub === "string" && sub) c.userId = sub;
  }

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
