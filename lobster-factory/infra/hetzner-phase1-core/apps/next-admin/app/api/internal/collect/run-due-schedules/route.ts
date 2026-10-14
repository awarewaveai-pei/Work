// TRANSITIONAL — the deployed Trigger task `collect-scheduled-crawl` still posts here. Delete this file once
// `schedules-heartbeat` (posting to /api/internal/schedules/run-due) is deployed (SCHEDULES_PAGE_PLAN.md §5 step 7).
export { POST } from "@/app/api/internal/schedules/run-due/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
