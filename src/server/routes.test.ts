import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The API routes, called directly: a fake cookie jar stands in for next/headers and a fake
 * Firebase for identity, on the memory store. Every shop route is checked for who may use it:
 * signed out gets 401, another account's shop 404, a request from another site 403.
 */

const jar = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name)! } : undefined),
    set: (name: string, value: string) => jar.set(name, value),
    delete: (name: string) => jar.delete(name),
  }),
  headers: async () => new Headers({ "x-forwarded-for": "198.51.100.7" }),
}));

for (const key of [
  "PAYPAL_CLIENT_ID",
  "PAYPAL_CLIENT_SECRET",
  "PAYPAL_WEBHOOK_ID",
  "NEBIUS_API_KEY",
  "TAVILY_API_KEY",
  "FIREBASE_AUTH_EMULATOR_HOST",
  "TRUCE_GOOGLE_SIGN_IN",
]) {
  delete process.env[key];
}
process.env.TRUCE_STORE = "memory";
process.env.SITE_URL = "http://localhost:3100";
process.env.FIREBASE_API_KEY = "public-web-key";
process.env.TRUCE_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
process.env.TRUCE_JOB_KEY = "job-key-for-route-tests";

const { replaceIdentity } = await import("./auth/identity");
const { memoryStore } = await import("./store/memory");
const { readEvents } = await import("@/lib/sse");

/** A stand-in for Firebase: ID tokens are "id:<uid>:<seconds since sign-in>:<padding>". */
const revoked: string[] = [];
replaceIdentity({
  async verifyIdToken(token) {
    const [kind, uid, age] = token.split(":");
    if (kind !== "id" || !uid) throw new Error("bad token");
    const now = Math.floor(Date.now() / 1000);
    return {
      uid,
      email: `${uid}@example.test`,
      email_verified: false,
      auth_time: now - Number(age ?? 0),
      iat: now,
    };
  },
  async createSessionCookie(token) {
    const uid = token.split(":")[1]!;
    return `session:${uid}:${Math.floor(Date.now() / 1000)}`;
  },
  async verifySessionCookie(cookie) {
    const [kind, uid, iat] = cookie.split(":");
    if (kind !== "session" || !uid) throw new Error("bad cookie");
    return { uid, email: `${uid}@example.test`, auth_time: Number(iat), iat: Number(iat) };
  },
  async revokeSessions(uid) {
    revoked.push(uid);
  },
  async getAccount() {
    return { email: null, emailVerified: true, name: null };
  },
});

const config = await import("@/app/api/auth/config/route");
const session = await import("@/app/api/auth/session/route");
const everywhere = await import("@/app/api/auth/sign-out-everywhere/route");
const me = await import("@/app/api/me/route");
const shops = await import("@/app/api/shops/route");
const shopRoute = await import("@/app/api/shops/[shopId]/route");
const paypal = await import("@/app/api/shops/[shopId]/paypal/route");
const paypalCheck = await import("@/app/api/shops/[shopId]/paypal/check/route");
const sync = await import("@/app/api/shops/[shopId]/sync/route");
const reset = await import("@/app/api/shops/[shopId]/sample/reset/route");
const notifications = await import("@/app/api/shops/[shopId]/notifications/route");
const read = await import("@/app/api/shops/[shopId]/notifications/read/route");
const cases = await import("@/app/api/shops/[shopId]/cases/route");
const oneCase = await import("@/app/api/shops/[shopId]/cases/[caseId]/route");
const approve = await import("@/app/api/shops/[shopId]/cases/[caseId]/approve/route");
const analyze = await import("@/app/api/shops/[shopId]/cases/[caseId]/analyze/route");
const orders = await import("@/app/api/shops/[shopId]/orders/route");
const tracking = await import("@/app/api/shops/[shopId]/orders/[orderId]/tracking/route");
const metrics = await import("@/app/api/shops/[shopId]/metrics/route");
const chat = await import("@/app/api/shops/[shopId]/chat/route");
const sweep = await import("@/app/api/shops/[shopId]/sweep/route");
const webhook = await import("@/app/api/paypal/webhook/[shopId]/route");
const legacyWebhook = await import("@/app/api/paypal/webhook/route");
const overnight = await import("@/app/api/jobs/overnight/route");
const status = await import("@/app/api/status/route");
const health = await import("@/app/api/health/route");
const storefront = await import("@/app/api/shop/config/route");

