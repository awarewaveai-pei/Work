export const QA_LABELS: Record<string, string> = { technical: "技術 QA", caption: "字幕 QA", editorial: "編輯 QA", rights: "版權 QA" };
export const QA_HINTS: Record<string, string> = {
  technical: "檔案能播、無黑畫面／凍結、音量合格",
  caption: "字幕與聲音對得上（需先在 ⑦ 產生字幕）",
  editorial: "有腳本、沒有禁用詞",
  rights: "每個素材都有授權與來源",
};
export const FINDING_LABELS: Record<string, string> = {
  "picture.black_frames": "黑畫面過多",
  "picture.freeze": "畫面凍結",
  "audio.loudness": "音量不在標準內",
  "audio.true_peak": "音量爆音",
  "caption.timing": "字幕時間軸有誤",
  missing_script: "成片沒有記錄腳本",
  rights_not_cleared: "素材未標記授權",
  missing_license_ref: "缺授權文件",
  missing_source_ref: "缺素材來源",
  segments_missing: "沒有字幕片段",
  duration_invalid: "字幕比影片還長",
};
/** caption QA 的 segment_<n>_invalid 帶段號，不能放進固定對照表。 */
export function findingLabel(rule: string, message: string): string {
  const seg = /^segment_(\d+)_invalid$/.exec(rule);
  if (seg) return `第 ${Number(seg[1]) + 1} 段字幕的時間或文字有誤`;
  return FINDING_LABELS[rule] ?? message;
}
export const STATUS_TEXT: Record<string, string> = { passed: "✓ 通過", warned: "⚠ 警告", failed: "✗ 未通過", missing: "尚未檢查" };
