"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, CircleAlert, RefreshCw, ShieldCheck, TriangleAlert, Webhook } from "lucide-react";
import { useState } from "react";
import type { ConnectPayPalResponse } from "@/lib/api-types";
import type { PayPalConnection } from "@/lib/domain";
import { checkPayPal, disconnectPayPal, showConnection } from "@/lib/client/actions";
import { errorMessage } from "@/lib/client/api";
import { PAYPAL_FEATURES, shopState, WEBHOOK_STATUS } from "@/lib/client/labels";
import { useShop, useShopDates } from "@/lib/client/shop-context";
import { currentStep, dismissSync, startSync, useSync } from "@/lib/client/sync";
import { duration, ease } from "../../motion";
import { PayPalConnect } from "../../shop-setup";
import { Button } from "../../ui/button";
import { Chip } from "../../ui/chip";
import { cn } from "../../ui/cn";
import { Dialog } from "../../ui/overlay";
import { Spinner } from "../../ui/spinner";
import { useToast } from "../../ui/toast";
import { SettingsSection } from "./section";

/**
 * The shop's PayPal: how the connection stands, what the app may do, the webhook, and the
 * syncs. A sample shop has nothing to connect; it says its PayPal is simulated.
 */
export function PayPalSection() {
  const shop = useShop();
  const toast = useToast();
  const state = shopState(shop);
  // Remounting the connect form after a new connection returns it to its one-line summary;
  // the notes from PayPal show below, with the rest of the connection.
  const [connectKey, setConnectKey] = useState(0);
  const [notes, setNotes] = useState<string[]>([]);

  async function connected(response: ConnectPayPalResponse) {
    await showConnection(shop.id, response);
    setNotes(response.notes);
    setConnectKey((k) => k + 1);
    // Whatever happened in PayPal while it was disconnected comes in now.
    startSync(shop.id);
    toast({
      title: "PayPal connected",
      description: "Truce checked the keys with PayPal and is reading your disputes now.",
    });
  }

  return (
    <SettingsSection
      id="paypal"
      title="PayPal"
      description={
        shop.kind === "sample"
          ? "Where a real shop connects its own PayPal app."
          : "Truce reads your disputes through your own PayPal app, and answers them only when you approve."
      }
      aside={
        <Chip tone={state.tone} size="sm" dot={state.tone !== "outline"}>
          {state.label}
        </Chip>
      }
    >
      <div className="space-y-5">
        <PayPalConnect
          key={connectKey}
          shop={shop}
          variant="settings"
          onConnected={(response) => void connected(response)}
        />
        {shop.kind === "real" && shop.paypal && (
          <ConnectionDetails connection={shop.paypal} notes={notes} />
        )}
      </div>
    </SettingsSection>
  );
}

