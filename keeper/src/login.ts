// Exchange a password for a refresh token, once.
//
// A password should not live in a config file that a process reads on every run. Where the
// ledger authenticates people rather than applications, the right shape is to authenticate
// interactively one time, keep the refresh token, and forget the password — so this prints the
// token and tells you to remove the password, rather than writing either anywhere itself.
//
//   npm run login

import { bearer, connFromEnv, lastRefreshToken } from "./ledger.ts";
import { ledgerEnd } from "./commands.ts";

async function main() {
  const c = connFromEnv();
  if (!c.auth) {
    console.log("No credentials configured — this ledger is unauthenticated. Nothing to do.");
    return;
  }
  console.log(`ledger: ${c.baseUrl}`);
  console.log(`grant:  ${c.auth.credentials.grant}\n`);

  await bearer(c);
  console.log(`authenticated as: ${c.userId || "(no subject in token)"}`);

  // Prove the token is good for the thing we actually need it for, not just for the token
  // endpoint. An accepted login that the ledger then rejects is a worse failure than no login.
  const offset = await ledgerEnd(c);
  console.log(`ledger reachable: offset ${offset}`);

  if (lastRefreshToken) {
    console.log("\nPut this in .env, then DELETE OIDC_PASSWORD:\n");
    console.log(`OIDC_REFRESH_TOKEN=${lastRefreshToken}`);
    if (c.userId) console.log(`LEDGER_USER_ID=${c.userId}`);
  } else {
    console.log("\nNo refresh token was issued. If you expected one, add `offline_access` to OIDC_SCOPE.");
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error(`\nfailed: ${msg}`);
  if (/invalid_grant/.test(msg)) {
    console.error("  invalid_grant with a password grant usually means the username or password is wrong.");
    console.error("  invalid_scope: drop OIDC_SCOPE and retry, then add scopes back one at a time.");
  }
  process.exit(1);
});
