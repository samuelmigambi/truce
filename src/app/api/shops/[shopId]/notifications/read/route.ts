import { z } from "zod";
import type { ReadNotificationsRequest } from "@/lib/api-types";
import { readBody } from "@/server/actions/errors";
import { noContent, shopRoute } from "@/server/http";
import { markRead } from "@/server/notifications";
import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

const readSchema: z.ZodType<ReadNotificationsRequest> = z.object({
  ids: z.array(z.string().min(1).max(200)).max(100).optional(),
});

/** Marks notifications read for this member: the ones named, or all of them. */
export const POST = shopRoute("read", async ({ request, user, shop }) => {
  const { ids } = await readBody(request, readSchema);
  await markRead(getStore(), shop.id, user.uid, ids);
  return noContent();
});
