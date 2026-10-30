import { describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));

const { checkOrigin, clientIp } = await import("./guard");
const { sessionCookieOptions, sessionEnded } = await import("./session");
const { testUser } = await import("@/server/testing/shops");

const post = (headers: Record<string, string>, url = "https://truce.example.com/api/me") =>
  new Request(url, { method: "POST", headers });

describe("the origin check", () => {
  it("lets Truce's own pages through, and reads alone always", () => {
    expect(() => checkOrigin(post({ origin: "https://truce.example.com" }))).not.toThrow();
    expect(() => checkOrigin(new Request("https://truce.example.com/api/me"))).not.toThrow();
    // Behind Cloud Run the request may name another host; the forwarded host counts.
    expect(() =>
      checkOrigin(
        post(
          { origin: "https://truce-abc.run.app", "x-forwarded-host": "truce-abc.run.app" },
          "http://0.0.0.0:8080/api/me",
        ),
      ),
    ).not.toThrow();
    expect(() => checkOrigin(post({ "sec-fetch-site": "same-origin" }))).not.toThrow();
  });

  it("turns away other sites, null origins, and requests that say nothing", () => {
    const refused: Record<string, string>[] = [
      { origin: "https://evil.example" },
      { origin: "https://truce.example.com.evil.example" },
      { origin: "null" },
      { "sec-fetch-site": "cross-site" },
      {},
    ];
    for (const headers of refused) {
      expect(() => checkOrigin(post(headers))).toThrow(
        expect.objectContaining({ status: 403, code: "bad_origin" }),
      );
    }
  });

  it("takes the first forwarded address for limits", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.7, 10.0.0.1" }))).toBe(
      "198.51.100.7",
    );
    expect(clientIp(new Headers())).toBe("local");
  });
});

describe("sessions", () => {
  it("are httpOnly and lax, secure in production, and last five days", () => {
    expect(sessionCookieOptions(undefined, false)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 5 * 24 * 60 * 60,
    });
    expect(sessionCookieOptions(60, true).secure).toBe(true);
  });

  it("end for every session issued before 'sign out everywhere'", () => {
    const user = testUser("u", { sessionsValidAfter: "2026-10-29T10:00:01.000Z" });
    expect(sessionEnded(user, Date.parse("2026-10-29T10:00:00.000Z") / 1000)).toBe(true);
    expect(sessionEnded(user, Date.parse("2026-10-29T10:00:01.000Z") / 1000)).toBe(false);
    expect(sessionEnded(testUser("u"), 0)).toBe(false);
  });
});
