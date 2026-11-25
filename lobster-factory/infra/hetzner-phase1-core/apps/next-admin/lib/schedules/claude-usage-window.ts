// 「自動啟動 Claude」: at the hours set on /ops/schedules, fire one claude.ai routine (it answers "ok" on Haiku) so the
// Claude subscription's usage window starts then. The app owns the clock (client_schedules 'weekdays', 0183); the
// routine has an API trigger only, no schedule of its own -- two clocks would fire twice.
// Credential: the routine's own fire token (sk-ant-oat01-..., created on claude.ai/code/routines, Edit -> Trigger -> API
// -> Generate token). It can start that one routine and nothing else; never the operator's claude.ai login.
// API: POST https://api.anthropic.com/v1/claude_code/routines/{trig_id}/fire (docs: platform.claude.com/docs/en/api/
// claude-code/routines-fire). 30 fires an hour per routine; a 429 is raised like any other failure.
import type { JobMeta } from "./types";

export const CLAUDE_USAGE_WINDOW_JOB: Pick<JobMeta, "key" | "label" | "description" | "cost" | "frequencies"> = {
  key: "claude_usage_window",
  label: "自動啟動 Claude",
  description: "到了設定的時間，叫醒雲端的 Claude 回一句話，Claude 訂閱的 5 小時用量時段就從那時開始算。每天可以設不同時間，也可以那天不啟動。",
  cost: "免費（用 Claude 訂閱額度，只回一句話）。",
  frequencies: [{ value: "weekdays", label: "每週各天", usesHour: false, usesDay: false, usesWeekdayHours: true }],
};

/** routines/{id}/fire, id = trig_ + 20-30 base62 characters (the docs' example has 24). */
const FIRE_URL = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]{10,40}\/fire$/;

type Env = Record<string, string | undefined>;

/** Why it cannot fire (shown on the row when switched on); null = configured. */
export function claudeUsageWindowUnavailable(env: Env): string | null {
  const url = env.CLAUDE_USAGE_WINDOW_FIRE_URL?.trim();
  if (!url || !env.CLAUDE_USAGE_WINDOW_FIRE_TOKEN?.trim()) return "主機還沒設定觸發金鑰";
  if (!FIRE_URL.test(url)) return "觸發網址格式不對";
  return null;
}

/** One fire. Throws on anything but 200 (the sweep records it and raises the incident); the token never enters a message. */
export async function fireClaudeUsageWindow(env: Env, fetchImpl: typeof fetch = fetch): Promise<string> {
  const why = claudeUsageWindowUnavailable(env);
  if (why) throw new Error(`claude_usage_window:not_configured:${why}`);
  const res = await fetchImpl(env.CLAUDE_USAGE_WINDOW_FIRE_URL!.trim(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.CLAUDE_USAGE_WINDOW_FIRE_TOKEN!.trim()}`,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "experimental-cc-routine-2026-04-01",
      "Content-Type": "application/json",
    },
    body: "{}",
    signal: AbortSignal.timeout(30_000),
  });
  const body = (await res.json().catch(() => null)) as { type?: string; claude_code_session_id?: string; error?: { type?: string; message?: string } } | null;
  if (!res.ok || body?.type !== "routine_fire") {
    const err = body?.error ? `${body.error.type ?? "error"}:${body.error.message ?? ""}` : `type=${body?.type ?? "none"}`;
    throw new Error(`claude_usage_window:http_${res.status}:${err}`.slice(0, 200));
  }
  return `fired ${body.claude_code_session_id ?? ""}`.trim();
}
