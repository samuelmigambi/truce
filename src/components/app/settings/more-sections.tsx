"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { deleteShop } from "@/lib/client/actions";
import { errorMessage, shopHref } from "@/lib/client/api";
import { useMe, useRole, useShop } from "@/lib/client/shop-context";
import { Avatar } from "../../ui/avatar";
import { Button } from "../../ui/button";
import { Chip } from "../../ui/chip";
import { Input } from "../../ui/field";
import { FormField } from "../../ui/form-field";
import { Dialog } from "../../ui/overlay";
import { useToast } from "../../ui/toast";
import { useStartOver } from "../shell/sample-card";
import { SettingsSection } from "./section";

const ROLE = { owner: "Owner", admin: "Admin", member: "Member" } as const;

/** Who can open the shop. Owners only for now; the model leaves room for teammates. */
export function TeamSection() {
  const shop = useShop();
  const { user } = useMe();
  const members = Object.values(shop.members).sort(
    (a, b) =>
      Number(b.role === "owner") - Number(a.role === "owner") ||
      (a.name || a.email).localeCompare(b.name || b.email),
  );
  return (
    <SettingsSection id="team" title="Team" description="Everyone who can open this shop.">
      <ul className="divide-line-soft border-line-soft divide-y rounded-[10px] border">
        {members.map((m) => (
          <li key={m.uid} className="flex items-center gap-3 px-3.5 py-3">
            <Avatar name={m.name || m.email} />
            <div className="min-w-0 flex-1">
              <p className="text-ink truncate text-sm font-medium">
                {m.name || m.email}
                {m.uid === user.uid && <span className="text-ink-3 font-normal"> · you</span>}
              </p>
              <p className="text-ink-2 truncate text-[13px]">{m.email}</p>
            </div>
            <Chip tone={m.role === "owner" ? "mist" : "outline"} size="sm">
              {ROLE[m.role]}
            </Chip>
          </li>
        ))}
      </ul>
      <div className="border-line-strong mt-4 flex flex-col gap-3 rounded-[10px] border border-dashed px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-ink flex flex-wrap items-center gap-2 text-sm font-medium">
            Invite teammates
            <Chip tone="outline" size="sm">
              Coming soon
            </Chip>
          </p>
          <p id="invite-note" className="text-ink-2 mt-0.5 text-[13px] leading-5">
            Inviting teammates is coming. Each will sign in as themselves and choose their own
            notifications.
          </p>
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled
          aria-describedby="invite-note"
          className="shrink-0 self-start sm:self-center"
        >
          Invite
        </Button>
      </div>
    </SettingsSection>
  );
}

/** Billing doesn't exist yet, and the page says so plainly. */
export function PlanSection() {
  return (
    <SettingsSection
      id="plan"
      title="Plan"
      aside={
        <Chip tone="lemon" size="sm">
          Free during the beta
        </Chip>
      }
    >
      <p className="text-ink text-sm leading-relaxed text-pretty">
        Truce is free while it&rsquo;s in beta, with every feature in every shop and no card on
        file.
      </p>
      <p className="text-ink-2 mt-2 text-[13px] leading-relaxed text-pretty">
        When paid plans start, they&rsquo;ll be a flat monthly price, never a cut of what you win,
        and you&rsquo;ll hear about it well before anything changes.
      </p>
    </SettingsSection>
  );
}

function DangerRow({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-ink text-sm font-medium">{title}</p>
        <p className="text-ink-2 mt-0.5 max-w-[520px] text-[13px] leading-5 text-pretty">
          {children}
        </p>
      </div>
      <div className="shrink-0">{action}</div>
    </div>
  );
}

/** Starting a sample over, and deleting the shop for good (its owner only). */
export function DangerSection() {
  const shop = useShop();
  const role = useRole();
  const startOver = useStartOver();
  const [deleting, setDeleting] = useState(false);
  const owner = role === "owner";

  return (
    <SettingsSection
      id="danger"
      title="Danger zone"
      tone="danger"
      description="These can't be undone."
    >
      <div className="divide-line-soft divide-y">
        {shop.kind === "sample" && (
          <DangerRow
            title="Start the sample over"
            action={
              <Button variant="secondary" onClick={startOver.ask}>
                Start over
              </Button>
            }
          >
            Every case, order and approval goes back to the start, and the conversation with Truce
            is cleared.
          </DangerRow>
        )}
        <DangerRow
          title="Delete this shop"
          action={
            <Button variant="danger" disabled={!owner} onClick={() => setDeleting(true)}>
              Delete shop
            </Button>
          }
        >
          {owner
            ? `Deletes ${shop.name} and everything in it: cases, orders, analyses, notifications${
                shop.kind === "real" ? ", and the PayPal keys and webhook" : ""
              }. Your other shops aren't touched.`
            : "Only the shop's owner can delete it."}
        </DangerRow>
      </div>
      {startOver.dialog}
      <DeleteShopDialog open={deleting} onClose={() => setDeleting(false)} />
    </SettingsSection>
  );
}

function DeleteShopDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <DialogShell open={open} onClose={onClose}>
      {open && <DeleteShopForm onClose={onClose} />}
    </DialogShell>
  );
}

function DialogShell({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const shop = useShop();
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Delete ${shop.name}?`}
      description="The shop and everything in it are deleted for good. Nothing can bring them back."
      size="sm"
    >
      {children}
    </Dialog>
  );
}

/** Typing the shop's name is the confirmation: it's slow on purpose. */
function DeleteShopForm({ onClose }: { onClose: () => void }) {
  const shop = useShop();
  const router = useRouter();
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const matches = typed.trim() === shop.name.trim();

  async function remove() {
    if (!matches || busy) return;
    setBusy(true);
    setError(null);
    try {
      const me = await deleteShop(shop.id);
      const next = me?.shops.find((s) => s.status === "ready" && s.id !== shop.id);
      toast({ title: `${shop.name} is deleted`, description: "Everything in it is gone." });
      router.replace(next ? shopHref(next.id) : "/onboarding");
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void remove();
      }}
      className="space-y-4"
    >
      <FormField
        id="delete-shop-name"
        label={
          <>
            Type <span className="font-semibold">{shop.name}</span> to confirm
          </>
        }
      >
        {(control) => (
          <Input
            {...control}
            data-autofocus
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            disabled={busy}
          />
        )}
      </FormField>
      {error && (
        <p role="alert" className="bg-risk-50 text-risk-700 rounded-[10px] px-3 py-2.5 text-[13px]">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="danger" loading={busy} disabled={!matches}>
          Delete for good
        </Button>
      </div>
    </form>
  );
}
