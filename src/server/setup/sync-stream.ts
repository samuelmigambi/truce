import "server-only";

import type { AnalysisEvent, SyncEvent } from "@/lib/api-types";
import type { Case, Shop, User } from "@/lib/domain";
import { ActionError } from "@/server/actions/errors";
import { log } from "@/server/log";
import { notify } from "@/server/notifications";
import { markHealthy, paypalFor } from "@/server/paypal/connection";
import { refused, syncSales } from "@/server/paypal/shop-sync";
import { markSynced, syncDisputes } from "@/server/paypal/sync";
import { readyToSync } from "@/server/shops";
import type { Store } from "@/server/store";

/**
 * The sync the seller watches: the first one, which ends with the shop ready for the app, or
 * "Sync now" later. Each step streams as it happens: the PayPal connection, the disputes as they
 * arrive, their orders, the order history, then (the first time) a real analysis of the most
 * urgent case, streamed inside it. A step that can't run says why and the sync carries on; only
 * PayPal refusing the connection stops it.
 */

export interface SyncInput {
  store: Store;
  shop: Shop;
  user: User;
  /** Runs the analysis of one case (the agent's pipeline, wired by the route). */
  analyze: (shop: Shop, caseId: string) => AsyncIterable<AnalysisEvent>;
  now?: () => Date;
}

const LOCK_SECONDS = 10 * 60;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Open cases, the one that needs the seller soonest first. */
export function mostUrgent(cases: Case[]): Case | null {
  const due = (c: Case) => (c.dueAt ? Date.parse(c.dueAt) : Number.MAX_SAFE_INTEGER);
  return (
    cases
      .filter((c) => c.status !== "closed")
      .sort(
        (a, b) =>
          Number(b.status === "needs_you") - Number(a.status === "needs_you") ||
          due(a) - due(b) ||
          b.amount - a.amount,
      )[0] ?? null
  );
}

function caseEvent(kase: Case): SyncEvent {
  return {
    type: "case",
    caseId: kase.id,
    buyer: kase.buyer.name,
    amount: kase.amount,
    reason: kase.reason,
    status: kase.status,
    itemSummary: kase.itemSummary,
  };
}

/** A queue the PayPal callbacks push into while the generator hands events out. */
class Outbox {
  private items: SyncEvent[] = [];
  push(event: SyncEvent) {
    this.items.push(event);
  }
  drain(): SyncEvent[] {
    return this.items.splice(0);
  }
}

/** Marks a shop ready after its first sync, and points its owner's app at it. */
async function finishSetup(store: Store, shop: Shop, user: User, now: Date): Promise<Shop> {
  const at = now.toISOString();
  const latest = (await store.getShop(shop.id)) ?? shop;
  const ready: Shop = {
    ...latest,
    status: "ready",
    readyAt: latest.readyAt ?? at,
    lastSyncAt: at,
    updatedAt: at,
  };
  await store.saveShop(ready);
  const person = (await store.getUser(user.uid)) ?? user;
  await store.saveUser({
    ...person,
    lastShopId: ready.id,
    onboarding: {
      ...person.onboarding,
      shopId: person.onboarding.shopId === ready.id ? null : person.onboarding.shopId,
    },
    updatedAt: at,
  });
  log.info("setup.ready", { shopId: ready.id, kind: ready.kind });
  return ready;
}