const ORIGIN = "http://localhost:3100";
/** The Origin requests carry; withOrigin() swaps it for a forged one. */
let currentOrigin = ORIGIN;
type Method = "GET" | "POST" | "PATCH" | "DELETE";

function request(
  method: Method,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
) {
  return new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(method === "GET" ? {} : { Origin: currentOrigin }),
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) });
const json = async (response: Response) => ({
  status: response.status,
  body: await response.json(),
});

let signIns = 0;

/** Signs `uid` in (making the account the first time); later requests carry their cookie. */
async function signIn(uid: string) {
  jar.clear();
  // Each from its own network, so the per-network sign-in limit doesn't get in the way.
  const ip = `203.0.113.${++signIns % 250}`;
  const response = await session.POST(
    request(
      "POST",
      "/api/auth/session",
      { idToken: `id:${uid}:5:test-token-padding` },
      { "x-forwarded-for": ip },
    ),
  );
  expect(response.status).toBe(200);
  return (await response.json()) as { user: { uid: string }; next: string };
}

/** A ready sample shop for the signed-in account. */
async function readySample(): Promise<string> {
  const created = await json(await shops.POST(request("POST", "/api/shops", { kind: "sample" })));
  expect(created.status).toBe(201);
  const id = created.body.shop.id as string;
  await shopRoute.PATCH(
    request("PATCH", `/api/shops/${id}`, { setupStep: "review" }),
    ctx({ shopId: id }),
  );
  const response = await sync.POST(
    request("POST", `/api/shops/${id}/sync`, {}),
    ctx({ shopId: id }),
  );
  const events: { type: string }[] = [];
  for await (const event of readEvents<{ type: string }>(response)) events.push(event);
  expect(events.at(-1)?.type).toBe("done");
  return id;
}

const PROFILE = {
  name: "Hearth & Field",
  website: "hearthandfield.example.com",
  currency: "USD",
  timeZone: "America/Chicago",
  sells: "Hand-thrown ceramics",
};

beforeAll(() => memoryStore().reset());
beforeEach(() => jar.clear());
afterEach(() => vi.restoreAllMocks());

