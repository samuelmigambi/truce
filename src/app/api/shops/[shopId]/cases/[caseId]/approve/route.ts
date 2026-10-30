import { z } from "zod";
import type { ApproveRequest, ApproveResponse } from "@/lib/api-types";
import { approveCase } from "@/server/actions/approve";
import { readBody } from "@/server/actions/errors";
import { json, param, shopRoute } from "@/server/http";
import { enforceLimit } from "@/server/limits";
import { paypalFor } from "@/server/paypal/connection";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const approveSchema: z.ZodType<ApproveRequest> = z.object({
  move: z.enum(["fight", "settle", "refund"]),
  draft: z.object({
    kind: z.enum(["message", "offer", "evidence", "refund"]),
    text: z
      .string()
      .trim()
      .min(1, "The draft is empty. Write what to send first.")
      .max(2000, "PayPal takes 2,000 characters at most. Shorten the draft."),
    evidenceIds: z.array(z.string().max(40)).max(60).default([]),
    offerAmount: z.number().int().positive().optional(),
    evidenceType: z
      .string()
      .regex(/^[A-Z_]{3,40}$/, "That isn't one of PayPal's evidence types.")
      .optional(),
  }),
});

/** Sends the step the seller approved: to the shop's PayPal app, or simulated in a sample shop. */
export const POST = shopRoute("act", async ({ request, user, shop, params }) => {
  const caseId = param(params, "caseId");
  const body = await readBody(request, approveSchema);
  await enforceLimit(
    `approve:${shop.id}`,
    60,
    60 * 60,
    "That's a lot of approvals in an hour. Try again in a little while.",
  );
  await enforceLimit(
    `approve-user:${user.uid}`,
    120,
    60 * 60,
    "That's a lot of approvals in an hour. Try again in a little while.",
  );
  const store = getStore();
  const paypal = await paypalFor(store, shop);
  const result: ApproveResponse = await approveCase({
    store,
    shop,
    caseId,
    request: body,
    paypal: paypal?.client ?? null,
    extras: paypal?.extras ?? null,
  });
  return json(result);
});
