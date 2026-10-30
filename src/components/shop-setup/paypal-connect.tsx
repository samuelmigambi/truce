"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, Check, FlaskConical, Lock, Minus, TriangleAlert, Zap } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ConnectPayPalResponse } from "@/lib/api-types";
import { errorMessage, HttpError, postJson, shopApi } from "@/lib/client/api";
import { PAYPAL_FEATURES } from "@/lib/client/labels";
import type { PayPalConnection, PayPalEnvironment, PayPalFeatures, Shop } from "@/lib/domain";
import { connectPayPalSchema, issuesToFields } from "@/lib/validation";
import { duration, ease, spring } from "../motion";
import { Button } from "../ui/button";
import { Chip, StatusDot } from "../ui/chip";
import { cn } from "../ui/cn";
import { Input } from "../ui/field";
import { FormField } from "../ui/form-field";
import { PasswordInput } from "../ui/password-input";
import { RadioSegments } from "../ui/radio-group";
import { useToast } from "../ui/toast";
import { fieldId, focusFirstError, shortKey, without } from "./fields";

/**
 * Connecting a shop's PayPal. One-click connection (PayPal's partner onboarding) is shown as
 * coming, honestly; the path that works today is the seller's own REST app: Truce checks its
 * client ID and secret with PayPal, reads what the app is allowed to do, and keeps the secret
 * encrypted on the server. Renders its own form, so don't put it inside another one.
 */

export const ENVIRONMENT_LABEL: Record<PayPalEnvironment, string> = {
  sandbox: "Sandbox",
  live: "Live",
};

const DASHBOARD: Record<PayPalEnvironment, string> = {
  sandbox: "https://developer.paypal.com/dashboard/applications/sandbox",
  live: "https://developer.paypal.com/dashboard/applications/live",
};

/** What's lost when a permission is off; the labels themselves are the app's own (PAYPAL_FEATURES). */
const WHEN_OFF: Record<keyof PayPalFeatures, string> = {
  disputes: "Truce can't see your disputes.",
  respond: "Truce can't answer disputes yet.",
  transactions: "Truce sees only orders with a dispute, so your claims ratio stays unknown.",
  tracking: "Truce can't add tracking numbers to PayPal orders.",
  webhooks: "Truce checks PayPal for new disputes on a schedule instead.",
};

const PREFIX = "paypal";
const FORM_FIELDS = ["environment", "clientId", "clientSecret"] as const;

export function PayPalConnect({
  shop,
  onConnected,
  variant = "onboarding",
}: {
  shop: Shop;
  onConnected: (response: ConnectPayPalResponse) => void;
  variant?: "onboarding" | "settings";
}) {
  if (shop.kind === "sample") return <SimulatedPayPal compact={variant === "settings"} />;
  return <RealConnect key={shop.id} shop={shop} onConnected={onConnected} variant={variant} />;
}

