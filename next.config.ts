import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // firebase-admin uses jose v5 (ESM-only) via jwks-rsa.
  // Bundling it causes ERR_REQUIRE_ESM on Vercel — tell Next.js to leave it
  // as a native Node.js import instead of bundling through Webpack/Turbopack.
  serverExternalPackages: ["firebase-admin"],
};

export default nextConfig;
