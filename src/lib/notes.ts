import type { Order } from "./domain";

/**
 * The note to a buyer who asked for their order to go somewhere other than the address on their
 * PayPal payment. Seller Protection only covers that address, so the buyer is asked to update it
 * in PayPal. Plain words, no model needed: the Orders screen shows it, and Ask Truce rewords it.
 */
export function addressNote(
  order: Pick<Order, "id" | "buyer" | "shipTo">,
  shopName: string,
): string {
  const first = order.buyer.name.split(/\s+/)[0] ?? order.buyer.name;
  const asked = order.shipTo
    ? `${order.shipTo.line1}, ${order.shipTo.city}`
    : "a different address";
  return [
    `Hi ${first}, thanks for your order ${order.id}.`,
    `Your note asks us to ship to ${asked}, but we can only ship to the address on your PayPal payment, which keeps the order protected for both of us.`,
    "If you'd like it to go there, please update the shipping address in PayPal and reply to this email. We'll ship as soon as it matches.",
    `Thanks, ${shopName}`,
  ].join("\n\n");
}
