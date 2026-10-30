import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * firestore.rules, checked on the Firestore emulator (run only when FIRESTORE_EMULATOR_HOST is
 * set): no browser or other client may read or write any document, signed in or not. Truce's
 * server uses the admin SDK, which rules don't apply to.
 */

const host = process.env.FIRESTORE_EMULATOR_HOST;
const project = `demo-rules-${Date.now()}`;
const base = `http://${host}/v1/projects/${project}/databases/(default)/documents`;

/** An ID token the emulator accepts for a signed-in client (unsigned, as the emulator allows). */
function clientToken(uid: string): string {
  const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  return `${part({ alg: "none", typ: "JWT" })}.${part({
    sub: uid,
    user_id: uid,
    aud: project,
    iss: `https://securetoken.google.com/${project}`,
    iat: now,
    exp: now + 3600,
    auth_time: now,
  })}.`;
}

describe.skipIf(!host)("the Firestore security rules", () => {
  it("load into the emulator", async () => {
    const rules = readFileSync(join(process.cwd(), "firestore.rules"), "utf8");
    const response = await fetch(`http://${host}/emulator/v1/projects/${project}:securityRules`, {
      method: "PUT",
      body: JSON.stringify({ rules: { files: [{ content: rules }] } }),
    });
    expect(response.ok).toBe(true);
  });

  it.each([
    ["signed out", undefined],
    ["signed in", clientToken("someone")],
  ])("refuse every client read and write, %s", async (_who, token) => {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    for (const path of ["shops/sh_x", "users/someone", "shops/sh_x/secrets/paypal", "cache/k"]) {
      const read = await fetch(`${base}/${path}`, { headers });
      expect(read.status).toBe(403);
      const write = await fetch(`${base}/${path}`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ fields: { name: { stringValue: "x" } } }),
      });
      expect(write.status).toBe(403);
    }
    const list = await fetch(`${base}/shops`, { headers });
    expect(list.status).toBe(403);
  });
});
