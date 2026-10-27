import { getStore } from "@/server/store";

export const dynamic = "force-dynamic";

/** For Cloud Run and uptime checks: answers without touching the database. */
export async function GET() {
  return Response.json({ ok: true, store: getStore().kind, time: new Date().toISOString() });
}