function ConnectionDetails({
  connection,
  notes,
}: {
  connection: PayPalConnection;
  notes: string[];
}) {
  const shop = useShop();
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const missing = PAYPAL_FEATURES.filter((f) => !connection.features[f.key]);

  async function check() {
    setChecking(true);
    try {
      const response = await checkPayPal(shop.id);
      const healthy = response.shop.paypal?.health === "ok";
      toast(
        healthy
          ? {
              title: "PayPal answered",
              description: response.notes[0] ?? "The keys work, and nothing has changed.",
            }
          : {
              title: "PayPal still can't be reached",
              description:
                response.shop.paypal?.problem ?? "Check the app's keys on PayPal's dashboard.",
              tone: "error",
            },
      );
    } catch (e) {
      toast({
        title: "Couldn't check the connection",
        description: errorMessage(e),
        tone: "error",
      });
    } finally {
      setChecking(false);
    }
  }

  async function disconnect() {
    setDisconnecting(true);
    const hadWebhook = connection.webhook.status === "registered";
    try {
      await disconnectPayPal(shop.id);
      setConfirming(false);
      toast({
        title: "PayPal disconnected",
        description: hadWebhook
          ? "Truce removed its webhook from your app and forgot the keys. Your cases stay here."
          : "Truce forgot the keys. Your cases stay here.",
      });
    } catch (e) {
      toast({ title: "Couldn't disconnect PayPal", description: errorMessage(e), tone: "error" });
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="space-y-5">
      <div className="border-line-soft grid gap-4 border-t pt-5 md:grid-cols-2">
        {/* What the app may do */}
        <div className="rounded-card border-line border p-4">
          <p className="text-ink flex items-center justify-between gap-2 text-[13px] font-medium">
            What the app lets Truce do
            <span className="text-ink-3 text-xs font-normal">
              {missing.length === 0
                ? "Everything"
                : `${PAYPAL_FEATURES.length - missing.length} of ${PAYPAL_FEATURES.length}`}
            </span>
          </p>
          <ul className="mt-3 space-y-2.5">
            {PAYPAL_FEATURES.map((feature, i) => {
              const on = connection.features[feature.key];
              return (
                <motion.li
                  key={feature.key}
                  initial={{ opacity: 0, y: 3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: duration.base, ease: ease.out, delay: i * 0.03 }}
                  className="flex items-start gap-2.5"
                >
                  <span
                    className={cn(
                      "mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full",
                      on ? "bg-lemon text-ink" : "bg-warn-50 text-warn-700",
                    )}
                  >
                    {on ? (
                      <Check aria-hidden className="size-3" strokeWidth={3} />
                    ) : (
                      <TriangleAlert aria-hidden className="size-3" />
                    )}
                    <span className="sr-only">{on ? "On:" : "Off:"}</span>
                  </span>
                  <span className="min-w-0 text-[13px] leading-5">
                    <span className={cn("font-medium", on ? "text-ink" : "text-warn-700")}>
                      {feature.label}
                    </span>
                    {!on && feature.required && (
                      <span className="text-warn-700"> · Truce needs this</span>
                    )}
                    <span className="text-ink-2 block">
                      {feature.key === "webhooks" &&
                      on &&
                      connection.webhook.status !== "registered"
                        ? "Allowed, though not in use yet: see the webhook"
                        : feature.does}
                    </span>
                  </span>
                </motion.li>
              );
            })}
          </ul>
        </div>

        {/* Webhook, history, syncs */}
        <div className="space-y-4">
          <Fact
            icon={<Webhook />}
            title="Webhook"
            tone={connection.webhook.status === "registered" ? "good" : "warn"}
            value={WEBHOOK_STATUS[connection.webhook.status]}
          >
            {connection.webhook.status === "registered"
              ? "PayPal tells Truce about new disputes and replies as they happen."
              : (connection.webhook.note ??
                "Truce checks PayPal for new disputes on a schedule instead.")}
            {connection.webhook.url && (
              <code className="bg-ink/[0.05] text-ink-2 mt-1.5 block truncate rounded-[5px] px-1.5 py-0.5 text-[11px]">
                {connection.webhook.url}
              </code>
            )}
          </Fact>
          <Fact
            icon={<ShieldCheck />}
            title="Order history"
            tone={shop.orderHistory === "full" ? "good" : "warn"}
            value={shop.orderHistory === "full" ? "Every order" : "Disputed orders only"}
          >
            {shop.orderHistory === "full"
              ? "Transaction Search is on, so Truce checks orders before they ship and knows the claims ratio."
              : "Transaction Search is off for this app, so the claims ratio stays unknown. Turn it on under the app's features, then check the connection."}
          </Fact>
          <SyncFact />
        </div>
      </div>

      {notes.length > 0 && (
        <ul className="rounded-card border-line-soft bg-cream/60 space-y-1.5 border px-4 py-3">
          {notes.map((note) => (
            <li key={note} className="text-ink-2 flex gap-2 text-[13px] leading-5">
              <span aria-hidden className="bg-ink-3 mt-[7px] size-1 shrink-0 rounded-full" />
              {note}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={check} loading={checking}>
          Check connection
        </Button>
        <SyncButton />
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(true)}
          className="text-risk-700 hover:bg-risk-50 hover:text-risk-700 sm:ml-auto"
        >
          Disconnect
        </Button>
      </div>

      <Dialog
        open={confirming}
        onClose={() => {
          if (!disconnecting) setConfirming(false);
        }}
        title="Disconnect PayPal?"
        description="Truce removes its webhook from your PayPal app and forgets the keys. Your cases and orders stay, but Truce can't read new disputes or send answers until you connect again."
        size="sm"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => setConfirming(false)}
              disabled={disconnecting}
              data-autofocus
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={disconnect} loading={disconnecting}>
              Disconnect
            </Button>
          </>
        }
      />
    </div>
  );
}

function Fact({
  icon,
  title,
  value,
  tone,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  tone: "good" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          "rounded-btn flex size-8 shrink-0 items-center justify-center [&_svg]:size-4",
          tone === "good" ? "bg-mist text-moss-deep" : "bg-warn-50 text-warn-700",
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium">
          {title}
          <span className={cn("font-normal", tone === "good" ? "text-moss-deep" : "text-warn-700")}>
            {value}
          </span>
        </p>
        <div className="text-ink-2 mt-0.5 text-[13px] leading-5">{children}</div>
      </div>
    </div>
  );
}

/** When Truce last read PayPal, and how a sync that's running is getting on. */
function SyncFact() {
  const shop = useShop();
  const dates = useShopDates();
  const sync = useSync(shop.id);
  const step = currentStep(sync);
  const seconds =
    sync.startedAt && sync.endedAt
      ? Math.max(1, Math.round((sync.endedAt - sync.startedAt) / 1000))
      : null;
  const progress =
    sync.status === "running" && sync.progress && sync.progress.total > 0
      ? ` · ${sync.progress.done} of ${sync.progress.total}`
      : "";

  return (
    <div className="flex gap-3">
      <span
        aria-hidden
        className={cn(
          "rounded-btn flex size-8 shrink-0 items-center justify-center [&_svg]:size-4",
          sync.status === "error" ? "bg-risk-50 text-risk-700" : "bg-mist text-moss-deep",
        )}
      >
        {sync.status === "running" ? (
          <Spinner className="size-4" />
        ) : sync.status === "error" ? (
          <CircleAlert />
        ) : (
          <RefreshCw />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink flex flex-wrap items-baseline gap-x-2 text-[13px] font-medium">
          Last sync
          <span className="text-ink-2 font-normal">
            {shop.lastSyncAt ? dates.ago(shop.lastSyncAt) : "Not yet"}
          </span>
        </p>
        <div className="text-ink-2 mt-0.5 min-h-5 text-[13px] leading-5" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={`${sync.status}-${step?.id ?? ""}`}
              initial={{ opacity: 0, y: 2 }}
              animate={{
                opacity: 1,
                y: 0,
                transition: { duration: duration.fast, ease: ease.out },
              }}
              exit={{ opacity: 0, transition: { duration: duration.instant } }}
              className={cn(sync.status === "error" && "text-risk-700")}
            >
              {sync.status === "running"
                ? `${step?.label ?? "Starting"}${progress}`
                : sync.status === "done" && sync.result
                  ? `Synced ${sync.result.cases} ${sync.result.cases === 1 ? "case" : "cases"} and ${sync.result.orders} ${sync.result.orders === 1 ? "order" : "orders"}${seconds ? ` in ${seconds} s` : ""}.`
                  : sync.status === "error"
                    ? (sync.error ?? "The sync stopped early.")
                    : shop.lastSyncAt
                      ? `On ${dates.dateTime(shop.lastSyncAt)}. ${
                          shop.paypal?.webhook.status === "registered"
                            ? "PayPal's updates and the nightly check keep it current."
                            : "Truce checks PayPal every minute while you're here, and every night."
                        }`
                      : "Truce reads your disputes and orders from PayPal."}
            </motion.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function SyncButton() {
  const shop = useShop();
  const sync = useSync(shop.id);
  const running = sync.status === "running";
  return (
    <Button
      variant="secondary"
      size="sm"
      loading={running}
      onClick={() => {
        if (sync.status !== "idle") dismissSync(shop.id);
        startSync(shop.id);
      }}
    >
      {running ? "Syncing" : "Sync now"}
    </Button>
  );
}
