import { describe, expect, it } from "vitest";
import {
  advanceTo,
  can,
  isShopId,
  landingPath,
  newShopId,
  readyToSync,
  roleOf,
  shopSummary,
  stepComplete,
} from "./shops";
import { testRealShop, testUser } from "./testing/shops";

describe("shop IDs and roles", () => {
  it("makes unguessable IDs of one shape", () => {
    const id = newShopId();
    expect(isShopId(id)).toBe(true);
    expect(id).not.toBe(newShopId());
    for (const bad of ["sh_short", "../../x", "sh_aaaaaaaaaaaaaaaa/x", 42, null])
      expect(isShopId(bad)).toBe(false);
  });

  it("gives owners everything, and future roles less", () => {
    expect(can("owner", "own")).toBe(true);
    expect(can("admin", "manage")).toBe(true);
    expect(can("admin", "own")).toBe(false);
    expect(can("member", "act")).toBe(true);
    expect(can("member", "manage")).toBe(false);
  });

  it("finds a member's role, and nobody else's", () => {
    const owner = testUser("owner");
    const shop = testRealShop(owner);
    expect(roleOf(shop, "owner")).toBe("owner");
    expect(roleOf(shop, "stranger")).toBeNull();
    // A member listed in the map but not in memberIds isn't a member.
    expect(roleOf({ ...shop, memberIds: [] }, "owner")).toBeNull();
    expect(shopSummary(shop, "owner")).toMatchObject({
      role: "owner",
      paypal: { environment: "sandbox", health: "ok" },
    });
  });
});

describe("setup steps", () => {
  const draft = testRealShop(undefined, { status: "setup", setupStep: "paypal", paypal: null });

  it("won't move past PayPal until it's connected with dispute access", () => {
    expect(stepComplete(draft, "paypal")).toBe(false);
    expect(() => advanceTo(draft, "policies")).toThrow(
      expect.objectContaining({ status: 409, code: "setup_incomplete" }),
    );
    const connected = { ...draft, paypal: testRealShop().paypal };
    expect(advanceTo(connected, "policies").setupStep).toBe("policies");
  });

  it("never moves a shop backwards, and opens the first sync only after the review", () => {
    const reviewed = { ...testRealShop(), status: "setup" as const, setupStep: "review" as const };
    expect(advanceTo(reviewed, "details").setupStep).toBe("review");
    expect(readyToSync(reviewed)).toBe(true);
    expect(readyToSync({ ...reviewed, setupStep: "notifications" })).toBe(false);
    expect(readyToSync({ ...reviewed, paypal: null })).toBe(false);
  });

  it("sends a signed-in person to their last ready shop, any ready shop, or onboarding", () => {
    const user = testUser("u", { lastShopId: "sh_b" });
    const summary = (id: string, status: "ready" | "setup") =>
      ({
        id,
        name: id,
        kind: "real",
        status,
        setupStep: "review",
        role: "owner",
        paypal: null,
      }) as const;
    expect(landingPath(user, [summary("sh_a", "ready"), summary("sh_b", "ready")])).toBe(
      "/app/sh_b",
    );
    expect(landingPath(user, [summary("sh_a", "ready"), summary("sh_b", "setup")])).toBe(
      "/app/sh_a",
    );
    expect(landingPath(user, [summary("sh_b", "setup")])).toBe("/onboarding");
  });
});
