// The one HTTP contract for a production change the system mode blocks: 423
// {ok:false, error:<readable>, code:"system_mode_blocks_change", mode}. `error` is readable because
// every UI already renders json.error; machines read `code` / `mode`. No next/server import, so client
// components use the same message.

export const BLOCKED_CHANGE_CODE = "system_mode_blocks_change";

export function blockedChangeMessage(mode: string | undefined): string {
  return `系統模式為 ${mode ?? "未知"}，已擋下這次變更；到 /ops/system-modes 切回 normal 後再試`;
}

export function blockedChangeBody(mode: string) {
  return { ok: false as const, error: blockedChangeMessage(mode), code: BLOCKED_CHANGE_CODE, mode };
}

export function blockedChangeResponse(mode: string): Response {
  return Response.json(blockedChangeBody(mode), { status: 423 });
}
