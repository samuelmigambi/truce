/** Money in whole cents, so sums never drift. PayPal sends amounts as strings like "86.00". */
export type Cents = number;

export function toCents(value: string | number): Cents {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) throw new Error(`Not an amount: ${value}`);
  return Math.round(n * 100);
}

/** "86.00", the form PayPal's API takes. */
export function toPayPalValue(cents: Cents): string {
  return (cents / 100).toFixed(2);
}

const whole = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});
const exact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

/** "$86", or "$42.50" when there are cents. */
export function formatUsd(cents: Cents): string {
  return cents % 100 === 0 ? whole.format(cents / 100) : exact.format(cents / 100);
}
