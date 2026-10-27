import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // One folder holds the whole server, for the container image.
  output: "standalone",
  poweredByHeader: false,
  // Next's dev server would otherwise write an AGENTS.md into the repository.
  agentRules: false,
};

export default nextConfig;