function RealConnect({
  shop,
  onConnected,
  variant,
}: {
  shop: Shop;
  onConnected: (response: ConnectPayPalResponse) => void;
  variant: "onboarding" | "settings";
}) {
  const [editing, setEditing] = useState(false);
  const [result, setResult] = useState<ConnectPayPalResponse | null>(null);
  const connection = shop.paypal ?? result?.shop.paypal ?? null;
  const showForm = !connection || editing;

  function connected(response: ConnectPayPalResponse) {
    setResult(response);
    setEditing(false);
    onConnected(response);
  }

  if (variant === "settings") {
    return (
      <div className="space-y-4">
        {connection ? (
          <ConnectionRow
            connection={connection}
            timeZone={shop.timeZone}
            action={
              <Button
                variant="secondary"
                size="sm"
                aria-expanded={editing}
                aria-controls="paypal-reconnect"
                onClick={() => setEditing((open) => !open)}
              >
                {editing ? "Cancel" : "Reconnect"}
              </Button>
            }
          />
        ) : (
          <OneClick compact />
        )}
        <AnimatePresence initial={false}>
          {showForm && (
            <motion.div
              id="paypal-reconnect"
              key="form"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: duration.base, ease: ease.out }}
              className="overflow-hidden"
            >
              <div className={cn(connection && "border-line-soft border-t pt-4")}>
                <ConnectForm shop={shop} onConnected={connected} compact />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  if (!showForm && connection) {
    return (
      <Connected
        connection={connection}
        notes={result?.notes ?? []}
        fresh={Boolean(result)}
        onReconnect={() => setEditing(true)}
      />
    );
  }

  return (
    <div className="space-y-5">
      {!connection && <OneClick />}
      {!connection && (
        <div className="flex items-center gap-3" aria-hidden>
          <span className="bg-line h-px flex-1" />
          <span className="text-ink-3 text-xs">For now, connect your PayPal app</span>
          <span className="bg-line h-px flex-1" />
        </div>
      )}
      <ConnectForm
        shop={shop}
        onConnected={connected}
        onCancel={connection ? () => setEditing(false) : undefined}
      />
    </div>
  );
}

/** The one-click way, shown as coming: it needs PayPal to approve Truce as a partner first. */
function OneClick({ compact = false }: { compact?: boolean }) {
  return (
    <div className={cn("rounded-card border-line flex gap-3 border", compact ? "p-3.5" : "p-4")}>
      <span
        aria-hidden
        className="rounded-btn bg-ink/[0.05] text-ink-2 flex size-9 shrink-0 items-center justify-center [&_svg]:size-[18px]"
      >
        <Zap />
      </span>
      <div className="min-w-0 flex-1 sm:flex sm:items-center sm:gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-ink flex flex-wrap items-center gap-2 text-sm font-medium">
            Connect with PayPal
            <Chip tone="outline" size="sm">
              Coming soon
            </Chip>
          </p>
          <p
            id="paypal-one-click-note"
            className="text-ink-2 mt-0.5 text-[13px] leading-5 text-pretty"
          >
            One click, no keys to copy. It needs PayPal to approve Truce as a partner first.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled
          aria-describedby="paypal-one-click-note"
          className="mt-3 shrink-0 sm:mt-0"
        >
          Connect with PayPal
        </Button>
      </div>
    </div>
  );
}

interface Problem {
  message: string;
  /** PayPal's dashboard, when the fix is made there. */
  link?: string;
}

/** The server's own words say what PayPal refused; a link to the dashboard goes with them. */
function describeProblem(error: unknown, environment: PayPalEnvironment): Problem {
  const atPayPal =
    error instanceof HttpError &&
    (error.code === "paypal_rejected_keys" || error.code === "paypal_missing_features");
  return {
    message: errorMessage(error),
    link: atPayPal ? DASHBOARD[environment] : undefined,
  };
}

function ConnectForm({
  shop,
  onConnected,
  onCancel,
  compact = false,
}: {
  shop: Shop;
  onConnected: (response: ConnectPayPalResponse) => void;
  onCancel?: () => void;
  compact?: boolean;
}) {
  const [environment, setEnvironment] = useState<PayPalEnvironment>(
    shop.paypal?.environment ?? "sandbox",
  );
  const [clientId, setClientId] = useState("");
  const [secret, setSecret] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const toast = useToast();
  const [sending, setSending] = useState(false);
  const id = (key: string) => fieldId(PREFIX, key);
  const envLabel = id("environment-label");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (sending) return;
    const parsed = connectPayPalSchema.safeParse({ environment, clientId, clientSecret: secret });
    if (!parsed.success) {
      const found = issuesToFields(parsed.error);
      setErrors(found);
      focusFirstError(PREFIX, FORM_FIELDS, found);
      return;
    }
    setErrors({});
    setSending(true);
    try {
      const response = await postJson<ConnectPayPalResponse>(
        shopApi(shop.id, "paypal"),
        parsed.data,
      );
      setSecret("");
      setClientId("");
      onConnected(response);
    } catch (error) {
      const fields = error instanceof HttpError ? error.fields : {};
      if (Object.keys(fields).length > 0) {
        setErrors(fields);
        focusFirstError(PREFIX, FORM_FIELDS, fields);
      }
      const problem = describeProblem(error, environment);
      toast({
        key: "paypal-connect",
        tone: "error",
        title: problem.message,
        action: problem.link
          ? {
              label: `Open your ${ENVIRONMENT_LABEL[environment].toLowerCase()} apps on PayPal`,
              href: problem.link,
            }
          : undefined,
      });
    } finally {
      setSending(false);
    }
  }

  function clear(key: string) {
    if (errors[key]) setErrors((current) => without(current, key));
  }

  return (
    <form method="post" noValidate onSubmit={submit} aria-label="Connect your PayPal app">
      <div className={cn(compact ? "space-y-4" : "space-y-5")}>
        <div className="space-y-2">
          <p id={envLabel} className="text-ink text-[13px] font-[560]">
            Environment
          </p>
          <RadioSegments
            labelledBy={envLabel}
            describedBy={id("environment-hint")}
            value={environment}
            onChange={(next) => {
              setEnvironment(next);
            }}
            disabled={sending}
            options={[
              { value: "sandbox", label: "Sandbox" },
              { value: "live", label: "Live" },
            ]}
          />
          <p id={id("environment-hint")} className="text-ink-2 text-[13px] leading-5">
            {environment === "sandbox"
              ? "PayPal's test environment, with test buyers and no real money. A good place to start."
              : "Your real PayPal business account. Truce acts on real disputes, only when you approve."}
          </p>
        </div>

        <ol className="space-y-3">
          <SetupStep number={1}>
            Open your apps on{" "}
            <ExternalLink href={DASHBOARD[environment]}>
              PayPal&rsquo;s developer dashboard
            </ExternalLink>{" "}
            and create a REST app, or open the one your shop already uses.
          </SetupStep>
          <SetupStep number={2}>
            In the app&rsquo;s features, turn on <strong className="font-semibold">Disputes</strong>{" "}
            and <strong className="font-semibold">Transaction search</strong>, then save.
          </SetupStep>
          <SetupStep number={3}>
            Copy the app&rsquo;s client ID and secret into the fields below.
          </SetupStep>
        </ol>

        <div className="grid gap-4">
          <FormField id={id("clientId")} label="Client ID" error={errors.clientId}>
            {(control) => (
              <Input
                {...control}
                value={clientId}
                onChange={(event) => {
                  setClientId(event.target.value);
                  clear("clientId");
                }}
                disabled={sending}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                className="font-mono text-[13px]"
              />
            )}
          </FormField>
          <FormField
            id={id("clientSecret")}
            label="Secret"
            error={errors.clientSecret}
            hint="Truce checks it with PayPal, then encrypts it. It's never shown again."
          >
            {(control) => (
              <PasswordInput
                {...control}
                revealLabel="Show secret"
                value={secret}
                onChange={(event) => {
                  setSecret(event.target.value);
                  clear("clientSecret");
                }}
                disabled={sending}
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore
                data-lpignore="true"
                data-form-type="other"
                className="font-mono text-[13px]"
              />
            )}
          </FormField>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" loading={sending}>
            {sending ? "Checking with PayPal…" : "Verify and connect"}
          </Button>
          {onCancel && (
            <Button variant="ghost" onClick={onCancel} disabled={sending}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    </form>
  );
}

function SetupStep({ number, children }: { number: number; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="bg-ink/[0.06] text-ink flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums"
      >
        {number}
      </span>
      <p className="text-ink-2 pt-0.5 text-sm leading-relaxed text-pretty">{children}</p>
    </li>
  );
}

function ExternalLink({
  href,
  children,
  className,
}: {
  href: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "text-moss-deep font-medium underline decoration-current/30 underline-offset-[3px] transition-[text-decoration-color] hover:decoration-current",
        className,
      )}
    >
      {children}
      <ArrowUpRight aria-hidden className="ml-0.5 inline size-3.5 align-[-2px]" />
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

/** Right after connecting, and whenever onboarding comes back to it: what the app can do. */
function Connected({
  connection,
  notes,
  fresh,
  onReconnect,
}: {
  connection: PayPalConnection;
  notes: string[];
  fresh: boolean;
  onReconnect: () => void;
}) {
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (fresh) heading.current?.focus({ preventScroll: true });
  }, [fresh]);

  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3.5">
        <motion.span
          aria-hidden
          initial={fresh ? { scale: 0.4, opacity: 0 } : false}
          animate={{ scale: 1, opacity: 1 }}
          transition={spring.pop}
          className="bg-lemon text-ink flex size-10 shrink-0 items-center justify-center rounded-full"
        >
          <Check className="size-5" strokeWidth={2.5} />
        </motion.span>
        <div className="min-w-0">
          <p
            ref={heading}
            tabIndex={-1}
            className="text-ink text-base leading-6 font-semibold focus:outline-none"
          >
            Connected to PayPal
          </p>
          <p className="text-ink-2 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <EnvironmentChip environment={connection.environment} />
            <span>
              Client ID{" "}
              <code className="text-ink font-mono text-xs">{shortKey(connection.clientId)}</code>
            </span>
          </p>
        </div>
      </div>

      <FeatureList connection={connection} notes={notes} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-ink-2 flex items-center gap-2 text-[13px]">
          <Lock aria-hidden className="text-moss size-3.5 shrink-0" />
          Your secret is encrypted. Truce never shows it again.
        </p>
        <Button variant="secondary" size="sm" onClick={onReconnect} className="self-start">
          Use different keys
        </Button>
      </div>
    </div>
  );
}