describe("signing in", () => {
  it("serves the public Firebase config at runtime", async () => {
    const body = (await json(await config.GET())).body;
    expect(body).toMatchObject({
      firebase: {
        apiKey: "public-web-key",
        projectId: "truce-disputes",
        authDomain: "truce-disputes.firebaseapp.com",
      },
      emulator: null,
      google: false,
    });
  });

  it("trades a fresh sign-in for an httpOnly session, and sends a new account to onboarding", async () => {
    const started = await signIn("alice");
    expect(started.next).toBe("/onboarding");
    expect(jar.get("truce_session")).toMatch(/^session:alice:/);
    const mine = await json(await me.GET(request("GET", "/api/me")));
    expect(mine.body).toMatchObject({
      user: { uid: "alice", email: "alice@example.test" },
      shops: [],
    });
  });

  it("refuses an old sign-in, a bad token, and a request from another site", async () => {
    const stale = await json(
      await session.POST(
        request("POST", "/api/auth/session", { idToken: "id:bob:900:test-token-padding" }),
      ),
    );
    expect(stale).toMatchObject({ status: 401, body: { code: "stale_sign_in" } });
    const bad = await json(
      await session.POST(
        request("POST", "/api/auth/session", { idToken: "nonsense-token-value-x" }),
      ),
    );
    expect(bad.status).toBe(401);
    const forged = await json(
      await session.POST(
        request(
          "POST",
          "/api/auth/session",
          { idToken: "id:bob:5:test-token-padding" },
          { Origin: "https://evil.example" },
        ),
      ),
    );
    expect(forged).toMatchObject({ status: 403, body: { code: "bad_origin" } });
    expect(jar.has("truce_session")).toBe(false);
  });

  it("limits sign-ins from one network", async () => {
    const attempt = () =>
      session.POST(
        request(
          "POST",
          "/api/auth/session",
          { idToken: "id:zed:5:test-token-padding" },
          { "x-forwarded-for": "192.0.2.99" },
        ),
      );
    for (let i = 0; i < 30; i++) expect((await attempt()).status).toBe(200);
    expect(await json(await attempt())).toMatchObject({
      status: 429,
      body: { code: "rate_limited" },
    });
  });

  it("signs this browser out, and every browser out", async () => {
    await signIn("carol");
    const cookie = jar.get("truce_session")!;
    expect((await everywhere.POST(request("POST", "/api/auth/sign-out-everywhere"))).status).toBe(
      204,
    );
    expect(revoked).toContain("carol");
    expect(jar.has("truce_session")).toBe(false);
    // The old cookie, from any browser, no longer works.
    jar.set("truce_session", cookie);
    expect((await me.GET(request("GET", "/api/me"))).status).toBe(401);
    // A new sign-in works again, and DELETE signs out just this browser.
    await new Promise((r) => setTimeout(r, 1100));
    await signIn("carol");
    expect((await me.GET(request("GET", "/api/me"))).status).toBe(200);
    expect((await session.DELETE(request("DELETE", "/api/auth/session"))).status).toBe(204);
    expect(jar.has("truce_session")).toBe(false);
  });
});

describe("the account and onboarding", () => {
  it("saves the name, with field errors for a bad one", async () => {
    await signIn("dana");
    const bad = await json(await me.PATCH(request("PATCH", "/api/me", { name: "   " })));
    expect(bad).toMatchObject({
      status: 400,
      body: { code: "invalid", fields: { name: expect.any(String) } },
    });
    const saved = await json(await me.PATCH(request("PATCH", "/api/me", { name: "Dana Reyes" })));
    expect(saved.body.user).toMatchObject({ name: "Dana Reyes" });
  });

  it("makes a real shop from its details, once, and refuses to skip connecting PayPal", async () => {
    await signIn("erin");
    const bad = await json(
      await shops.POST(
        request("POST", "/api/shops", {
          kind: "real",
          profile: { ...PROFILE, website: "not a site" },
        }),
      ),
    );
    expect(bad).toMatchObject({
      status: 400,
      body: { fields: { "profile.website": expect.any(String) } },
    });

    const first = await json(
      await shops.POST(request("POST", "/api/shops", { kind: "real", profile: PROFILE })),
    );
    expect(first.status).toBe(201);
    expect(first.body.shop).toMatchObject({
      kind: "real",
      status: "setup",
      setupStep: "paypal",
      website: "https://hearthandfield.example.com",
      paypal: null,
    });
    const again = await json(
      await shops.POST(request("POST", "/api/shops", { kind: "real", profile: PROFILE })),
    );
    expect(again.body.shop.id).toBe(first.body.shop.id);

    const id = first.body.shop.id as string;
    const skip = await json(
      await shopRoute.PATCH(
        request("PATCH", `/api/shops/${id}`, { setupStep: "policies" }),
        ctx({ shopId: id }),
      ),
    );
    expect(skip).toMatchObject({ status: 409, body: { code: "setup_incomplete" } });
    // Its data isn't open until it's ready.
    const early = await json(
      await cases.GET(request("GET", `/api/shops/${id}/cases`), ctx({ shopId: id })),
    );
    expect(early).toMatchObject({ status: 409, body: { code: "shop_not_ready" } });
    const syncing = await sync.POST(
      request("POST", `/api/shops/${id}/sync`, {}),
      ctx({ shopId: id }),
    );
    const events = [];
    for await (const event of readEvents<{ type: string }>(syncing)) events.push(event);
    expect(events).toEqual([
      { type: "error", message: "Finish the setup steps before the first sync." },
    ]);
  });

  it("runs a sample shop's first sync to ready, then opens its data", async () => {
    const started = await signIn("frank");
    expect(started.next).toBe("/onboarding");
    const id = await readySample();
    const listed = await json(
      await cases.GET(request("GET", `/api/shops/${id}/cases`), ctx({ shopId: id })),
    );
    expect(listed.body.cases).toHaveLength(17);
    const policies = await json(
      await shopRoute.PATCH(
        request("PATCH", `/api/shops/${id}`, {
          policies: { shipping: { text: "x", url: null }, returns: { text: "y", url: null } },
        }),
        ctx({ shopId: id }),
      ),
    );
    expect(policies.status).toBe(409);
    // Signing in again goes straight to the shop now.
    expect((await signIn("frank")).next).toBe(`/app/${id}`);
  });
});

