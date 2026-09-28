// N-63/N-81 (拒收用人話): the one place an API failure becomes a sentence a user can act on. Every call site that
// shows an error to a user goes through humanError(), never String(error) or error.message on an ApiError --
// those surface the raw `API ${status}` (lib/api.ts) or an UPPER_SNAKE detail code, neither of which means
// anything to someone who did not write this backend.
import { ApiError } from "./api";

// One sentence per detail code this app's own endpoints can return (main.py's HTTPException detail=
// "CODE: message" or {"code"|"error": "CODE", ...}); unlisted codes fall back to STATUS_FALLBACK by status.
const CODES: Record<string, string> = {
  AUTH_REQUIRED: "登入已經過期，請重新整理頁面再登入一次。",
  AUTH_FAILED: "帳號或密碼不對，請再試一次。",
  ENTITLEMENT_DENIED: "這個帳號沒有權限做這件事。",
  PROJECT_NOT_FOUND: "找不到這個專案：可能已經刪除，或不在你的帳號裡。",
  PROJECT_ID_REQUIRED: "沒有指定專案，請重新整理頁面再試一次。",
  PROJECT_WORKSPACE_ID_REQUIRED: "帳號的工作區設定有問題，請聯絡管理員。",
  PROJECT_DATA_CLASSIFICATION_INVALID: "資料分類設定有問題，請聯絡管理員。",
  PROJECT_NAME_ALREADY_EXISTS_IN_WORKSPACE: "這個名字已經有專案在用了，換一個名字再試一次。",
  PROJECT_NAME_INVALID: "專案名稱不能留白，最多 200 字。",
  PROJECT_BUSY: "有一次分析還在跑，等它跑完再刪除這個專案。",
  INTERPRETATION_IN_FLIGHT: "分析這一刻沒能開始，請再按一次執行。",
  WORKSPACE_NOT_FOUND: "找不到這個工作區。",
  INTERPRETATION_NOT_FOUND: "找不到這次分析，可能已經刪除。",
  REVISION_INVALID: "重做需要先寫退回原因。",
  REVISION_REASON_TOO_LONG: "退回原因太長，請縮短後再送出。",
  RERUN_NOT_OPEN: "這個重跑提醒現在不能用了（可能已經跑過，或跟這次要用的工具對不上），請回專案頁重新開始。",
  RERUN_DUE_INVALID: "重跑日期不對，請重新選一個還沒到的日期。",
  APPROVAL_DECISION_INVALID: "核准的動作不對，請重新整理頁面再試一次。",
  RETURN_REASON_REQUIRED: "退回要先寫原因。",
  APPROVAL_REASON_TOO_LONG: "原因太長，請縮短後再送出。",
  JUDGMENT_STANCE_INVALID: "請先選一個判斷（同意／部分同意／不同意）。",
  JUDGMENT_TEXT_INVALID: "這段文字沒辦法存，請重新輸入。",
  TASKS_COUNT_INVALID: "任務要 1 到 20 個，請調整後再存。",
  TASK_TITLE_INVALID: "任務標題不能留白，最多 300 字。",
  TASK_DUE_INVALID: "期限的日期格式不對。",
  TASK_NOT_FOUND: "找不到這個任務，可能已經刪除。",
  METHOD_RESOLUTION_BLOCKED: "找不到這個工具，可能已經下架。",
  METHOD_GATES_FAILED: "填的內容沒有通過檢查，請確認格子內容後再試一次。",
  DISPATCH_UNAVAILABLE: "這個工具現在沒辦法使用，請稍後再試。",
  AI_PROVIDER_UNCONFIGURED: "AI 功能還沒設定好，請聯絡管理員。",
  AI_DAILY_TOKEN_BUDGET_EXCEEDED: "今天的 AI 額度用完了，明天 UTC 午夜重置後再試。",
  SOURCE_NOT_FOUND: "找不到這個來源，可能已經刪除。",
  SOURCE_MEDIA_TYPE_UNSUPPORTED: "這個檔案格式現在不支援，只能貼純文字。",
  SOURCE_PROJECT_CLASSIFICATION_MISMATCH: "這個來源的資料分類跟專案不一致，沒辦法加入。",
  SOURCE_CONTENT_TOO_LARGE: "這段內容太長了，請縮短後再試一次。",
  AI_DRAFT_LABELS_REQUIRED: "一次能請 AI 起草的欄位數量超過上限，請減少後再試。",
};

const STATUS_FALLBACK: Record<number, string> = {
  400: "這個要求送錯了，請確認填的內容後再試一次。",
  401: "登入已經過期，請重新整理頁面再登入一次。",
  403: "這個帳號沒有權限做這件事。",
  404: "找不到這筆資料，可能已經被刪除或搬走了。",
  409: "這個動作現在不能做：有其他事還在進行中，稍後再試。",
  422: "送出的內容不符合這個工具的要求，請檢查後再試。",
  429: "今天用得太多了，明天再試。",
  500: "系統出了問題，不是你填錯；請稍後再試一次。",
  501: "這個功能還沒接上，暫時用不了。",
  503: "系統暫時沒辦法回應，請稍後再試一次。",
};

/** The detail's code, however main.py shaped it: a "CODE: message" string, or {code|error: "CODE", ...}. */
function extractCode(detail: unknown): string | null {
  if (typeof detail === "string") { const match = /^[A-Z][A-Z0-9_]*/.exec(detail); return match ? match[0] : null; }
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const raw = record.code ?? record.error;
    if (typeof raw === "string") return raw;
  }
  return null;
}

// Why a FAILED analysis did not finish (GET /interpretations/{id} `error`, the same "CODE: detail" shape).
const FAILURES: Record<string, string> = {
  INTERPRETATION_RUNNER_LOST: "分析途中伺服器重新啟動，這次沒有跑完；再執行一次即可",
  INTERPRETATION_REJECTED_AFTER_REPAIR: "AI 兩次的回答都沒有通過檢查（引註、數字或下一步對不上你的資料），這次不採用；再執行一次通常就會通過",
  AI_DAILY_TOKEN_BUDGET_EXCEEDED: CODES.AI_DAILY_TOKEN_BUDGET_EXCEEDED.replace(/。$/, ""),
  AI_PROVIDER_UNCONFIGURED: CODES.AI_PROVIDER_UNCONFIGURED.replace(/。$/, ""),
};

/** A FAILED analysis's reason as a sentence; an unknown one is not shown as a code either. */
export function failureReason(error: string | null | undefined): string {
  const code = error ? extractCode(error) : null;
  return (code && FAILURES[code]) || "AI 服務這次沒有給出可用的回答；再執行一次即可";
}

/** The one sentence a user sees for any failed apiFetch(): never `API ${status}`, never an UPPER_SNAKE code. */
export function humanError(error: unknown): string {
  if (error instanceof ApiError) {
    const code = extractCode(error.detail);
    if (code && CODES[code]) return CODES[code];
    return STATUS_FALLBACK[error.status] ?? `系統發生錯誤（狀態碼 ${error.status}），請稍後再試。`;
  }
  if (error instanceof Error && error.message) return error.message;
  return "發生錯誤，請稍後再試。";
}
