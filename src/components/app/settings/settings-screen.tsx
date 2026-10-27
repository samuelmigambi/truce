"use client";

import { motion } from "motion/react";
import { Cpu, Database, Globe, RotateCcw, Wallet } from "lucide-react";
import { useState, type ReactNode } from "react";
import { resetDemo } from "@/lib/client/actions";
import { errorMessage } from "@/lib/client/api";
import { clearChat } from "@/lib/client/chat";
import { formatDate } from "@/lib/client/format";
import { useSession, useStatus } from "@/lib/client/hooks";
import { fullModelName, JOBS, modelTier } from "@/lib/client/labels";
import { useNow } from "@/lib/client/now";
import { duration, ease } from "../../motion";
import { Button } from "../../ui/button";
import { Card, CardBody, CardHeader } from "../../ui/card";
import { StatusDot } from "../../ui/chip";
import { cn } from "../../ui/cn";
import { EmptyState } from "../../ui/empty-state";
import { ModelSwatch } from "../../ui/model-badge";
import { Dialog } from "../../ui/overlay";
import { Skeleton } from "../../ui/skeleton";
import { useToast } from "../../ui/toast";
import { ModeChip } from "../mode-chip";
import { PageHeader, Screen } from "../page-header";

/** Settings: what's connected, which model does each job, and the mode. */
export function SettingsScreen() {
  const status = useStatus();
  const workspace = useSession().data?.workspace;
  const now = useNow();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function reset() {
    setResetting(true);
    try {
      await resetDemo();
      clearChat();
      setConfirming(false);
      toast({
        title: "Demo reset",
        description: "Every case, order and approval is back to the start.",
      });
    } catch (e) {
      toast({ title: "Couldn't reset the demo", description: errorMessage(e), tone: "error" });
    } finally {
      setResetting(false);
    }
  }

  const s = status.data;
  return (
    <Screen className="max-w-[880px]">
      <PageHeader
        title="Settings"
        description="Connections, models and the mode this workspace runs in"
      />

      <div className="mt-8 space-y-5">
        <Card>
          <CardHeader title="Mode" description="Truce always shows which one you're in" />
          <CardBody>
            {workspace ? (
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2.5">
                  <ModeChip workspace={workspace} />
                  <p className="text-ink-2 max-w-[560px] text-sm leading-relaxed">
                    {workspace.kind === "demo"
                      ? `Your own copy of the Wick & Ember demo. Nemotron runs for real; PayPal calls are simulated and recorded.${
                          workspace.expiresAt
                            ? ` It's kept until ${formatDate(workspace.expiresAt, now)}.`
                            : ""
                        }`
                      : "The owner's live workspace, synced from the PayPal sandbox. Approving a case calls PayPal for real."}
                  </p>
                </div>
                {workspace.kind === "demo" && (
                  <Button
                    variant="secondary"
                    icon={<RotateCcw />}
                    onClick={() => setConfirming(true)}
                    className="shrink-0"
                  >
                    Reset demo
                  </Button>
                )}
              </div>
            ) : (
              <Skeleton className="h-10" />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Connections"
            description="Checked on the server; keys never reach the browser"
          />
          <CardBody>
            {status.error && !s ? (
              <EmptyState
                tone="error"
                className="py-8"
                title="Couldn't check the connections"
                description={errorMessage(status.error)}
                action={<Button onClick={() => void status.mutate()}>Try again</Button>}
              />
            ) : (
              <ul className="divide-line-soft divide-y">
                <Connection
                  icon={<Wallet />}
                  name="PayPal"
                  detail="Orders, tracking and disputes, on the sandbox"
                  state={s ? (s.paypal ? "on" : "off") : "loading"}
                />
                <Connection
                  icon={<Cpu />}
                  name="Nebius Token Factory"
                  detail="Runs the NVIDIA Nemotron models"
                  state={s ? (s.tokenFactory ? "on" : "off") : "loading"}
                />
                <Connection
                  icon={<Globe />}
                  name="Tavily"
                  detail="Reads the live listing as the buyer saw it"
                  state={s ? (s.tavily ? "on" : "off") : "loading"}
                  offNote="Truce falls back to the catalog text, and says so"
                />
                <Connection
                  icon={<Database />}
                  name="Data store"
                  detail={
                    s
                      ? s.store === "firestore"
                        ? "Firestore"
                        : "In memory, cleared when the server restarts"
                      : "Where cases and analyses are kept"
                  }
                  state={s ? "on" : "loading"}
                />
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title="Models"
            description="Each job goes to the model that does it well for the least"
          />
          <CardBody>
            <ul className="divide-line-soft divide-y">
              {JOBS.map((job, i) => {
                const model = s?.models[job.job];
                return (
                  <motion.li
                    key={job.job}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: duration.base, ease: ease.out, delay: i * 0.04 }}
                    className="grid grid-cols-1 gap-1 py-3.5 sm:grid-cols-[180px_1fr] sm:gap-4"
                  >
                    <div>
                      <p className="text-ink text-sm font-medium">{job.title}</p>
                    </div>
                    <div className="min-w-0">
                      {model ? (
                        <p className="text-ink flex items-center gap-2 text-sm">
                          <ModelSwatch tier={modelTier(model)} />
                          {fullModelName(model)}
                          <code className="bg-ink/[0.05] text-ink-2 truncate rounded-[5px] px-1.5 py-0.5 text-[11px]">
                            {model}
                          </code>
                        </p>
                      ) : (
                        <Skeleton className="h-4 w-56" />
                      )}
                      <p className="text-ink-2 mt-1 text-[13px]">{job.does}</p>
                    </div>
                  </motion.li>
                );
              })}
              <li className="grid grid-cols-1 gap-1 py-3.5 sm:grid-cols-[180px_1fr] sm:gap-4">
                <p className="text-ink text-sm font-medium">The math</p>
                <div>
                  <p className="text-ink flex items-center gap-2 text-sm">
                    <ModelSwatch tier="code" />
                    Plain code
                  </p>
                  <p className="text-ink-2 mt-1 text-[13px]">
                    Fees, deadlines, the claims ratio, Seller Protection and the cost of each move
                  </p>
                </div>
              </li>
            </ul>
          </CardBody>
        </Card>
      </div>

      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Reset your demo copy?"
        description="Every case, order and approval goes back to the start. Saved analyses replay from their recorded runs."
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button onClick={reset} loading={resetting} data-autofocus>
              Reset demo
            </Button>
          </>
        }
      />
    </Screen>
  );
}

function Connection({
  icon,
  name,
  detail,
  state,
  offNote,
}: {
  icon: ReactNode;
  name: string;
  detail: string;
  state: "on" | "off" | "loading";
  offNote?: string;
}) {
  return (
    <li className="flex items-center gap-3.5 py-3.5">
      <span className="rounded-btn bg-ink/[0.05] text-ink-2 flex size-9 shrink-0 items-center justify-center [&_svg]:size-[18px]">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-medium">{name}</p>
        <p className="text-ink-2 truncate text-[13px]">
          {state === "off" && offNote ? offNote : detail}
        </p>
      </div>
      {state === "loading" ? (
        <Skeleton className="rounded-chip h-5 w-24" />
      ) : (
        <span
          className={cn(
            "flex items-center gap-2 text-[13px] font-medium",
            state === "on" ? "text-moss-deep" : "text-ink-2",
          )}
        >
          <StatusDot tone={state === "on" ? "moss" : "neutral"} />
          {state === "on" ? "Connected" : "Not connected"}
        </span>
      )}
    </li>
  );
}
