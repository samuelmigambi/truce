"use client";

import { useRef, useState } from "react";
import type { AddTrackingRequest, OrderWithChecks } from "@/lib/api-types";
import { addTracking } from "@/lib/client/actions";
import { errorMessage } from "@/lib/client/api";
import { useShop } from "@/lib/client/shop-context";
import { Button } from "../../ui/button";
import { Field, Input } from "../../ui/field";
import { Select } from "../../ui/select";
import { Dialog } from "../../ui/overlay";
import { useToast } from "../../ui/toast";

const CARRIERS: { value: AddTrackingRequest["carrier"]; label: string }[] = [
  { value: "USPS", label: "USPS" },
  { value: "UPS", label: "UPS" },
  { value: "FEDEX", label: "FedEx" },
  { value: "DHL", label: "DHL" },
];

/** Adds a tracking number, which also goes to the PayPal order: one of Seller Protection's conditions. */
export function TrackingDialog({
  order,
  onClose,
}: {
  order: OrderWithChecks | null;
  onClose: () => void;
}) {
  const shop = useShop();
  return (
    <Dialog
      open={order !== null}
      onClose={onClose}
      title={order ? `Add tracking to ${order.id}` : "Add tracking"}
      description={
        shop.kind === "sample"
          ? "In this sample shop it's recorded on the order; a real shop sends it to PayPal, so the shipment counts toward Seller Protection."
          : "Truce adds it to the PayPal order too, so the shipment counts toward Seller Protection."
      }
    >
      {order && <TrackingForm key={order.id} order={order} onDone={onClose} />}
    </Dialog>
  );
}

function TrackingForm({ order, onDone }: { order: OrderWithChecks; onDone: () => void }) {
  const [carrier, setCarrier] = useState<AddTrackingRequest["carrier"]>("USPS");
  const [number, setNumber] = useState("");
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const shop = useShop();
  const clean = number.replace(/\s+/g, "").toUpperCase();
  const invalid = clean.length < 8 || clean.length > 40 || !/^[A-Z0-9]+$/.test(clean);

  async function submit() {
    setTouched(true);
    if (invalid) {
      input.current?.focus();
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const response = await addTracking(shop.id, order.id, { carrier, number: clean });
      toast({
        title: `Tracking added to ${order.id}`,
        description: response.simulated
          ? "Simulated in this sample shop, and recorded on the order."
          : "PayPal has the tracking number now.",
      });
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[150px_1fr]">
        <Field label="Carrier" htmlFor="carrier">
          <Select id="carrier" value={carrier} onChange={setCarrier} options={CARRIERS} />
        </Field>
        <Field
          label="Tracking number"
          htmlFor="tracking-number"
          error={
            touched && invalid
              ? "Enter the number from the label: 8 to 40 letters and digits."
              : undefined
          }
        >
          <Input
            id="tracking-number"
            ref={input}
            data-autofocus
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={touched && invalid}
            aria-describedby="tracking-number-note"
            autoComplete="off"
            spellCheck={false}
            placeholder="9400 1000 0000 0000 0000 00"
            className="tabular-nums"
          />
        </Field>
      </div>
      {error && (
        <p role="alert" className="bg-risk-50 text-risk-700 rounded-[10px] px-3 py-2.5 text-[13px]">
          {error}
        </p>
      )}
      <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
        <Button variant="secondary" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" loading={saving}>
          Add tracking
        </Button>
      </div>
    </form>
  );
}
