import path from "node:path";
import type { NextConfig } from "next";

// The ledger client lives in ../keeper and is shared with the CLI tooling. Duplicating the
// auth flows and command encodings into the web app would guarantee the two drift apart, and
// those encodings are exactly the kind of thing that ends up right in one copy and wrong in
// the other. So the bundler is pointed at the repository root and told that `.ts` specifiers
// resolve to `.ts` files — which is what Node's type stripping requires the keeper to write.
const config: NextConfig = {
  turbopack: {
    root: path.join(import.meta.dirname, ".."),
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".mjs", ".json"],
  },
  experimental: { externalDir: true },
  reactStrictMode: true,
};

export default config;
