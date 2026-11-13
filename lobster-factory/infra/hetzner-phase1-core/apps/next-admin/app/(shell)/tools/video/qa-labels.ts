export const QA_LABELS: Record<string, string> = { technical: "技術 QA", caption: "字幕 QA", editorial: "編輯 QA", rights: "版權 QA" };
export const QA_HINTS: Record<string, string> = {
  technical: "檔案能播、無黑畫面／凍結、音量合格",
  caption: "字幕與聲音對得上（需先在 ⑦ 產生字幕）",
  editorial: "有腳本、沒有禁用詞",
  rights: "每個素材都有授權與來源",
};

type Evidence = Record<string, number | string | null>;
export type ExplainableFinding = { rule: string; message: string; evidence?: Evidence };

const num = (v: unknown): string => (typeof v === "number" ? String(v).replace(/^-/, "−") : "量不到");
/** The producer's own message when it is already written for people (CJK), else the fixed cause. */
const own = (fallback: string) => (f: ExplainableFinding) => (/[㐀-鿿]/.test(f.message) ? f.message : fallback);

/**
 * Every QA rule a producer can emit -> what is wrong (from the report: message or evidence) + how to fix it.
 * Producers: video-service quality.py, video-workbench backend/media-inspect.cjs + main-system.cjs renderEvidence,
 * lib/content/video/editorial-rights-qa.ts, caption-qa-persistence.ts, qa-findings-summary.ts (derived rules).
 */
export const FINDING_TEXT: Record<string, { what: (f: ExplainableFinding) => string; fix: string }> = {
  "audio.silent": { what: (f) => `影片沒有聲音（${num(f.evidence?.integratedLufs)} LUFS）`, fix: "加配樂或旁白後重新匯出" },
  "audio.loudness": { what: (f) => `音量不在標準內（${num(f.evidence?.integratedLufs)} LUFS，應在 −30 到 −6）`, fix: "調整音量後重新匯出" },
  "audio.loudness_unmeasured": { what: () => "有音軌但量不到音量", fix: "重新匯出一次；仍失敗請工程師查看" },
  "audio.true_peak": { what: (f) => `音量爆音（峰值 ${num(f.evidence?.truePeakDb)} dBTP，應 ≤ −1）`, fix: "把最大音量調低後重新匯出" },
  "picture.black_frames": { what: () => "黑畫面超過兩成", fix: "剪掉或補上黑掉的片段後重新匯出" },
  "picture.freeze": { what: () => "畫面凍結", fix: "檢查卡住的片段，換素材後重新匯出" },
  "signal.probe_failed": { what: () => "畫面與聲音檢查沒跑成", fix: "重新匯出一次；仍失敗請工程師查看" },
  "probe.unreadable": { what: own("輸出檔讀不到"), fix: "重新匯出一次；仍失敗請工程師查看" },
  "container.video_stream": { what: () => "檔案裡沒有畫面", fix: "重新匯出" },
  "container.audio_stream": { what: own("音軌與設定不符"), fix: "依設定加上或移除聲音後重新匯出" },
  "container.dimensions": { what: () => "影片尺寸無效", fix: "重新匯出" },
  "output.profile_dimensions": { what: () => "影片尺寸和選的比例不符", fix: "用正確比例重新匯出" },
  "output.width": { what: own("影片寬度和設定不符"), fix: "用正確比例重新匯出" },
  "output.height": { what: own("影片高度和設定不符"), fix: "用正確比例重新匯出" },
  "duration.positive": { what: () => "影片長度是 0", fix: "確認時間軸有內容後重新匯出" },
  "duration.mismatch": { what: own("影片長度和時間軸不符"), fix: "重新匯出" },
  "video.fps": { what: own("影格率和設定不符"), fix: "重新匯出" },
  "video.variable_fps": { what: own("影格率不固定"), fix: "重新匯出" },
  "video.color_tags": { what: own("色彩標記不符"), fix: "重新匯出" },
  "caption.timing": { what: () => "字幕時間軸有誤", fix: "在字幕步驟修正時間後重新匯出" },
  "caption.reading_speed": { what: () => "字幕太快讀不完", fix: "把那段字幕拆短或拉長顯示時間" },
  segments_missing: { what: () => "沒有字幕片段", fix: "先在字幕步驟產生字幕" },
  duration_invalid: { what: () => "字幕比影片還長", fix: "在字幕步驟修正時間後重新匯出" },
  missing_title: { what: () => "影片沒有標題", fix: "在專案填上標題" },
  missing_script: { what: () => "成片沒有記錄腳本", fix: "在專案填上腳本或旁白文字" },
  script_too_long: { what: own("腳本太長"), fix: "刪短腳本" },
  forbidden_term: { what: own("腳本含禁用詞"), fix: "改掉那個詞" },
  required_term_missing: { what: own("腳本缺必要詞"), fix: "把必要詞寫進腳本或標題" },
  missing_rights_evidence: { what: () => "沒有任何素材授權紀錄", fix: "在素材上標記授權與來源" },
  invalid_asset_evidence: { what: () => "素材授權紀錄格式錯誤", fix: "重新標記該素材的授權" },
  missing_asset_id: { what: () => "授權紀錄缺素材", fix: "重新標記該素材的授權" },
  duplicate_asset: { what: () => "同一素材記了兩次授權", fix: "刪掉重複的那筆" },
  rights_not_cleared: { what: () => "素材未標記授權", fix: "確認授權後在素材上勾選" },
  missing_license_ref: { what: () => "缺授權文件", fix: "補上授權文件或連結" },
  missing_source_ref: { what: () => "缺素材來源", fix: "補上素材來源" },
  invalid_expiry: { what: () => "授權到期日格式錯誤", fix: "重填到期日" },
  rights_expired: { what: () => "素材授權已過期", fix: "續約授權或換素材" },
  "qa.unexplained": { what: (f) => `檢查結果是${f.evidence?.status === "failed" ? "未通過" : "警告"}，但報告沒寫原因`, fix: "重新匯出再檢查一次；仍一樣請工程師查看" },
};

/** One plain sentence "what is wrong：how to fix it", built only from the report's finding. */
export function explainFinding(f: ExplainableFinding): string {
  const seg = /^segment_(\d+)_invalid$/.exec(f.rule);   // caption QA carries the segment number in the rule
  if (seg) return `第 ${Number(seg[1]) + 1} 段字幕的時間或文字有誤：在字幕步驟修正後重新匯出`;
  const t = FINDING_TEXT[f.rule];
  if (t) return `${t.what(f)}：${t.fix}`;
  return `${f.message || f.rule || "檢查未通過"}：修正後重新匯出再檢查一次`;
}

export const STATUS_TEXT: Record<string, string> = { passed: "✓ 通過", warned: "⚠ 警告", failed: "✗ 未通過", missing: "尚未檢查" };
/** Shown beside a warned/failed QA: why the approve button is off (release-gate.ts: only passed authorizes a Release). */
export const BLOCKED_NOTE = "警告和未通過都要先修好才能核准（目前沒有豁免流程）。";
