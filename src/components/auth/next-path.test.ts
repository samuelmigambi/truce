import { describe, expect, it } from "vitest";
import { firstParam, safeNextPath, withNext } from "./next-path";

describe("safeNextPath", () => {
  it("keeps paths inside the app and onboarding only", () => {
    expect(safeNextPath("/app/sh_1")).toBe("/app/sh_1");
    expect(safeNextPath("/onboarding?shop=sh_1")).toBe("/onboarding?shop=sh_1");
    expect(safeNextPath("/application")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("https://evil.example/app")).toBeNull();
  });
});

describe("withNext", () => {
  it("carries a safe destination and drops an unsafe one", () => {
    expect(withNext("/signup", "/app/sh_1")).toBe("/signup?next=%2Fapp%2Fsh_1");
    expect(withNext("/signup", "https://evil.example")).toBe("/signup");
    expect(withNext("/signin", null)).toBe("/signin");
  });
});

describe("firstParam", () => {
  it("takes the first of a repeated param", () => {
    expect(firstParam(["a", "b"])).toBe("a");
    expect(firstParam("a")).toBe("a");
    expect(firstParam(undefined)).toBeUndefined();
  });
});