export async function* runShopSync(input: SyncInput): AsyncGenerator<SyncEvent> {
  const { store, user } = input;
  const clock = input.now ?? (() => new Date());
  let shop = input.shop;
  const first = shop.status === "setup";
  if (first && !readyToSync(shop)) {
    yield { type: "error", message: "Finish the setup steps before the first sync." };
    return;
  }
  // One sync per shop at a time, across server instances.
  const lock = `sync-lock:${shop.id}`;
  if ((await store.increment(lock, 1, LOCK_SECONDS)) > 1) {
    yield {
      type: "error",
      message: "A sync is already running for this shop. It'll finish on its own.",
    };
    return;
  }
  try {
    const outcome =
      shop.kind === "sample" ? sampleSteps(shop, store) : realSteps(shop, store, clock);
    let cases: Case[] = [];
    for await (const event of outcome) {
      if (event.type === "loaded") {
        cases = event.cases;
        continue;
      }
      yield event;
      if (event.type === "error") return;
    }

    let analyzedCaseId: string | null = null;
    if (first) {
      const target = mostUrgent(cases);
      if (!target) {
        yield {
          type: "step",
          step: "analysis",
          state: "skipped",
          label: "No open disputes to analyze",
          detail: "Truce reads each new dispute as it arrives.",
        };
      } else {
        yield {
          type: "step",
          step: "analysis",
          state: "start",
          label: `Reading ${target.buyer.name}'s case, the most urgent one`,
        };
        let finished = false;
        let problem: string | null = null;
        for await (const event of input.analyze(shop, target.id)) {
          yield { type: "analysis", caseId: target.id, event };
          if (event.type === "result") finished = true;
          if (event.type === "error") problem = event.message;
        }
        if (finished) {
          analyzedCaseId = target.id;
          yield {
            type: "step",
            step: "analysis",
            state: "done",
            label: `${target.buyer.name}'s case is ready to review`,
          };
          await notify(store, shop.id, {
            id: `analysis:first:${target.id}`,
            kind: "analysis",
            title: `Truce's recommendation for ${target.buyer.name}'s case is ready`,
            caseId: target.id,
          });
        } else {
          yield {
            type: "step",
            step: "analysis",
            state: "error",
            label: "The analysis didn't finish",
            detail: `${problem ?? "Truce will try again when you open the case."} Your shop is ready either way.`,
          };
        }
      }
      shop = await finishSetup(store, shop, user, clock());
    } else {
      const latest = (await store.getShop(shop.id)) ?? shop;
      shop = { ...latest, lastSyncAt: clock().toISOString(), updatedAt: clock().toISOString() };
      await store.saveShop(shop);
    }
    const orders = await store.listOrders(shop.id);
    yield { type: "done", shop, cases: cases.length, orders: orders.length, analyzedCaseId };
  } catch (error) {
    log.error("sync.stream_failed", { shopId: shop.id, error });
    yield {
      type: "error",
      message:
        error instanceof ActionError
          ? error.message
          : "The sync stopped partway. Nothing was lost; try again in a moment.",
    };
  } finally {
    await store.increment(lock, -1, LOCK_SECONDS).catch(() => undefined);
  }
}

/** The steps' events, then the cases they found, for the analysis that follows. */
type StepEvent = SyncEvent | { type: "loaded"; cases: Case[] };

/** The sample shop's steps: its data is already there, so they report what's in it. */
async function* sampleSteps(shop: Shop, store: Store): AsyncGenerator<StepEvent> {
  yield {
    type: "step",
    step: "paypal",
    state: "skipped",
    label: "PayPal is simulated in the sample shop",
    detail: "Approvals are recorded on the case instead of being sent.",
  };
  yield { type: "step", step: "disputes", state: "start", label: "Loading the sample disputes" };
  const cases = await store.listCases(shop.id);
  const open = cases.filter((c) => c.status !== "closed");
  for (const kase of open) yield caseEvent(kase);
  yield {
    type: "step",
    step: "disputes",
    state: "done",
    label: `${plural(open.length, "open dispute")} and ${plural(cases.length - open.length, "closed one")}`,
  };
  yield { type: "step", step: "orders", state: "start", label: "Loading the sample orders" };
  const orders = await store.listOrders(shop.id);
  yield {
    type: "step",
    step: "orders",
    state: "done",
    label: `${plural(orders.length, "order")} from the last 90 days`,
  };
  yield {
    type: "step",
    step: "history",
    state: "done",
    label: "Full order history, so the claims ratio is known",
    detail: "Carrier scans in the sample shop are simulated.",
  };
  yield {
    type: "step",
    step: "sort",
    state: "done",
    label: "Sorted the open disputes by deadline",
  };
  yield { type: "loaded", cases };
}

