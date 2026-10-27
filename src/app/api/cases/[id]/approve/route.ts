import { z } from "zod";
import type { ApproveResponse } from "@/lib/api-types";
import { approveCase } from "@/server/actions/approve";
import { ActionError, readBody, respond } from "@/server/actions/errors";
import { rateLimit } from "@/server/limits";
import { paypal, paypalExtras } from "@/server/paypal";
import { currentWorkspace } from "@/server/session";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const approveSchema = z.object({
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

/** Sends the step the seller approved: to PayPal in the live sandbox, simulated in a demo copy. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(async () => {
    const { id } = await params;
    const workspace = await currentWorkspace();
    const body = await readBody(request, approveSchema);
    if (!(await rateLimit(`approve:${workspace.id}`, 40, 60 * 60))) {
      throw new ActionError(
        429,
        "That's a lot of approvals in an hour. Try again in a little while.",
      );
    }
    const result: ApproveResponse = await approveCase({
      store: getStore(),
      workspace,
      caseId: id,
      request: body,
      paypal: paypal(),
      extras: paypalExtras(),
    });
    return Response.json(result);
  });
}
