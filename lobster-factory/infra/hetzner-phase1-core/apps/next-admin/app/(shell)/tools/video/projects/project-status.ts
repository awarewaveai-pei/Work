const STAGE_TEXT: Record<string, string> = { create: "寫腳本中", produce: "生成中", review: "待審", release: "發布中", measure: "已發布" };

/** last_error 有值一律「需要處理」，其餘由 lifecycle_stage 決定。 */
export function projectStatus(stage: string, lastError: string | null | undefined): { text: string; bad: boolean } {
  if (lastError) return { text: "需要處理", bad: true };
  return { text: STAGE_TEXT[stage] ?? stage, bad: false };
}
