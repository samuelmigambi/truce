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

/** Formatters by currency, made once each. */
const formats = new Map<string, { whole: Intl.NumberFormat; exact: Intl.NumberFormat }>();

function formatsFor(currency: string) {
  let found = formats.get(currency);
  if (!found) {
    // en-US keeps "$" for US dollars and writes "CA$", "A$", "£" and "€" for the others.
    found = {
      whole: new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }),
      exact: new Intl.NumberFormat("en-US", { style: "currency", currency }),
    };
    formats.set(currency, found);
  }
  return found;
}

/** "$86", or "$42.50" when there are cents; "£86" in pounds. */
export function formatMoney(cents: Cents, currency = "USD"): string {
  const { whole, exact } = formatsFor(currency);
  return cents % 100 === 0 ? whole.format(cents / 100) : exact.format(cents / 100);
}

/** Whole units only, for figures that tick up: "$86". */
export function formatMoneyWhole(cents: Cents, currency = "USD"): string {
  return formatsFor(currency).whole.format(Math.round(cents / 100));
}

/** "$86", or "$42.50" when there are cents. */
export function formatUsd(cents: Cents): string {
  return formatMoney(cents, "USD");
}
