"use client";

import { AnimatePresence, motion } from "motion/react";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { ShopResponse, ShopSummary } from "@/lib/api-types";
import { patchJson, postJson, shopApi, shopHref } from "@/lib/client/api";
import type { Shop, ShopRole, User } from "@/lib/domain";
import { duration, ease } from "../motion";
import { useToast } from "../ui/toast";
import { NotificationsStep } from "./notifications-step";
import { OnboardingHeader } from "./onboarding-header";
import { PayPalStep } from "./paypal-step";
import { PoliciesStep } from "./policies-step";
import { ReviewStep } from "./review-step";
import { ShopStep } from "./shop-step";
import { focusStepHeading, type StepBase } from "./step-frame";
import {
  furthestStep,
  isStepId,
  shopReached,
  STEP_ORDER,
  stepIndex,
  summaryOf,
  withShop,
  type StepId,
} from "./steps";
import { useSyncStream } from "./sync-run";
import { SyncStep } from "./sync-step";

/** The address bar follows the flow, so Back and Forward move between steps and a reload resumes. */
function writeUrl(mode: "push" | "replace", change: (params: URLSearchParams) => void) {
  const url = new URL(window.location.href);
  change(url.searchParams);
  const next = `${url.pathname}${url.search}`;
  if (mode === "push") window.history.pushState(null, "", next);
  else window.history.replaceState(null, "", next);
}

/**
 * Onboarding, from the shop's details to the first sync. It resumes from what the server saved,
 * saves every step as the person moves on, and keeps the step in the address so the browser's
 * own Back works.
 */
export function OnboardingFlow({
  user: firstUser,
  shop: firstShop,
  shops: firstShops,
}: {
  user: User;
  shop: Shop | null;
  shops: ShopSummary[];
}) {
  const params = useSearchParams();
  const toast = useToast();
  const sync = useSyncStream();
  const [user, setUser] = useState(firstUser);
  const [shop, setShop] = useState(firstShop);
  const [shops, setShops] = useState(firstShops);
  const [moved, setMoved] = useState(false);

  const steps = STEP_ORDER;
  const furthest = furthestStep(shop);
  const run = sync.run;
  const synced = run?.status === "done" && run.result ? run.result.shop : null;

  const canOpen = (step: StepId) => {
    if (!steps.includes(step)) return false;
    if (step === "sync") return run !== null && shop !== null;
    return stepIndex(step) <= stepIndex(furthest);
  };
  const asked = params.get("step");
  const current: StepId = isStepId(asked) && canOpen(asked) ? asked : furthest;

  const go = useCallback((step: StepId) => {
    setMoved(true);
    writeUrl("push", (search) => search.set("step", step));
  }, []);

  // Leaving mid-sync would cut it off, so the browser asks first.
  const running = run?.status === "running";
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  /** The address now names this shop, so a reload resumes it rather than starting another. */
  function pinShop(shopId: string | null) {
    writeUrl("replace", (search) => {
      search.delete("new");
      if (shopId) search.set("shop", shopId);
      else search.delete("shop");
    });
  }

  function roleIn(list: ShopSummary[], shopId: string): ShopRole {
    return list.find((s) => s.id === shopId)?.role ?? "owner";
  }

  function created(next: Shop, role: ShopRole) {
    setShop(next);
    setShops((list) => withShop(list, summaryOf(next, role)));
    pinShop(next.id);
  }

  function updated(next: Shop) {
    setShop(next);
    setShops((list) => withShop(list, summaryOf(next, roleIn(list, next.id))));
  }

  function deleted(shopId: string) {
    setShops((list) => list.filter((s) => s.id !== shopId));
    if (shop?.id === shopId) {
      setShop(null);
      writeUrl("replace", (search) => {
        search.delete("shop");
        search.set("step", "details");
        // Someone with a ready shop stays here on reload instead of going to the dashboard.
        if (shops.some((s) => s.status === "ready" && s.id !== shopId)) search.set("new", "1");
      });
    }
  }

  /** From the PayPal step: a separate sample shop to explore, leaving the draft saved. */
  async function exploreSample() {
    const draft = shop;
    const response = await postJson<ShopResponse>("/api/shops", { kind: "sample" });
    created(response.shop, response.role);
    if (!shopReached(response.shop, "paypal")) {
      const reached = await patchJson<ShopResponse>(shopApi(response.shop.id), {
        setupStep: "paypal",
      });
      updated(reached.shop);
    }
    setMoved(true);
    writeUrl("replace", (search) => search.set("step", "paypal"));
    focusStepHeading();
    toast({
      title: "Sample shop ready",
      description: draft
        ? `Your draft of ${draft.name} is saved, so you can finish it later.`
        : "PayPal is simulated in it, and nothing reaches PayPal.",
    });
  }

  function startSync() {
    if (!shop) return;
    sync.start(shop.id);
    go("sync");
  }

  const readyShops = shops.filter((s) => s.status === "ready");
  const home = readyShops.find((s) => s.id === user.lastShopId) ?? readyShops[0];
  const dashboardHref = home ? shopHref(home.id) : null;

  function base(step: StepId): StepBase {
    const index = steps.indexOf(step);
    const previous = index > 0 ? steps[index - 1] : undefined;
    return {
      focusOnMount: moved,
      onBack: previous ? () => go(previous) : undefined,
    };
  }

  function nextAfter(step: StepId): () => void {
    const index = steps.indexOf(step);
    const following = steps[index + 1];
    return () => {
      if (following) go(following);
    };
  }

  function renderStep(step: StepId) {
    if (step === "details" || !shop) {
      return (
        <ShopStep
          {...base("details")}
          shop={shop}
          shops={shops}
          onCreated={created}
          onUpdated={updated}
          onDeleted={deleted}
          onNext={nextAfter("details")}
        />
      );
    }
    switch (step) {
      case "paypal":
        return (
          <PayPalStep
            {...base("paypal")}
            shop={shop}
            onUpdated={updated}
            onNext={nextAfter("paypal")}
            onExploreSample={exploreSample}
          />
        );
      case "policies":
        return (
          <PoliciesStep
            {...base("policies")}
            shop={shop}
            onUpdated={updated}
            onNext={nextAfter("policies")}
          />
        );
      case "notifications":
        return (
          <NotificationsStep
            {...base("notifications")}
            user={user}
            shop={shop}
            onUpdated={updated}
            onNext={nextAfter("notifications")}
          />
        );
      case "review":
        return (
          <ReviewStep
            {...base("review")}
            user={user}
            shop={shop}
            sync={run}
            onEdit={go}
            onStart={startSync}
            onWatch={() => go("sync")}
            onUser={setUser}
            onUpdated={updated}
          />
        );
      case "sync":
        return run ? (
          <SyncStep
            {...base("sync")}
            shop={synced ?? shop}
            run={run}
            onRetry={() => sync.start(shop.id)}
          />
        ) : null;
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <OnboardingHeader user={user} dashboardHref={dashboardHref} />
      <main className="animate-fade-rise mx-auto w-full max-w-[720px] min-w-0 flex-1 px-4 pt-6 pb-20 sm:px-8 sm:pt-10 lg:pt-14">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={current}
            initial={{ opacity: 0, y: 8 }}
            animate={{
              opacity: 1,
              y: 0,
              transition: { duration: duration.base, ease: ease.out },
            }}
            exit={{ opacity: 0, transition: { duration: duration.instant, ease: ease.in } }}
          >
            {renderStep(current)}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}
