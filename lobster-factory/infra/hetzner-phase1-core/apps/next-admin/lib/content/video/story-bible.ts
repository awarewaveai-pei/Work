/** Structural Story Bible v1 validator. References are UUIDs; persistence/RLS is a separate port. */
export interface StoryBibleFinding { readonly path: string; readonly code: "required" | "type" | "value" | "unknown_field" | "reference"; readonly message: string; }
export interface StoryBibleValidation { readonly ok: boolean; readonly findings: readonly StoryBibleFinding[]; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
function object(v: unknown): v is Record<string, unknown> { return !!v && typeof v === "object" && !Array.isArray(v); }
function required(v: unknown, path: string, out: StoryBibleFinding[]): v is string { if (typeof v !== "string" || !v.trim()) { out.push({ path, code: "required", message: "必須是非空字串" }); return false; } return true; }
function keys(v: Record<string, unknown>, allowed: readonly string[], path: string, out: StoryBibleFinding[]) { for (const key of Object.keys(v)) if (!allowed.includes(key)) out.push({ path: `${path}.${key}`, code: "unknown_field", message: "欄位不在 Story Bible v1 契約內" }); }
function id(v: unknown, path: string, out: StoryBibleFinding[]) { if (typeof v !== "string" || !ID.test(v)) out.push({ path, code: "value", message: "ID 格式無效" }); }
function refs(v: unknown, path: string, out: StoryBibleFinding[]) { if (!Array.isArray(v)) { out.push({ path, code: "type", message: "必須是 UUID 陣列" }); return; } for (const [i, ref] of v.entries()) if (typeof ref !== "string" || !UUID.test(ref)) out.push({ path: `${path}[${i}]`, code: "reference", message: "必須是 media_assets UUID" }); }

export function validateStoryBible(input: unknown): StoryBibleValidation {
  const findings: StoryBibleFinding[] = [];
  if (!object(input)) return { ok: false, findings: [{ path: "$", code: "type", message: "Bible 必須是 JSON 物件" }] };
  keys(input, ["schemaVersion", "organizationId", "seriesId", "revision", "state", "characters", "locations", "props", "continuity", "episode", "provenance"], "$", findings);
  if (input.schemaVersion !== "1.0.0") findings.push({ path: "$.schemaVersion", code: "value", message: "必須為 1.0.0" });
  if (typeof input.organizationId !== "string" || !UUID.test(input.organizationId)) findings.push({ path: "$.organizationId", code: "reference", message: "必須是 organization UUID" });
  id(input.seriesId, "$.seriesId", findings); if (input.revision !== 1 && !(typeof input.revision === "number" && Number.isSafeInteger(input.revision) && input.revision > 0)) findings.push({ path: "$.revision", code: "value", message: "revision 必須是正整數" });
  if (!(input.state === "draft" || input.state === "approved")) findings.push({ path: "$.state", code: "value", message: "state 必須是 draft 或 approved" });
  for (const field of ["characters", "locations", "props"]) {
    const value = input[field]; if (!Array.isArray(value)) { findings.push({ path: `$.${field}`, code: "type", message: "必須是陣列" }); continue; }
    value.forEach((entry, i) => { const path = `$.${field}[${i}]`; if (!object(entry)) { findings.push({ path, code: "type", message: "項目必須是物件" }); return; } keys(entry, ["id", "name", "role", "referenceAssetIds", "rightsNote"], path, findings); id(entry.id, `${path}.id`, findings); required(entry.name, `${path}.name`, findings); refs(entry.referenceAssetIds, `${path}.referenceAssetIds`, findings); });
  }
  if (!object(input.continuity)) findings.push({ path: "$.continuity", code: "type", message: "必須是物件" }); else { keys(input.continuity, ["currentState", "prohibitions", "openThreads"], "$.continuity", findings); for (const k of ["currentState", "prohibitions", "openThreads"]) if (!Array.isArray(input.continuity[k])) findings.push({ path: `$.continuity.${k}`, code: "type", message: "必須是陣列" }); }
  if (!object(input.episode)) findings.push({ path: "$.episode", code: "type", message: "必須是物件" }); else { keys(input.episode, ["episodeId", "premise", "hook", "beats", "stateDelta"], "$.episode", findings); id(input.episode.episodeId, "$.episode.episodeId", findings); required(input.episode.premise, "$.episode.premise", findings); required(input.episode.hook, "$.episode.hook", findings); if (!Array.isArray(input.episode.beats) || input.episode.beats.length === 0) findings.push({ path: "$.episode.beats", code: "required", message: "至少需要一個 beat" }); if (!object(input.episode.stateDelta)) findings.push({ path: "$.episode.stateDelta", code: "type", message: "必須是物件" }); }
  if (!object(input.provenance)) findings.push({ path: "$.provenance", code: "type", message: "必須是物件" }); else { keys(input.provenance, ["capabilityVersion", "sourceArtifactIds"], "$.provenance", findings); required(input.provenance.capabilityVersion, "$.provenance.capabilityVersion", findings); refs(input.provenance.sourceArtifactIds, "$.provenance.sourceArtifactIds", findings); }
  return { ok: findings.length === 0, findings };
}
