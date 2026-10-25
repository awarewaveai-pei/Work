/**
 * reconcile.ts — 影片孤兒對帳（self-healing）。
 *
 * 為何存在：影片完成的「記錄媒體庫」目前由 /status 在使用者輪詢時觸發；若使用者在生成中
 * 關閉/離開頁面 → 沒人輪詢 → EU 算完寫了 R2，但 media_assets 沒記 → 影片成孤兒（在 R2 卻
 * 不在畫廊）。本對帳定期掃 R2 video bucket，把缺 media_assets 的補上 → 自癒**任何**孤兒成因
 * （關頁 / 容器重啟 / 漏記）。idempotent（依 object_key 去重）；由 SG cron 每 ~15 分觸發。
 *
 * 零新攻擊面：不開新對外端點機制（/api/internal/video/reconcile，route 自驗 x-ops-sync-key）；
 * 不加 EU↔SG 反向耦合（不在 EU 放任何 SG 憑證）；重用 recordVideoAsset（記錄邏輯單一真相）。
 */
import { getSupabaseWriteClient } from "../../supabase-server";
import { recordVideoAsset, videoObjectKey, pickPrimaryOutput, parseOrgPrefixFromDir } from "../blocks/video-pipeline";

function r2cfg(): { apiToken: string; accountId: string; bucket: string; publicBase: string } | null {
  const apiToken = process.env.R2_API_TOKEN;
  const accountId = process.env.R2_ACCOUNT_ID;
  const bucket = process.env.R2_VIDEO_BUCKET ?? "lobster-videos";
  const publicBase = (process.env.R2_VIDEO_PUBLIC_BASE ?? "").replace(/\/$/, "");
  if (!apiToken || !accountId || !publicBase) return null;
  return { apiToken, accountId, bucket, publicBase };
}

/**
 * 分類必須「窮盡且互斥」：checked === recorded + alreadyRecorded + orphanUnattributable + noPrimary。
 * 這條不變量由 reconcileVideos 在回傳前自我檢查（見底部），並由 __tests__/reconcile-classify.test.ts 釘住。
 *
 * 2026-08-26 之前的形狀是壞的：`skippedLegacy++` 發生在存在性檢查**之前**，所以一支「舊格式但
 * 早就在畫廊裡」的影片會被永久計成 skipped。實測 EU prod：2 個 legacy 目錄裡 1 個早已有
 * media_assets 列、1 個才是真孤兒 —— 舊計數器把兩者混成 `skippedLegacy=2`，既無法當告警
 * （永遠非零）也無法當健康指標（`recorded/checked` 永遠 0/2）。
 */
export interface ReconcileResult {
  ok: boolean;
  /** R2 內偵測到的影片組數（全部分類之和）。 */
  checked: number;
  /** 本次補記的孤兒數。 */
  recorded: number;
  /** 已在 media_assets（不論擁有者是否可判定）→ 無需任何動作。 */
  alreadyRecorded: number;
  /**
   * **唯一需要人介入的數字**：檔案在 R2、不在 media_assets、且擁有者無法判定 →
   * 使用者永遠看不到這支影片。這是告警該綁的值（非零即需處理）。
   */
  orphanUnattributable: number;
  /** orphanUnattributable 的成因拆解（診斷用，不用來告警）。 */
  unattributableByMissingPrefix: number;
  unattributableByUnresolvedPrefix: number;
  /** 該組取不到任何主要輸出 URL（理論上不會發生；獨立計數以維持分類窮盡）。 */
  noPrimary: number;
  /** 存在性查詢本身失敗 → 「不知道」必須有自己的桶，不得併進任何一個「知道」的分類。 */
  probeFailed: number;
  /** 補記時拋出（下輪會再試）。同上：失敗不可偽裝成其他分類。 */
  recordFailed: number;
  error?: string;
}

function emptyResult(): ReconcileResult {
  return {
    ok: true, checked: 0, recorded: 0, alreadyRecorded: 0, orphanUnattributable: 0,
    unattributableByMissingPrefix: 0, unattributableByUnresolvedPrefix: 0, noPrimary: 0,
    probeFailed: 0, recordFailed: 0,
  };
}

