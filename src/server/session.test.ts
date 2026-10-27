import { beforeEach, describe, expect, it, vi } from "vitest";

/** A cookie jar and request headers standing in for next/headers. */
const jar = new Map<string, { value: string; options?: Record<string, unknown> }>();
const requestHeaders = new Headers();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)!.value } : undefined),
    set: (name: string, value: string, options?: Record<string, unknown>) =>
      jar.set(name, { value, options }),
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () => requestHeaders,
}));

process.env.TRUCE_STORE = "memory";
process.env.TRUCE_OWNER_KEY = "owner-key-for-tests";

const session = await import("./session");
const { memoryStore } = await import("./store/memory");
const { SEED_VERSION } = await import("./demo/seed");

beforeEach(() => {
  jar.clear();
  memoryStore().reset();
});

describe("cookie settings", () => {
  it("are httpOnly and lax, and secure only in production", () => {
    expect(session.cookieOptions(60, false)).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: 60,
    });
    expect(session.cookieOptions(60, true).secure).toBe(true);
  });
});

describe("IDs and the owner key", () => {
  it("makes unguessable demo IDs and checks their shape", () => {
    const a = session.newDemoId();
    expect(session.isDemoId(a)).toBe(true);
    expect(a).not.toBe(session.newDemoId());
    expect(session.isDemoId("live")).toBe(false);
    expect(session.isDemoId("demo-../../x")).toBe(false);
    expect(session.isDemoId(undefined)).toBe(false);
  });

  it("compares secrets of any length safely", () => {
    expect(session.safeEqual("same", "same")).toBe(true);
    expect(session.safeEqual("same", "different")).toBe(false);
    expect(session.safeEqual("", "x")).toBe(false);
  });

  it("signs the owner cookie with the key, so it can't be forged or outlive a new key", () => {
    const token = session.ownerToken("k1");
    expect(token).not.toContain("k1");
    expect(session.isOwnerToken(token, "k1")).toBe(true);
    expect(session.isOwnerToken("1", "k1")).toBe(false);
    expect(session.isOwnerToken(token, "k2")).toBe(false);
    expect(session.isOwnerToken(token, null)).toBe(false);
  });

  it("reads the visitor's address from the proxy's header", () => {
    expect(session.clientIp(new Headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe(
      "203.0.113.9",
    );
    expect(session.clientIp(new Headers())).toBe("local");
  });
});

describe("currentWorkspace", () => {
  it("makes, seeds and remembers a demo copy on the first visit", async () => {
    const first = await session.currentWorkspace();
    expect(first.kind).toBe("demo");
    expect(first.seedVersion?.startsWith(`${SEED_VERSION}@`)).toBe(true);
    expect(Date.parse(first.expiresAt!) - Date.parse(first.createdAt)).toBe(7 * 24 * 3600_000);
    const cookie = jar.get(session.WORKSPACE_COOKIE)!;
    expect(cookie.value).toBe(first.id);
    expect(cookie.options).toMatchObject({
      httpOnly: true,
      sameSite: "lax",
      maxAge: 7 * 24 * 3600,
    });
    expect(await memoryStore().listCases(first.id)).toHaveLength(17);

    const again = await session.currentWorkspace();
    expect(again).toEqual(first);
  });

  it("re-seeds a copy that has expired, keeping its ID", async () => {
    const first = await session.currentWorkspace();
    await memoryStore().saveWorkspace({ ...first, expiresAt: "2020-01-01T00:00:00.000Z" });
    await memoryStore().saveCase(first.id, {
      ...(await memoryStore().getCase(first.id, "demo-inr-86"))!,
      status: "closed",
    });
    const fresh = await session.currentWorkspace();
    expect(fresh.id).toBe(first.id);
    expect(Date.parse(fresh.expiresAt!)).toBeGreaterThan(Date.now());
    expect((await memoryStore().getCase(first.id, "demo-inr-86"))!.status).toBe("needs_you");
  });

  it("counts a cookie for a copy that's gone as a new copy, keeping its ID", async () => {
    const used = () => memoryStore().increment("rate:new-copy:local", 0, 3600);
    await session.currentWorkspace();
    expect(await used()).toBe(1);
    jar.set(session.WORKSPACE_COOKIE, { value: "demo-AAAAAAAAAAAAAAAAAAAA" });
    const made = await session.currentWorkspace();
    expect(made.id).toBe("demo-AAAAAAAAAAAAAAAAAAAA");
    expect(await used()).toBe(2);
    await session.currentWorkspace();
    expect(await used()).toBe(2);
  });

  it("re-seeds a copy made by an older seed", async () => {
    const first = await session.currentWorkspace();
    await memoryStore().saveWorkspace({ ...first, seedVersion: "wick-ember-0@2026-01-01" });
    expect((await session.currentWorkspace()).seedVersion?.startsWith(`${SEED_VERSION}@`)).toBe(
      true,
    );
  });

  it("opens the live workspace only with a valid owner cookie", async () => {
    jar.set(session.WORKSPACE_COOKIE, { value: "live" });
    jar.set(session.OWNER_COOKIE, { value: "1" });
    const forged = await session.currentWorkspace();
    expect(forged.kind).toBe("demo");

    jar.set(session.WORKSPACE_COOKIE, { value: "live" });
    jar.set(session.OWNER_COOKIE, { value: session.ownerToken("owner-key-for-tests") });
    const live = await session.currentWorkspace();
    expect(live).toMatchObject({ id: "live", kind: "live", expiresAt: null, seedVersion: null });
  });

  it("signs the owner in only with the right key, and back out", async () => {
    expect(await session.signInOwner("wrong")).toBe(false);
    expect(jar.size).toBe(0);
    expect(await session.signInOwner("owner-key-for-tests")).toBe(true);
    expect(jar.get(session.WORKSPACE_COOKIE)?.value).toBe("live");
    expect(session.isOwnerToken(jar.get(session.OWNER_COOKIE)?.value)).toBe(true);
    await session.signOutOwner();
    expect(jar.size).toBe(0);
  });

  it("resets a demo copy but never the live workspace", async () => {
    const first = await session.currentWorkspace();
    await memoryStore().saveOrder(first.id, {
      ...(await memoryStore().getOrder(first.id, "W-1101"))!,
      id: "W-9999",
    });
    const reset = await session.resetWorkspace(first);
    expect(reset.id).toBe(first.id);
    expect(await memoryStore().getOrder(first.id, "W-9999")).toBeNull();
    await expect(session.resetWorkspace(session.liveWorkspace(new Date()))).rejects.toMatchObject({
      status: 400,
    });
  });

  it("peeks without making a copy", async () => {
    expect(await session.peekWorkspace()).toBeNull();
    expect(jar.size).toBe(0);
    const first = await session.currentWorkspace();
    expect((await session.peekWorkspace())?.id).toBe(first.id);
  });
});
