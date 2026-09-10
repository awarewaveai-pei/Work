/** Structural real-footage Edit Decision Plan validator; source ownership is checked by repository ports. */
export interface EditPlanFinding { readonly path: string; readonly code: "required" | "type" | "value" | "reference" | "overlap" | "alignment"; readonly message: string; }
export interface EditPlanValidation { readonly ok: boolean; readonly findings: readonly EditPlanFinding[]; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
export function validateEditPlan(input: unknown): EditPlanValidation {
  const findings: EditPlanFinding[] = [];
  if (!object(input)) return { ok: false, findings: [{ path: "$", code: "type", message: "EDP 必須是 JSON 物件" }] };
  if (input.schemaVersion !== "1.0.0") findings.push({ path: "$.schemaVersion", code: "value", message: "必須為 1.0.0" });
  if (typeof input.organizationId !== "string" || !UUID.test(input.organizationId)) findings.push({ path: "$.organizationId", code: "reference", message: "必須是 organization UUID" });
  if (!Array.isArray(input.sources) || input.sources.length === 0) findings.push({ path: "$.sources", code: "required", message: "至少需要一個 source" });
  const durations = new Map<string, number>();
  if (Array.isArray(input.sources)) input.sources.forEach((source, i) => { const path = `$.sources[${i}]`; if (!object(source)) { findings.push({ path, code: "type", message: "source 必須是物件" }); return; } if (typeof source.assetId !== "string" || !UUID.test(source.assetId)) findings.push({ path: `${path}.assetId`, code: "reference", message: "必須是 media_assets UUID" }); if (typeof source.durationMs !== "number" || !Number.isSafeInteger(source.durationMs) || source.durationMs <= 0) findings.push({ path: `${path}.durationMs`, code: "value", message: "durationMs 必須是正整數" }); else durations.set(String(source.assetId), source.durationMs); });
  if (!Array.isArray(input.decisions) || input.decisions.length === 0) findings.push({ path: "$.decisions", code: "required", message: "至少需要一個 decision" });
  const tracks = new Map<string, { start: number; end: number; path: string }[]>();
  if (Array.isArray(input.decisions)) input.decisions.forEach((d, i) => { const path = `$.decisions[${i}]`; if (!object(d)) { findings.push({ path, code: "type", message: "decision 必須是物件" }); return; } const source = durations.get(String(d.sourceAssetId)); if (!source) findings.push({ path: `${path}.sourceAssetId`, code: "reference", message: "必須引用 sources 中的 asset" }); const nums = ["inMs", "outMs", "destinationStartMs"].map(k => d[k]); if (nums.some(v => typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)) { findings.push({ path, code: "value", message: "剪輯時間必須是非負整數毫秒" }); return; } const [inMs, outMs, destination] = nums as number[]; if (outMs <= inMs || (source !== undefined && outMs > source)) findings.push({ path, code: "value", message: "source range 超出來源時長" }); const fps = typeof input.frameRate === "number" ? input.frameRate : 30; if ((destination * fps) % 1000 !== 0 || (inMs * fps) % 1000 !== 0 || (outMs * fps) % 1000 !== 0) findings.push({ path, code: "alignment", message: "時間必須對齊 frame" }); const track = typeof d.track === "string" ? d.track : "video"; const list = tracks.get(track) ?? []; list.push({ start: destination, end: destination + Math.max(0, outMs - inMs), path }); tracks.set(track, list); });
  for (const ranges of tracks.values()) { ranges.sort((a, b) => a.start - b.start); for (let i = 1; i < ranges.length; i++) if (ranges[i].start < ranges[i - 1].end) findings.push({ path: ranges[i].path, code: "overlap", message: "同一輸出 track 不可重疊" }); }
  return { ok: findings.length === 0, findings };
}