/**
 * Whether Truce can use one part of the connection. Webhooks count only once one is registered:
 * the app's permission alone says it could be, not that it is.
 */
export function featureOn(connection: PayPalConnection, key: keyof PayPalFeatures): boolean {
  return key === "webhooks" ? connection.webhook.status === "registered" : connection.features[key];
}

interface Row {
  key: keyof PayPalFeatures;
  tone: "on" | "off" | "neutral";
  title: string;
  detail: string;
}

/** The connection as rows: each permission, and the webhook as it actually stands. */
function rowsFor(connection: PayPalConnection): Row[] {
  return PAYPAL_FEATURES.map((feature): Row => {
    if (feature.key === "webhooks") {
      const { status, note } = connection.webhook;
      if (status === "registered") {
        return {
          key: feature.key,
          tone: "on",
          title: feature.label,
          detail: "PayPal sends dispute updates as they happen",
        };
      }
      return {
        key: feature.key,
        tone: status === "failed" ? "off" : "neutral",
        title: status === "failed" ? "Webhooks couldn't be registered" : "Webhooks not registered",
        detail: note ?? WHEN_OFF.webhooks,
      };
    }
    return connection.features[feature.key]
      ? { key: feature.key, tone: "on", title: feature.label, detail: feature.does }
      : {
          key: feature.key,
          tone: "off",
          title: feature.label + " is off",
          detail: WHEN_OFF[feature.key],
        };
  });
}

