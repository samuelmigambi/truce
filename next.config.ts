import type { NextConfig } from "next";

/** Headers on every answer: no framing (so nobody can overlay the approve buttons), no sniffing. */
const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  ...(process.env.NODE_ENV === "production"
    ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }]
    : []),
];

const nextConfig: NextConfig = {
  // One folder holds the whole server, for the container image.
  output: "standalone",
  poweredByHeader: false,
  // Next's dev server would otherwise write an AGENTS.md into the repository.
  agentRules: false,
  // The dev server only serves live reload to localhost; these let 127.0.0.1 and the network
  // address it prints (a phone on the same Wi-Fi) reload on save too. Dev only.
  allowedDevOrigins: ["127.0.0.1", "192.168.*.*"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
