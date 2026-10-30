#!/usr/bin/env node
/**
 * Runs the dev server with the real services: reads the keys from Google Secret Manager and the
 * Firebase web config from the Firebase Management API into the server's environment only, then
 * starts `next dev -p 3100`. Values are never printed, logged or written to disk.
 *
 *   npm run dev:live                 # real Firebase sign-in
 *   npm run dev:live -- --emulator   # sign-in on the local Auth emulator (127.0.0.1:9099), for test accounts
 *
 * Needs `gcloud` signed in with access to the truce-disputes project. A variable that's already
 * set in your shell wins over the stored one.
 */
import { execSync, spawn } from "node:child_process";
import { createRequire } from "node:module";

const PROJECT = "truce-disputes";
const SECRETS = [
  { env: "NEBIUS_API_KEY", secret: "truce-nebius-api-key" },
  { env: "PAYPAL_CLIENT_ID", secret: "truce-paypal-client-id" },
  { env: "PAYPAL_CLIENT_SECRET", secret: "truce-paypal-client-secret" },
  { env: "TAVILY_API_KEY", secret: "truce-tavily-api-key" },
  { env: "TRUCE_ENCRYPTION_KEY", secret: "truce-encryption-key" },
  { env: "TRUCE_JOB_KEY", secret: "truce-job-key", optional: true },
];

/** Runs gcloud through the shell (so gcloud.cmd is found on Windows); the arguments are fixed strings. */
function gcloud(args) {
  try {
    const value = execSync(`gcloud ${args}`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      windowsHide: true,
    });
    return value.trim() || null;
  } catch {
    return null;
  }
}

/** The secret's latest version, or null when it doesn't exist or can't be read. */
function readSecret(secret) {
  return gcloud(`secrets versions access latest --secret=${secret} --project=${PROJECT}`);
}

/** The first Firebase web app's public config (API key, auth domain, app ID), or null. */
async function firebaseWebConfig() {
  const token = gcloud("auth print-access-token");
  if (!token) return null;
  const headers = { Authorization: `Bearer ${token}`, "x-goog-user-project": PROJECT };
  try {
    const base = `https://firebase.googleapis.com/v1beta1/projects/${PROJECT}/webApps`;
    const apps = await (await fetch(base, { headers })).json();
    const app = apps.apps?.find((a) => a.state === "ACTIVE") ?? apps.apps?.[0];
    if (!app?.appId) return null;
    return await (await fetch(`${base}/${app.appId}/config`, { headers })).json();
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

if (!env.FIREBASE_API_KEY?.trim()) {
  const web = await firebaseWebConfig();
  if (web?.apiKey) {
    env.FIREBASE_API_KEY = web.apiKey;
    env.FIREBASE_AUTH_DOMAIN = env.FIREBASE_AUTH_DOMAIN || web.authDomain;
    env.FIREBASE_APP_ID = env.FIREBASE_APP_ID || web.appId;
    console.log("  FIREBASE_API_KEY, _AUTH_DOMAIN, _APP_ID: from the Firebase web app");
  } else {
    console.log("  FIREBASE_API_KEY: not found (sign-in will say it isn't set up)");
  }
}

if (process.argv.includes("--emulator")) {
  env.FIREBASE_AUTH_EMULATOR_HOST = env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
  console.log(`  Sign-in: the Auth emulator at ${env.FIREBASE_AUTH_EMULATOR_HOST}`);
}
// Local credentials are a person's, so Firebase Auth's admin calls need a project to bill.
env.GOOGLE_CLOUD_QUOTA_PROJECT = env.GOOGLE_CLOUD_QUOTA_PROJECT || PROJECT;
env.SITE_URL = env.SITE_URL || "http://localhost:3100";

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
