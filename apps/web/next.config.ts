import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // typescript.ignoreBuildErrors removed in Wave B7 (Phase 6) — typecheck is clean (see gates).
  // If future drift appears, fix at source rather than suppressing.

  // Wave C4: Minimal security headers (non-breaking for Clerk + Resend flows)
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "X-Frame-Options",
            value: "DENY",
          },
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          // CSP tuned for Clerk (accounts.clerk.com, clerk.com) + Resend (resend.com) + self
          // Note: 'unsafe-inline' for shadcn/radix styles in dev; tighten in future if nonce feasible.
          {
            key: "Content-Security-Policy",
            value:
              "default-src 'self'; " +
              "script-src 'self' 'unsafe-eval' 'unsafe-inline' https://*.clerk.com https://*.clerk.accounts.dev https://challenges.cloudflare.com; " +
              "style-src 'self' 'unsafe-inline'; " +
              "img-src 'self' data: https:; " +
              "font-src 'self' data:; " +
              "connect-src 'self' https://*.clerk.com https://*.clerk.accounts.dev https://api.resend.com https://*.ingest.sentry.io; " +
              "frame-src 'self' https://*.clerk.com https://challenges.cloudflare.com; " +
              // Critical for Clerk: allow blob: workers (used for WebAuthn, passkeys, etc.)
              // Without this, Clerk spawns blob workers that get blocked by the script-src fallback.
              "worker-src 'self' blob: https://*.clerk.com https://*.clerk.accounts.dev;",
          },
        ],
      },
    ];
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://github.com/getsentry/sentry-webpack-plugin#options

  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/product/crons/
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/#widen-the-scope-of-your-source-maps
  widenClientFileUpload: true,

  // Uncomment the line below to enable Spotlight (https://spotlightjs.com)
  // spotlight: process.env.NODE_ENV === "development",
});