describe("who may use a shop", () => {
  let owner: string;
  beforeAll(async () => {
    await signIn("grace");
    owner = await readySample();
  });

  const routes: [string, (shopId: string) => Promise<Response>][] = [
    ["GET shop", (id) => shopRoute.GET(request("GET", `/api/shops/${id}`), ctx({ shopId: id }))],
    [
      "PATCH shop",
      (id) =>
        shopRoute.PATCH(
          request("PATCH", `/api/shops/${id}`, { setupStep: "review" }),
          ctx({ shopId: id }),
        ),
    ],
    [
      "DELETE shop",
      (id) => shopRoute.DELETE(request("DELETE", `/api/shops/${id}`), ctx({ shopId: id })),
    ],
    [
      "POST paypal",
      (id) =>
        paypal.POST(
          request("POST", `/api/shops/${id}/paypal`, {
            environment: "sandbox",
            clientId: "A".repeat(40),
            clientSecret: "B".repeat(40),
          }),
          ctx({ shopId: id }),
        ),
    ],
    [
      "DELETE paypal",
      (id) => paypal.DELETE(request("DELETE", `/api/shops/${id}/paypal`), ctx({ shopId: id })),
    ],
    [
      "POST paypal/check",
      (id) =>
        paypalCheck.POST(request("POST", `/api/shops/${id}/paypal/check`), ctx({ shopId: id })),
    ],
    [
      "POST sync",
      (id) => sync.POST(request("POST", `/api/shops/${id}/sync`, {}), ctx({ shopId: id })),
    ],
    [
      "POST sample/reset",
      (id) => reset.POST(request("POST", `/api/shops/${id}/sample/reset`), ctx({ shopId: id })),
    ],
    [
      "GET notifications",
      (id) =>
        notifications.GET(request("GET", `/api/shops/${id}/notifications`), ctx({ shopId: id })),
    ],
    [
      "POST notifications/read",
      (id) =>
        read.POST(request("POST", `/api/shops/${id}/notifications/read`, {}), ctx({ shopId: id })),
    ],
    ["GET cases", (id) => cases.GET(request("GET", `/api/shops/${id}/cases`), ctx({ shopId: id }))],
    [
      "GET case",
      (id) =>
        oneCase.GET(
          request("GET", `/api/shops/${id}/cases/demo-inr-86`),
          ctx({ shopId: id, caseId: "demo-inr-86" }),
        ),
    ],
    [
      "POST approve",
      (id) =>
        approve.POST(
          request("POST", `/api/shops/${id}/cases/demo-inr-86/approve`, {
            move: "refund",
            draft: { kind: "refund", text: "Refunded.", evidenceIds: [] },
          }),
          ctx({ shopId: id, caseId: "demo-inr-86" }),
        ),
    ],
    [
      "POST analyze",
      (id) =>
        analyze.POST(
          request("POST", `/api/shops/${id}/cases/demo-inr-86/analyze`, {}),
          ctx({ shopId: id, caseId: "demo-inr-86" }),
        ),
    ],
    [
      "GET orders",
      (id) => orders.GET(request("GET", `/api/shops/${id}/orders`), ctx({ shopId: id })),
    ],
    [
      "POST tracking",
      (id) =>
        tracking.POST(
          request("POST", `/api/shops/${id}/orders/W-1101/tracking`, {
            carrier: "USPS",
            number: "9400111899223346123456",
          }),
          ctx({ shopId: id, orderId: "W-1101" }),
        ),
    ],
    [
      "GET metrics",
      (id) => metrics.GET(request("GET", `/api/shops/${id}/metrics`), ctx({ shopId: id })),
    ],
    [
      "POST chat",
      (id) =>
        chat.POST(
          request("POST", `/api/shops/${id}/chat`, { messages: [{ role: "user", content: "Hi" }] }),
          ctx({ shopId: id }),
        ),
    ],
    [
      "POST sweep",
      (id) => sweep.POST(request("POST", `/api/shops/${id}/sweep`, {}), ctx({ shopId: id })),
    ],
  ];

  it.each(routes)("%s: signed out is 401", async (_name, call) => {
    jar.clear();
    expect((await call(owner)).status).toBe(401);
  });

  it.each(routes)("%s: another account's shop is 404, and nothing changes", async (_name, call) => {
    await signIn("mallory");
    const answer = await json(await call(owner));
    expect(answer).toMatchObject({ status: 404, body: { code: "shop_not_found" } });
    await signIn("grace");
    expect(
      (await shopRoute.GET(request("GET", `/api/shops/${owner}`), ctx({ shopId: owner }))).status,
    ).toBe(200);
  });

  it.each(routes.filter(([name]) => !name.startsWith("GET")))(
    "%s: a request from another site is 403",
    async (_name, call) => {
      await signIn("grace");
      const response = await withOrigin("https://evil.example", () => call(owner));
      expect(response.status).toBe(403);
    },
  );

  it("an unknown or malformed shop ID is 404", async () => {
    await signIn("grace");
    for (const id of ["sh_doesnotexist0000", "../../etc", "sh_x"]) {
      const answer = await shopRoute.GET(request("GET", `/api/shops/${id}`), ctx({ shopId: id }));
      expect(answer.status).toBe(404);
    }
  });

  it("checks the IDs in the path, too", async () => {
    await signIn("grace");
    const answer = await oneCase.GET(
      request("GET", `/api/shops/${owner}/cases/x`),
      ctx({ shopId: owner, caseId: "<script>" }),
    );
    expect(answer.status).toBe(400);
  });
});

