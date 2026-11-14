import { authorizeSyncRequest } from "../../../../../server/jobs/auth";
import { runScheduledCheck } from "../../../../../server/jobs/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const auth = authorizeSyncRequest(request.headers.get("authorization"), process.env.SYNC_SECRET);
  if (!auth.ok) return new Response(null, { status: auth.status });
  const { runId, status, summary, ok, error } = await runScheduledCheck();
  return Response.json({ runId, status, summary, ...(ok ? {} : { error }) }, { status: ok ? 200 : 500 });
}