/** A real shop's steps, against its own PayPal app. */
async function* realSteps(start: Shop, store: Store, clock: () => Date): AsyncGenerator<StepEvent> {
  let shop = start;
  yield { type: "step", step: "paypal", state: "start", label: "Checking your PayPal connection" };
  const paypal = await paypalFor(store, shop);
  if (!paypal || !shop.paypal) {
    yield {
      type: "step",
      step: "paypal",
      state: "error",
      label: "This shop isn't connected to PayPal",
      detail: "Connect PayPal, then sync again.",
    };
    yield { type: "error", message: "Connect PayPal before syncing." };
    return;
  }
  try {
    await paypal.client.tokenInfo();
  } catch (error) {
    yield {
      type: "step",
      step: "paypal",
      state: "error",
      label: refused(error) ? "PayPal didn't accept this app's keys" : "Couldn't reach PayPal",
      detail: refused(error)
        ? "Reconnect PayPal with the app's current secret."
        : "Try again in a moment.",
    };
    yield {
      type: "error",
      message: refused(error)
        ? "PayPal turned the connection away."
        : "Couldn't reach PayPal just now.",
    };
    return;
  }
  shop = await markHealthy(store, shop, clock());
  const environment = shop.paypal?.environment === "live" ? "live" : "sandbox";
  yield {
    type: "step",
    step: "paypal",
    state: "done",
    label: `Connected to PayPal (${environment})`,
  };

  yield {
    type: "step",
    step: "disputes",
    state: "start",
    label: "Bringing in your disputes from PayPal",
  };
  const outbox = new Outbox();
  const syncing = syncDisputes(store, shop, paypal.client, {
    onCase: (kase) => outbox.push(caseEvent(kase)),
    onProgress: (done, total) => outbox.push({ type: "progress", step: "disputes", done, total }),
  });
  // Hand out events while the sync runs, so disputes appear as they arrive.
  let settled = false;
  let failure: unknown = null;
  syncing.then(
    () => (settled = true),
    (error: unknown) => {
      settled = true;
      failure = error;
    },
  );
  while (!settled) {
    await new Promise((resolve) => setTimeout(resolve, 150));
    for (const event of outbox.drain()) yield event;
  }
  for (const event of outbox.drain()) yield event;
  if (failure) {
    log.warn("sync.disputes_failed", { shopId: shop.id, error: failure });
    yield {
      type: "step",
      step: "disputes",
      state: "error",
      label: "Couldn't read your disputes from PayPal",
      detail: refused(failure)
        ? "PayPal refused the app's dispute access."
        : "Try again in a moment.",
    };
    yield { type: "error", message: "Couldn't read your disputes from PayPal." };
    return;
  }
  await markSynced(store, shop.id, clock());
  const cases = await store.listCases(shop.id);
  const open = cases.filter((c) => c.status !== "closed").length;
  yield {
    type: "step",
    step: "disputes",
    state: "done",
    label: cases.length
      ? `${plural(cases.length, "dispute")} from PayPal, ${open} open`
      : "No disputes on PayPal yet",
    ...(cases.length ? {} : { detail: "New ones arrive as PayPal opens them." }),
  };

  yield {
    type: "step",
    step: "orders",
    state: "start",
    label: "Linking each dispute to its PayPal payment",
  };
  const orders = await store.listOrders(shop.id);
  const linked = orders.filter((o) => cases.some((c) => c.orderId === o.id));
  const tracked = linked.filter((o) => o.tracking).length;
  yield {
    type: "step",
    step: "orders",
    state: "done",
    label: linked.length
      ? `${plural(linked.length, "payment")} linked, ${tracked} with tracking on PayPal`
      : "No payments to link yet",
    detail: "There's no carrier connection yet, so Truce uses the tracking on your PayPal orders.",
  };

  yield { type: "step", step: "history", state: "start", label: "Reading 90 days of sales" };
  const latest = (await store.getShop(shop.id)) ?? shop;
  const sales = await syncSales(store, latest, paypal.client, clock()).catch((error: unknown) => {
    log.warn("sync.sales_failed", { shopId: shop.id, error });
    return {
      skipped: "Couldn't read your sales from PayPal just now; Truce will try again tonight.",
    };
  });
  if ("skipped" in sales) {
    yield {
      type: "step",
      step: "history",
      state: "skipped",
      label: "Order history isn't available",
      detail: `${sales.skipped} Your claims ratio stays unknown until it is.`,
    };
  } else {
    yield {
      type: "step",
      step: "history",
      state: "done",
      label: `${plural(sales.orders, "sale")} from the last 90 days`,
    };
  }

  yield {
    type: "step",
    step: "sort",
    state: "done",
    label: open ? `Sorted ${plural(open, "open dispute")} by deadline` : "Nothing open to sort",
  };
  yield { type: "loaded", cases };
}