/** Runs `work` with every request built by request() coming from `origin` instead. */
async function withOrigin(origin: string, work: () => Promise<Response>): Promise<Response> {
  const before = currentOrigin;
  currentOrigin = origin;
  try {
    return await work();
  } finally {
    currentOrigin = before;
  }
}

describe("connecting PayPal", () => {
  const scopes = (extra: string[] = []) =>
    [
      "https://uri.paypal.com/services/disputes/read-seller",
      "https://uri.paypal.com/services/disputes/update-seller",
      "https://uri.paypal.com/services/shipping/trackers/readwrite",
      "https://uri.paypal.com/services/applications/webhooks",
      ...extra,
    ].join(" ");

  function paypalAnswers(tokenBody: Record<string, unknown> | null, status = 200) {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input instanceof Request ? input.url : input);
      calls.push(url);
      if (url.endsWith("/v1/oauth2/token")) {
        return tokenBody
          ? Response.json({ access_token: "t", expires_in: 32400, ...tokenBody })
          : Response.json(
              { error: "invalid_client", error_description: "Client Authentication failed" },
              { status: 401 },
            );
      }
      return Response.json({}, { status });
    });
    return calls;
  }

  async function realDraft(uid: string) {
    await signIn(uid);
    const created = await json(
      await shops.POST(request("POST", "/api/shops", { kind: "real", profile: PROFILE })),
    );
    return created.body.shop.id as string;
  }

  const connect = (id: string, secret = "S3cretValueThatMustNeverLeave_0123456789") =>
    paypal.POST(
      request("POST", `/api/shops/${id}/paypal`, {
        environment: "sandbox",
        clientId: "AYclientid0123456789abcdefghijklmnopqrstuvwxyz",
        clientSecret: secret,
      }),
      ctx({ shopId: id }),
    );

  it("checks the keys, seals the secret, skips the webhook on a local site, and never sends the secret back", async () => {
    const id = await realDraft("henry");
    const calls = paypalAnswers({ scope: scopes(), app_id: "APP-1" });
    const response = await connect(id);
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(text).not.toContain("S3cretValueThatMustNeverLeave");
    const body = JSON.parse(text);
    expect(body.shop.paypal).toMatchObject({
      environment: "sandbox",
      appId: "APP-1",
      features: {
        disputes: true,
        respond: true,
        transactions: false,
        tracking: true,
        webhooks: true,
      },
      webhook: { status: "skipped" },
      health: "ok",
    });
    expect(body.shop.orderHistory).toBe("disputes");
    expect(body.notes.join(" ")).toMatch(/Transaction Search is off/);
    expect(calls.every((url) => url.startsWith("https://api-m.sandbox.paypal.com"))).toBe(true);

    const sealedSecret = await memoryStore().getSecret(id, "paypal");
    expect(sealedSecret).toMatchObject({ v: 1, alg: "A256GCM" });
    expect(JSON.stringify(sealedSecret)).not.toContain("S3cretValueThatMustNeverLeave");

    // Now the setup can move on.
    const next = await json(
      await shopRoute.PATCH(
        request("PATCH", `/api/shops/${id}`, { setupStep: "policies" }),
        ctx({ shopId: id }),
      ),
    );
    expect(next.body.shop.setupStep).toBe("policies");

    // Disconnecting forgets the keys.
    const off = await json(
      await paypal.DELETE(request("DELETE", `/api/shops/${id}/paypal`), ctx({ shopId: id })),
    );
    expect(off.body.shop.paypal).toBeNull();
    expect(await memoryStore().getSecret(id, "paypal")).toBeNull();
  });

  it("registers the dispute webhook when the site is public", async () => {
    const id = await realDraft("ivy");
    process.env.SITE_URL = "https://truce.example.com";
    try {
      const calls = paypalAnswers({ scope: scopes(), app_id: "APP-2" });
      vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
        const url = String(input instanceof Request ? input.url : input);
        calls.push(`${init?.method ?? "GET"} ${url}`);
        if (url.endsWith("/v1/oauth2/token"))
          return Response.json({
            access_token: "t",
            expires_in: 32400,
            scope: scopes(),
            app_id: "APP-2",
          });
        if (url.endsWith("/v1/notifications/webhooks"))
          return Response.json({ id: "WH-1", url: JSON.parse(String(init?.body)).url });
        return Response.json({});
      });
      const body = (await json(await connect(id))).body;
      expect(body.shop.paypal.webhook).toEqual({
        status: "registered",
        id: "WH-1",
        url: `https://truce.example.com/api/paypal/webhook/${id}`,
        note: null,
      });
    } finally {
      process.env.SITE_URL = "http://localhost:3100";
    }
  });

  it("explains keys PayPal refuses, and an app without dispute access", async () => {
    const id = await realDraft("jack");
    paypalAnswers(null);
    expect(await json(await connect(id))).toMatchObject({
      status: 422,
      body: { code: "paypal_rejected_keys" },
    });
    vi.restoreAllMocks();
    paypalAnswers({ scope: "openid https://uri.paypal.com/services/applications/webhooks" });
    expect(await json(await connect(id))).toMatchObject({
      status: 422,
      body: { code: "paypal_missing_features" },
    });
    expect(await memoryStore().getSecret(id, "paypal")).toBeNull();
    const bad = await json(
      await paypal.POST(
        request("POST", `/api/shops/${id}/paypal`, {
          environment: "production",
          clientId: "x",
          clientSecret: "y",
        }),
        ctx({ shopId: id }),
      ),
    );
    expect(bad).toMatchObject({
      status: 400,
      body: {
        fields: {
          environment: expect.any(String),
          clientId: expect.any(String),
          clientSecret: expect.any(String),
        },
      },
    });
  });
});

