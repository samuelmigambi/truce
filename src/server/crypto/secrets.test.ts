import { describe, expect, it } from "vitest";
import { encryptionReady, openSecret, sealSecret, SecretError } from "./secrets";

const key = (fill: number) => Buffer.alloc(32, fill).toString("base64");
const env = { TRUCE_ENCRYPTION_KEY: key(1) };

describe("sealing secrets", () => {
  it("round-trips, and the stored form never holds the secret", () => {
    const sealed = sealSecret("paypal-secret-value", "paypal:sh_1:hash", new Date(0), env);
    expect(sealed).toMatchObject({ v: 1, alg: "A256GCM", createdAt: "1970-01-01T00:00:00.000Z" });
    expect(JSON.stringify(sealed)).not.toContain("paypal-secret-value");
    expect(openSecret(sealed, "paypal:sh_1:hash", env)).toBe("paypal-secret-value");
  });

  it("uses a fresh data key and IV every time", () => {
    const a = sealSecret("same", "c", new Date(0), env);
    const b = sealSecret("same", "c", new Date(0), env);
    expect(a.data).not.toBe(b.data);
    expect(a.key.data).not.toBe(b.key.data);
    expect(a.iv).not.toBe(b.iv);
  });

  it("won't open for another shop, after tampering, or with the wrong key", () => {
    const sealed = sealSecret("s3cret", "paypal:sh_1:hash", new Date(0), env);
    expect(() => openSecret(sealed, "paypal:sh_2:hash", env)).toThrow(SecretError);
    const flipped = Buffer.from(sealed.data, "base64");
    flipped[0] = flipped[0]! ^ 1;
    expect(() =>
      openSecret({ ...sealed, data: flipped.toString("base64") }, "paypal:sh_1:hash", env),
    ).toThrow(SecretError);
    expect(() => openSecret(sealed, "paypal:sh_1:hash", { TRUCE_ENCRYPTION_KEY: key(2) })).toThrow(
      /isn't available/,
    );
  });

  it("opens envelopes sealed with the previous key while keys rotate", () => {
    const sealed = sealSecret("old", "c", new Date(0), { TRUCE_ENCRYPTION_KEY: key(3) });
    const rotated = { TRUCE_ENCRYPTION_KEY: key(4), TRUCE_ENCRYPTION_KEY_PREVIOUS: key(3) };
    expect(openSecret(sealed, "c", rotated)).toBe("old");
    expect(sealSecret("new", "c", new Date(0), rotated).kid).not.toBe(sealed.kid);
  });

  it("says when there's no usable key", () => {
    expect(encryptionReady({})).toBe(false);
    expect(encryptionReady({ TRUCE_ENCRYPTION_KEY: "too-short" })).toBe(false);
    expect(encryptionReady({ TRUCE_ENCRYPTION_KEY: "a".repeat(64) })).toBe(true);
    expect(() => sealSecret("x", "c", new Date(0), {})).toThrow(/isn't set/);
  });
});