/** PayPal's notes that no row already says, so each fact shows once. */
function extraNotes(notes: string[], connection: PayPalConnection): string[] {
  const webhookNote = connection.webhook.note?.trim();
  return notes.filter((note) => {
    const text = note.trim();
    if (webhookNote && text === webhookNote) return false;
    if (/webhook/i.test(text)) return false;
    if (!connection.features.transactions && /transaction search|order history/i.test(text)) {
      return false;
    }
    if (!connection.features.tracking && /tracking|tracker/i.test(text)) return false;
    return true;
  });
}

const ROW_ICON: Record<Row["tone"], { box: string; icon: ReactNode; word: string }> = {
  on: {
    box: "bg-moss/[0.12] text-moss-deep",
    icon: <Check aria-hidden className="size-3" strokeWidth={3} />,
    word: "On:",
  },
  off: {
    box: "bg-warn-50 text-warn-700",
    icon: <TriangleAlert aria-hidden className="size-3" />,
    word: "Off:",
  },
  neutral: {
    box: "bg-ink/[0.06] text-ink-3",
    icon: <Minus aria-hidden className="size-3" strokeWidth={2.5} />,
    word: "Not set up:",
  },
};

function FeatureList({ connection, notes }: { connection: PayPalConnection; notes: string[] }) {
  const extra = extraNotes(notes, connection);
  return (
    <div className="rounded-card border-line border p-4">
      <p className="text-ink text-[13px] font-medium">What Truce can do with this app</p>
      <ul className="mt-2.5 space-y-2">
        {rowsFor(connection).map((row, index) => (
          <motion.li
            key={row.key}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: duration.base, ease: ease.out, delay: 0.05 + index * 0.04 }}
            className="flex items-start gap-2.5 text-[13px] leading-5"
          >
            <span
              className={cn(
                "mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full",
                ROW_ICON[row.tone].box,
              )}
            >
              {ROW_ICON[row.tone].icon}
              <span className="sr-only">{ROW_ICON[row.tone].word}</span>
            </span>
            <span className="min-w-0">
              <span
                className={cn("font-medium", row.tone === "off" ? "text-warn-700" : "text-ink")}
              >
                {row.title}
              </span>
              <span className="text-ink-2 block">{row.detail}</span>
            </span>
          </motion.li>
        ))}
      </ul>
      {extra.length > 0 && (
        <ul className="border-line-soft mt-3 space-y-1.5 border-t pt-3">
          {extra.map((note) => (
            <li key={note} className="text-ink-2 flex gap-2 text-[13px] leading-5">
              <span aria-hidden className="bg-ink-3 mt-[7px] size-1 shrink-0 rounded-full" />
              {note}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function EnvironmentChip({ environment }: { environment: PayPalEnvironment }) {
  return environment === "live" ? (
    <Chip tone="ink" size="sm" dot>
      Live
    </Chip>
  ) : (
    <Chip tone="mist" size="sm" dot>
      Sandbox
    </Chip>
  );
}

function checkedAt(iso: string, timeZone: string): string {
  const date = new Date(iso);
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  };
  try {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" }).format(date);
  }
}

/** Settings: the current connection on one line, with its health. */
function ConnectionRow({
  connection,
  timeZone,
  action,
}: {
  connection: PayPalConnection;
  timeZone: string;
  action: ReactNode;
}) {
  const healthy = connection.health === "ok";
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="text-ink flex flex-wrap items-center gap-2 text-sm font-medium">
          PayPal REST app
          <EnvironmentChip environment={connection.environment} />
        </p>
        <p className="text-ink-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
          <span>
            Client ID{" "}
            <code className="text-ink font-mono text-xs">{shortKey(connection.clientId)}</code>
          </span>
          <span
            className={cn(
              "inline-flex items-center gap-1.5 font-medium",
              healthy ? "text-moss-deep" : "text-risk-700",
            )}
          >
            <StatusDot tone={healthy ? "moss" : "risk"} />
            {healthy ? "Working" : "Can't reach PayPal"}
          </span>
          <span className="text-ink-3">Checked {checkedAt(connection.checkedAt, timeZone)}</span>
        </p>
        {!healthy && connection.problem && (
          <p className="text-risk-700 text-[13px] leading-5">{connection.problem}</p>
        )}
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/** A sample shop never talks to PayPal; it says so instead of asking for keys. */
function SimulatedPayPal({ compact }: { compact: boolean }) {
  return (
    <div
      className={cn(
        "rounded-card bg-mist/60 border-mist-line flex gap-3.5 border",
        compact ? "p-3.5" : "p-4 sm:p-5",
      )}
    >
      <span
        aria-hidden
        className="rounded-btn bg-paper text-moss-deep flex size-9 shrink-0 items-center justify-center [&_svg]:size-[18px]"
      >
        <FlaskConical />
      </span>
      <div className="min-w-0">
        <p className="text-ink text-sm font-semibold">PayPal is simulated in the sample shop</p>
        <p className="text-ink-2 mt-1 text-[13px] leading-5 text-pretty">
          Wick &amp; Ember runs on sample data. When you approve a move, Truce records the PayPal
          call it would make, marked &ldquo;Simulated&rdquo;, and nothing reaches PayPal.
        </p>
        {!compact && (
          <p className="text-ink-2 mt-2 text-[13px] leading-5 text-pretty">
            The cases, analyses and approvals work just as they would in your own shop.
          </p>
        )}
      </div>
    </div>
  );
}