describe("notifications, sample resets and deleting a shop", () => {
  it("lets a member read and clear notifications, start a sample over, and delete it", async () => {
    await signIn("kate");
    const id = await readySample();
    const listed = await json(
      await notifications.GET(
        request("GET", `/api/shops/${id}/notifications`),
        ctx({ shopId: id }),
      ),
    );
    expect(listed.status).toBe(200);
    expect(listed.body.unread).toBe(listed.body.notifications.length);
    expect(
      (
        await read.POST(
          request("POST", `/api/shops/${id}/notifications/read`, {}),
          ctx({ shopId: id }),
        )
      ).status,
    ).toBe(204);
    const after = await json(
      await notifications.GET(
        request("GET", `/api/shops/${id}/notifications`),
        ctx({ shopId: id }),
      ),
    );
    expect(after.body.unread).toBe(0);

    expect(
      (await reset.POST(request("POST", `/api/shops/${id}/sample/reset`), ctx({ shopId: id })))
        .status,
    ).toBe(200);
    expect(
      (await shopRoute.DELETE(request("DELETE", `/api/shops/${id}`), ctx({ shopId: id }))).status,
    ).toBe(204);
    expect(
      (await shopRoute.GET(request("GET", `/api/shops/${id}`), ctx({ shopId: id }))).status,
    ).toBe(404);
    expect((await json(await me.GET(request("GET", "/api/me")))).body.shops).toEqual([]);
  });
});