/** 掃 R2 video bucket → 補缺的 media_assets。idempotent、self-healing。 */
export async function reconcileVideos(): Promise<ReconcileResult> {
  const cfg = r2cfg();
  if (!cfg) return { ...emptyResult(), ok: false, error: "R2 video env 未設定" };
  const supabase = getSupabaseWriteClient();
  if (!supabase) return { ...emptyResult(), ok: false, error: "supabase 未設定" };

  // 租戶來源 = R2 key 自帶的 org 前綴，**不再是 POD_DESIGNS_DEFAULT_ORG_ID**。
  // 舊行為把每個孤兒都記到同一個預設 org：實測 EU prod 有 5 個 org、2 個有 media，
  // 所以那等於把 B 租戶的影片放進 A 租戶的媒體庫（A 看得到、B 永遠沒有自己的列）。
  // R2 key 本來就沒有租戶資訊 —— 這是 buildVideoOutName 要把 org 前綴寫進目錄名的原因。
  // 1) 列 R2 物件（分頁）
  const keys: string[] = [];
  let cursor: string | undefined;
  do {
    const u = new URL(`https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/r2/buckets/${cfg.bucket}/objects`);
    u.searchParams.set("per_page", "1000");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${cfg.apiToken}` }, signal: AbortSignal.timeout(30_000) });
    if (!r.ok) return { ...emptyResult(), ok: false, error: `r2_list_${r.status}` };
    const j = (await r.json()) as { result?: { key: string }[]; result_info?: { cursor?: string; is_truncated?: boolean } };
    for (const o of j.result ?? []) keys.push(o.key);
    cursor = j.result_info?.is_truncated ? j.result_info?.cursor : undefined;
  } while (cursor);

  // 2) 依 R2 實際存在的檔案分組（dir = sanitized 標題，fmt = 檔名）。
  //
  // 格式段刻意用 `([^/]+)` 收**任何**格式名，不用已知清單過濾。理由（2026-08-24
  // Codex round 3 抓到）：`/api/video/status` 拿到的是 EU 回傳的原始 `poll.outputs`，
  // 未知格式（例如日後新增的 `1x1`）也會被 pickPrimaryOutput 的排序退路挑中並記錄；
  // 若這裡先用已知清單過濾，同一支影片對 sweep 就是隱形的 —— 兩個呼叫端「共用挑選
  // 函式」但「候選集不同」，等於沒有真正統一。收全部格式後兩邊看到的輸入形狀才一致。
  const FORMAT_SUFFIX_RE = /^video\/(.+)\/([^/]+)\.mp4$/;
  const groups = new Map<string, Record<string, string>>();
  for (const k of keys) {
    const m = FORMAT_SUFFIX_RE.exec(k);
    if (!m) continue;
    const dir = m[1];
    const fmt = m[2];
    let g = groups.get(dir);
    if (!g) { g = {}; groups.set(dir, g); }
    g[fmt] = `${cfg.publicBase}/${k}`;
  }

  // 前綴 → org id，只查 R2 裡真的出現的前綴（每個 WordPress 買家都是一個 org，不整表讀）。
  // 前綴＝uuid 第一段，所以「該前綴的 org」＝一段 uuid 範圍；limit 2 看撞碼：撞碼記 null，之後一律拒絕
  // （寧可不補也不記到錯的租戶）。
  const byPrefix = new Map<string, string | null>();
  const prefixes = [...new Set([...groups.keys()].map(parseOrgPrefixFromDir).filter((x): x is string => !!x))];
  for (let i = 0; i < prefixes.length; i += 10) {
    const batch = await Promise.all(prefixes.slice(i, i + 10).map(async (pfx) => {
      const { data, error } = await supabase.from("organizations").select("id")
        .gte("id", `${pfx}-0000-0000-0000-000000000000`).lte("id", `${pfx}-ffff-ffff-ffff-ffffffffffff`).limit(2);
      return { pfx, ids: ((data ?? []) as { id: string }[]).map((r) => r.id), error };
    }));
    for (const { pfx, ids, error } of batch) {
      if (error) return { ...emptyResult(), ok: false, error: "organizations 查詢失敗" };
      if (ids.length) byPrefix.set(pfx, ids.length === 1 ? ids[0] : null);
    }
  }

  // 3) 逐組分類；缺 media_assets 且擁有者可判定者補上。
  //
  // **順序是這次修正的本體**：先算 object_key、先查存在性，最後才分類。舊版在存在性檢查之前
  // 就 `skippedLegacy++; continue;`，於是「舊格式但早就在畫廊裡」的影片被永久計成 skipped
  // （實測 EU prod 2 個 legacy 目錄，1 個早有列、1 個才是真孤兒，卻一起變成 skippedLegacy=2）。
  //
  // 探測的 scope 分兩種，兩種都有理由：
  //   • 擁有者可判定 → 必須帶 org（與 recordVideoAsset 的唯一性域一致）。只用 object_key 查會
  //     讓「別的租戶剛好有同名 key」的列擋掉本租戶的補記（2026-08-25 critic）。
  //   • 擁有者不可判定 → 這一分支**永遠不寫入**（fail-closed），所以改用不帶 org 的探測純粹做
  //     分類；它不可能抑制任何補記，因為這裡本來就不補。
  //     刻意接受的近似：舊格式 key 由標題衍生，理論上兩個租戶可能撞同名。撞到時本組會被算成
  //     alreadyRecorded 而非孤兒 → 告警不響。這是刻意取捨：擁有者未知時本就無法斷言「對誰而言
  //     缺了」，而讓告警永遠有雜訊比偶爾漏一筆更糟（永久告警＝被忽略的偵測器）。
  let recorded = 0, alreadyRecorded = 0, noPrimary = 0, probeFailed = 0, recordFailed = 0;
  let unattributableByMissingPrefix = 0, unattributableByUnresolvedPrefix = 0;

  for (const [dir, outputs] of groups) {
    // 與 /api/video/status 共用同一個挑選函式 —— 兩邊必須導出同一個 object_key，
    // 否則同一支影片會變成兩列（見 pickPrimaryOutput 註解的 2026-08-24 案例）。
    const primary = pickPrimaryOutput(outputs);
    if (!primary) { noPrimary++; continue; }
    const checkKey = videoObjectKey(primary);

    // 擁有者只能從 key 反解，解不出就**不補**：跨租戶記到錯的人名下，比「暫時沒被自癒」嚴重得多。
    const prefix = parseOrgPrefixFromDir(dir);
    const ownerOrgId = prefix ? (byPrefix.get(prefix) ?? null) : null;

    let probe = supabase.from("media_assets").select("id").eq("object_key", checkKey);
    if (ownerOrgId) probe = probe.eq("organization_id", ownerOrgId);
    const { data, error } = await probe.limit(1);
    if (error) { probeFailed++; continue; }
    if (data && data.length > 0) { alreadyRecorded++; continue; }

    if (!ownerOrgId) {
      if (!prefix) unattributableByMissingPrefix++;
      else unattributableByUnresolvedPrefix++;
      continue;
    }

    try {
      await recordVideoAsset({ organizationId: ownerOrgId, primaryUrl: primary, outputs, title: dir, sceneCount: 0 });
      recorded++;
    } catch {
      recordFailed++; // best-effort：下輪再補，但不假裝這組已處理
    }
  }

  const orphanUnattributable = unattributableByMissingPrefix + unattributableByUnresolvedPrefix;
  const result: ReconcileResult = {
    ok: true,
    checked: groups.size,
    recorded, alreadyRecorded, orphanUnattributable,
    unattributableByMissingPrefix, unattributableByUnresolvedPrefix,
    noPrimary, probeFailed, recordFailed,
  };

  // 不變量自查：分類窮盡且互斥。不符表示上面漏了一條 continue 分支 —— 回 ok:false 讓它「大聲」，
  // 而不是回一組加不起來、卻長得很正常的數字（那正是本次要根除的形狀）。
  const sum = recorded + alreadyRecorded + orphanUnattributable + noPrimary + probeFailed + recordFailed;
  if (sum !== result.checked) {
    return { ...result, ok: false, error: `classification_mismatch: sum=${sum} checked=${result.checked}` };
  }
  return result;
}
