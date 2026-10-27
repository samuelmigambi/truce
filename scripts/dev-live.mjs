#!/usr/bin/env node
/**
 * Runs the dev server with the real keys, for recording against the PayPal sandbox:
 * reads them from Google Secret Manager into the server's environment only, then starts
 * `next dev -p 3100`. Values are never printed, logged or written to disk.
 *
 *   npm run dev:live
 *
 * Needs `gcloud` signed in with access to the truce-disputes project. A variable that's already
 * set in your shell wins over the stored secret.
 */
import { execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";

const PROJECT = "truce-disputes";
const SECRETS = [
  { env: "NEBIUS_API_KEY", secret: "truce-nebius-api-key" },
  { env: "PAYPAL_CLIENT_ID", secret: "truce-paypal-client-id" },
  { env: "PAYPAL_CLIENT_SECRET", secret: "truce-paypal-client-secret" },
  { env: "TAVILY_API_KEY", secret: "truce-tavily-api-key" },
  { env: "TRUCE_OWNER_KEY", secret: "truce-owner-key", optional: true },
];

/** The secret's latest version, or null when it doesn't exist or can't be read. */
function readSecret(secret) {
  try {
    // Through the shell, so gcloud.cmd is found on Windows; the names above are fixed strings.
    const value = execSync(
      `gcloud secrets versions access latest --secret=${secret} --project=${PROJECT}`,
      {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      },
    );
    return value.trim() || null;
  } catch {
    return null;
  }
}

const env = { ...process.env };
const missing = [];
for (const { env: name, secret, optional } of SECRETS) {
  if (env[name]?.trim()) {
    console.log(`  ${name}: from your shell`);
    continue;
  }
  const value = readSecret(secret);
  if (value) {
    env[name] = value;
    console.log(`  ${name}: from Secret Manager (${secret})`);
  } else {
    console.log(`  ${name}: not found${optional ? " (optional, skipped)" : ""}`);
    if (!optional) missing.push(secret);
  }
}
if (missing.length) {
  console.log(
    `\nCouldn't read ${missing.join(", ")}. Check \`gcloud auth login\` and access to ${PROJECT}.`,
  );
}

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, "dev", "-p", "3100"], { env, stdio: "inherit" });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