describe("webhooks, jobs and the server", () => {
  it("turns away webhooks for unknown shops and unsigned bodies", async () => {
    const unknown = await webhook.POST(
      new Request(`${ORIGIN}/api/paypal/webhook/sh_doesnotexist0000`, {
        method: "POST",
        body: "{}",
      }),
      { params: Promise.resolve({ shopId: "sh_doesnotexist0000" }) },
    );
    expect(unknown.status).toBe(404);
    const legacy = await legacyWebhook.POST(
      new Request(`${ORIGIN}/api/paypal/webhook`, { method: "POST", body: "{}" }),
    );
    expect(legacy.status).toBe(503);
  });

  it("runs the overnight job only with its key", async () => {
    expect(
      (await overnight.POST(new Request(`${ORIGIN}/api/jobs/overnight`, { method: "POST" })))
        .status,
    ).toBe(401);
    const ok = await overnight.POST(
      new Request(`${ORIGIN}/api/jobs/overnight`, {
        method: "POST",
        headers: { "x-truce-job-key": "job-key-for-route-tests" },
      }),
    );
    expect(await ok.json()).toMatchObject({ ok: true });
  });

  it("says which services are set up, never the keys", async () => {
    const body = (await json(await status.GET())).body;
    expect(body).toMatchObject({
      auth: true,
      encryption: true,
      storefront: false,
      publicSite: false,
      store: "memory",
    });
    expect(JSON.stringify(body)).not.toContain(process.env.TRUCE_ENCRYPTION_KEY!);
    expect((await json(await health.GET())).body).toMatchObject({ ok: true });
    expect((await json(await storefront.GET())).body).toEqual({ clientId: null });
  });
});
