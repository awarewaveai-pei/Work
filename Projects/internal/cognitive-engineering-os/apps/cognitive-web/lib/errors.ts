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
  TASK_STATUS_INVALID: "任務狀態不對，請重新整理頁面再試一次。",
  TASK_KIND_INVALID: "新增任務的類型不對，請重新整理頁面再試一次。",
  TASK_PARENT_NOT_FOUND: "找不到上層任務，可能已經刪除。",
  TASK_NOTE_EMPTY: "這筆紀錄至少要寫一項內容。",
  TASK_NOTE_NUMBERS_TOO_MANY: "一次最多記 5 個數字，請分次寫。",
  TASK_NOTE_NUMBER_NAME_INVALID: "數字的名稱不能留白，最多 100 字。",
  TASK_NOTE_NEXT_CHECK_INVALID: "下次追蹤的日期格式不對。",
  RERUN_ALREADY_SCHEDULED: "已經有一個重跑排在等了，用那一個就好。",
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
  // the platform's blocks (ai_lego/apps/api/blocks/)
  DOC_STALE: "這張卡在別的地方被改過了，重新整理頁面看最新的版本，再改一次。",
  DOC_NOT_FOUND: "找不到這張卡，可能已經刪除。",
  DOC_NOT_DELETABLE: "這一種紀錄每一版都留著，不能刪；要整個刪，請刪掉這個案子。",
  DOC_FIELD_REQUIRED: "還有必填的格子沒填。",
  DOC_FIELD_INVALID: "有一格的內容不符合格式，請檢查後再試一次。",
  DOC_FIELD_UNKNOWN: "這個頁面送了不該有的內容，請重新整理頁面再試一次。",
  DOC_KIND_UNKNOWN: "這一塊還沒開放。",
  RECORD_HUMAN_ONLY_FIELD: "這一格只收你自己寫的。",
  AI_PERMISSION_DENIED: "協作合約沒有准 AI 做這件事；要的話，先到協作合約打開它。",
  AI_ACTION_UNKNOWN: "這個 AI 功能還沒開放。",
  AI_ANSWER_NOT_JSON: "AI 這次沒有給出可用的回答，再按一次即可。",
  AI_ANSWER_INVALID: "AI 這次的回答不合格式，再按一次即可。",
  AI_ANSWER_UNCITED: "AI 這次引用了案子裡沒有的來源，或引文跟原文對不上，所以沒有存。再按一次即可。",
  AI_TOO_MANY_SOURCES: "來源卡太多，AI 一次看不完。先勾選要給它看的幾張。",
  AI_CONTEXT_INVALID: "這個頁面送給 AI 的內容有問題，請重新整理頁面再試一次。",
  AI_NOTHING_TO_PICK: "這個案子能用的拆法都用過了。",
  AI_NOTHING_TO_PLACE: "每張卡都已經放進某一層了。",
  AI_NOTHING_TO_POINT: "每個面向你都看過了。",
  AI_NOTHING_TO_READ: "還沒有可以給 AI 讀的內容：先在開案資料選目的，或在地圖寫一行。",
  AI_SEALED: "你按了「現在我要自己下結論」，這一版 AI 不再給新答案。存下一版之後，才能再請它檢查。",
  ANSWER_ALREADY_GIVEN: "這個提議你已經回答過了；要改，改那一次的回答。",
  ANSWER_BLOCK_NOT_OPEN: "這一塊還沒開放，現在不能加；提議會先記著。",
  ANSWER_PROPOSAL_NOT_FOUND: "找不到這個提議，請重新整理頁面。",
  DOC_CONTENT_INVALID: "這張卡的內容格式不對，請重新整理頁面再試一次。",
  DOC_SINGLETON_EXISTS: "這個案子已經有一份了；請改那一份。",
  MAP_METHOD_UNKNOWN: "這個拆法不在工具清單裡，請從清單裡選。",
  MAP_FACT_CARD_UNKNOWN: "這一條連到的來源不在這個案子裡了，請重新整理頁面再連一次。",
  MAP_FACT_SOURCES_WRONG: "這一條的出處數跟系統算的不一樣（可能有出處剛被標成不用），請重新整理頁面再存。",
  LEARN_WRONG_SOURCE_INVALID: "「當時哪個出處錯了」的格式不對，請重新整理頁面再選一次。",
  THINK_CARD_SOURCE_GOES_WITH_WORDS: "改寫過的卡，就不再算靠那個查證過的主張了，會標成「它自己說的」。請重新整理頁面再改一次。",
  RECORD_AUTHOR_NOT_ALLOWED: "這一種紀錄不能從這裡寫。",
  RECORD_SCORE_REFUSED: "平台不記分數或排名。",
  DECIDE_NO_JUDGMENT: "先存判斷卡，才能請 AI 檢查。",
  ACT_NO_NEXT_STEP: "判斷卡上還沒有「下一步」，沒有東西可以拆。",
  ACT_NO_TASK: "先寫一張任務卡，才能請 AI 看哪裡不能反悔。",
  ACT_NO_NUMBERS: "還沒有任何一筆紀錄記了數字。",
  ACT_HOLD_REQUIRED: "這一步標了不能反悔，又碰到高風險的事：先選「先等一下」、「請人覆核」，或「我想過了，照做」，再存。",
  REMINDER_DATE_INVALID: "提醒的日期不對，請重新選一個日期。",
  LEARN_NOTHING_TO_COMPARE: "這個案子還沒有判斷或任務，沒有東西可以對照。",
  LEARN_NO_DAILY_CARD: "先寫今天的校準卡，才能請 AI 整理。",
  THINK_ROUND_REQUIRED: "先開一輪，寫下這次的問題。",
  THINK_OWN_VERSION_REQUIRED: "先寫你自己的版本（至少一樣），AI 才回。",
  THINK_CARD_NOT_FOUND: "找不到這張思考卡，可能已經刪除。",
  THINK_PICK_LIMIT: "這一輪已經選了三張；先放回一張，再選這張。",
  THINK_REACTION_ALREADY_GIVEN: "這張卡你已經有反應了；請改那一個。",
  THINK_REACTION_CARD_FIXED: "反應跟著它寫的那張卡，不能換到別張。",
  THINK_ROUND_NOT_FOUND: "找不到這一輪，可能已經刪除。",
  THINK_CARD_FIELD_FIXED: "這張卡的輪次、角色、方法和來源在做卡時就定了，你不能改。你可以改它的字。",
  THINK_OWN_VERSION_FIXED: "AI 已經回過這一輪，你最初的版本不再改。看過 AI 之後的新想法，寫成卡。",
  THINK_REPLY_NOT_FOUND: "找不到 AI 的這份整理，可能已經刪除。",
  THINK_REPLY_STALE: "這份整理在你回應之前又變了。請重新整理頁面，看過新的再回應。",
  ACCOUNT_ERASE_NOT_CONFIRMED: "要刪除帳號，請照畫面打一次確認的字。",
  ACCOUNT_HAS_LIVE_CASES: "刪除帳號的同時你又開了一個案子，這次什麼都沒刪。請再按一次刪除帳號。",
  ACCOUNT_ALREADY_ERASED: "這個帳號已經刪除了。",
  IDENTITY_ERASED: "這個帳號已經刪除了，這次沒有存任何東西。",
  CASE_ERASED: "這個案子已經刪除了，這次沒有存任何東西。",
  SOURCE_PROJECT_NOT_FOUND: "找不到這個案子，可能剛刪除了；這次沒有存任何東西。",
  // GATHER
  GATHER_ORIGIN_NOT_FOUND: "這一組現在不在了（網頁重新分過組）。請重新整理頁面，標新的組。",
  GATHER_ORIGIN_PENDING: "這一頁還在分組，分好之後再標。",
  GATHER_MARK_CARDS_MISMATCH: "同一組裡的網頁要一起標。這一組的網頁變了，請重新整理頁面再標。",
  GATHER_MARK_ALREADY_GIVEN: "這個出處你已經標過了。要改，改那一個標記。",
  GATHER_MARK_ORIGIN_FIXED: "標記跟著它標的那一組，不能換到別組。要標新的組，另外標一個。",
  GATHER_CARD_NOT_FOUND: "找不到這張來源卡，請重新整理頁面。",
  GATHER_OVERRIDE_ALREADY_GIVEN: "這一格你已經改過了。要再改，改那一筆。",
  GATHER_OVERRIDE_FIXED: "你的改法跟著它改的那張卡和那一格，不能換。",
  GATHER_SPLIT_INVALID: "要拆開的網頁要在同一組裡，而且不能是整組。",
  GATHER_SPLIT_FIXED: "拆開的網頁不能再換。要改，先刪掉這次拆開，再拆一次。",
  GATHER_SPLIT_SAME_PAGE: "這幾頁跟留在組裡的頁是同一份內容（同一個核對碼），不能拆開。",
  GATHER_NOT_ASIDE: "這一頁沒有放一旁，不用拿回來。",
  GATHER_TAKEBACK_ALREADY_GIVEN: "這一頁已經拿回來了。",
  GATHER_ORGANIZE_PASTED_ONLY: "你沒准 AI 找外部資料，AI 只整理你貼的。請只勾你貼的來源。",
  COLLECTION_SERVICE_UNCONFIGURED: "這裡還沒接上找資料的服務，系統現在不能去找。你可以自己貼網址或檔案。",
  COLLECTION_SERVICE_UNAVAILABLE: "找資料的服務這次沒有回應，沒有開始找。請稍後再按一次。",
  COLLECTOR_IDENTITY_MISSING: "找資料的服務還沒設定好，請聯絡管理員。",
  COLLECTION_SEEDS_INVALID: "要找的內容格式不對，請重新整理頁面再試一次。",
  // VERIFY
  VERIFY_FIRST_REACTION_REQUIRED: "先寫下你的第一反應和信心，才看得到系統查到的東西。",
  VERIFY_FIRST_REACTION_ALREADY_GIVEN: "這則訊息已經有你的第一反應了。",
  VERIFY_FIRST_REACTION_FIXED: "第一反應寫了就不改。現在的想法，寫在你對主張的判定裡。",
  VERIFY_MESSAGE_NOT_FOUND: "找不到這則訊息，請重新整理頁面。",
  VERIFY_MESSAGE_FIXED: "訊息存的是你貼上時的樣子，不能改。要查別的版本，請貼成新的一則。",
  VERIFY_MESSAGE_STAMP_INVALID: "訊息的存證對不上原文，請重新貼一次。",
  VERIFY_MESSAGE_LINK_REQUIRED: "貼連結時，請貼上網址（http:// 或 https:// 開頭）。",
  VERIFY_CLAIM_NOT_FOUND: "找不到這個主張，可能已經刪除。",
  VERIFY_CLAIM_FROM_INVALID: "這個主張的來處對不上：請從這則訊息、地圖上的主張，或 AI 提的拆法裡選。",
  VERIFY_CLAIM_FIXED: "主張從哪裡來的，做好就不改。要換，請另外加一個主張。",
  VERIFY_CLAIM_REASON_REQUIRED: "改了主張，請寫一句為什麼改。",
  VERIFY_CLAIM_VERSION_STALE: "這個主張剛剛改過了。請重新整理頁面，看過新的再寫。",
  VERIFY_CLAIM_NOT_CHECKABLE: "只有「可以查的事實」才去找來源。",
  VERIFY_CARD_NOT_FOUND: "找不到這張來源卡，請重新整理頁面。",
  VERIFY_SNAPSHOT_STALE: "這個網頁有新的版本了。請讀新的版本再寫。",
  VERIFY_STANCE_ALREADY_GIVEN: "這張來源卡你已經對這個主張寫過了；請改那一筆。",
  VERIFY_STANCE_FIXED: "這筆讀法跟著它寫的主張和來源卡，不能換到別張。",
  VERIFY_STANCE_REASON_REQUIRED: "你的讀法跟 AI 不一樣，請寫一句為什麼。",
  VERIFY_READING_NOT_FOUND: "找不到 AI 對這個主張、這張卡的讀法，請重新整理頁面。",
  VERIFY_QUOTE_NOT_IN_SOURCE: "引文要照抄來源裡的字，至少 6 個字。這段在來源裡找不到。",
  VERIFY_QUOTE_UNCHECKED: "自己打的引文，要從查證頁存，系統才能對照原文。",
  VERIFY_VERDICT_ALREADY_GIVEN: "這個主張已經有你的判定了；請改那一筆。",
  VERIFY_VERDICT_FIXED: "判定跟著它的主張，不能換到別的主張。",
  VERIFY_FACTCHECK_TARGET_INVALID: "請選一則訊息或一個主張再查。",
  VERIFY_SEARCH_ANGLES_INVALID: "請至少選一種要找的方向。",
  VERIFY_SEARCH_ALREADY_RUNNING: "這個主張的這一版已經在找了。等它跑完，或過了期限，再查一次。",
  VERIFY_NO_CLAIMS: "還沒有確認過的主張。先確認或加一個主張。",
  // COMPUTE
  COMPUTE_INPUT_REFUSED: "有一個數字算不出來或格式不對，請檢查後再算一次。",
  COMPUTE_ALGORITHM_UNKNOWN: "這個算法不在清單裡，請從清單裡選。",
  COMPUTE_RUN_NOT_FOUND: "找不到這次計算，請重新整理頁面。",
  COMPUTE_ADOPT_REASON_REQUIRED: "採用或不採用，都寫一句為什麼。",
  COMPUTE_ADOPT_ALREADY_GIVEN: "這次計算你已經選過採不採用；要改，改那一筆。",
  COMPUTE_ADOPT_RUN_FIXED: "採不採用跟著它寫的那次計算，不能換到別次。",
  COMPUTE_QUESTION_REQUIRED: "先寫下你要算什麼，AI 才建議算法。",
  AI_ANSWER_HAS_NUMBER: "AI 這次的回答自己寫了數字，系統不收：數字只由系統算。再按一次即可。",
  AI_ANSWER_CALLS_IT_PREDICTION: "AI 這次把計算或模擬說成了預測或保證，系統不收。再按一次即可。",
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
