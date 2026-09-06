/** Renderer-neutral edit-decision contract shared by Director, editors and render adapters. */
export const MEDIA_TIMELINE_V1_SCHEMA = "1.0.0" as const;
export const MEDIA_TIMELINE_V1_MAX_TRACKS = 16;
export const MEDIA_TIMELINE_V1_MAX_ITEMS_PER_TRACK = 120;
export const MEDIA_TIMELINE_V1_MAX_FRAMES = 18_000;

export const MEDIA_TIMELINE_V1_PURPOSES = ["short_drama", "marketing", "tutorial", "footage_edit"] as const;
export const MEDIA_TIMELINE_V1_FRAME_RATES = [24, 25, 30, 60] as const;
export const MEDIA_TIMELINE_V1_OUTPUT_PROFILES = ["vertical_9_16", "square_4_5", "landscape_16_9", "square_1_1"] as const;
export type MediaTimelineV1Purpose = (typeof MEDIA_TIMELINE_V1_PURPOSES)[number];
export type MediaTimelineV1FrameRate = (typeof MEDIA_TIMELINE_V1_FRAME_RATES)[number];
export type MediaTimelineV1OutputProfile = (typeof MEDIA_TIMELINE_V1_OUTPUT_PROFILES)[number];

export interface MediaTimelineV1 {
  readonly schemaVersion: typeof MEDIA_TIMELINE_V1_SCHEMA;
  readonly timelineId: string;
  readonly organizationId: string;
  readonly purpose: MediaTimelineV1Purpose;
  readonly frameRate: MediaTimelineV1FrameRate;
  readonly outputProfiles: readonly MediaTimelineV1OutputProfile[];
  readonly tracks: readonly MediaTimelineV1Track[];
  readonly styleRef: string;
  readonly provenance: { readonly recipeId?: string; readonly capabilityVersions: Readonly<Record<string, string>>; readonly sourceArtifacts: readonly string[] };
}
export type MediaTimelineV1Track =
  | { readonly id: string; readonly kind: "video"; readonly items: readonly MediaTimelineV1VideoItem[] }
  | { readonly id: string; readonly kind: "audio"; readonly items: readonly MediaTimelineV1AudioItem[] }
  | { readonly id: string; readonly kind: "caption"; readonly items: readonly MediaTimelineV1CaptionItem[] };
export interface MediaTimelineV1VideoItem { readonly id: string; readonly startMs: number; readonly durationMs: number; readonly sourceArtifactId: string; readonly crop: "cover" | "contain"; readonly transitionOut: "cut" | "fade" | "slide_left" | "slide_right"; readonly provenance: "generated" | "footage"; }
export interface MediaTimelineV1AudioItem { readonly id: string; readonly startMs: number; readonly durationMs: number; readonly sourceArtifactId: string; readonly transcriptRef?: string; }
export interface MediaTimelineV1CaptionItem { readonly id: string; readonly startMs: number; readonly endMs: number; readonly text: string; readonly sourceTranscriptSegmentIds: readonly string[]; }
export interface MediaTimelineV1ValidationError { readonly path: string; readonly code: "required" | "type" | "value" | "unknown_field" | "limit" | "alignment" | "overlap" | "reference"; readonly message: string; }
export type MediaTimelineV1Validation = { readonly ok: true; readonly value: MediaTimelineV1 } | { readonly ok: false; readonly errors: readonly MediaTimelineV1ValidationError[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ID = /^[A-Za-z][A-Za-z0-9._-]{0,127}$/;
const ARTIFACT = /^(?:asset|audio|transcript|style|recipe)_[A-Za-z0-9_-]{1,120}$/;
const SEGMENT = /^seg_[A-Za-z0-9_-]{1,120}$/;
const MAX_CAPTION_READING_CHARS_PER_SECOND = 22;

function record(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
function integer(value: unknown): value is number { return typeof value === "number" && Number.isSafeInteger(value) && value >= 0; }
function allowed(value: Record<string, unknown>, keys: readonly string[], path: string, errors: MediaTimelineV1ValidationError[]): void {
  for (const key of Object.keys(value)) if (!keys.includes(key)) errors.push({ path: `${path}.${key}`, code: "unknown_field", message: "欄位不在 Timeline v1 契約內" });
}
function aligned(milliseconds: number, frameRate: number): boolean { return (milliseconds * frameRate) % 1_000 === 0; }
function unique(value: unknown, ids: Set<string>, path: string, errors: MediaTimelineV1ValidationError[]): void {
  if (typeof value !== "string" || !ID.test(value)) errors.push({ path, code: "value", message: "必須是 1–128 字元、以英文字母開頭的 ID" });
  else if (ids.has(value)) errors.push({ path, code: "value", message: "ID 不可重複" });
  else ids.add(value);
}
function reference(value: unknown, known: ReadonlySet<string>, path: string, errors: MediaTimelineV1ValidationError[]): void {
  if (typeof value !== "string" || !ARTIFACT.test(value)) errors.push({ path, code: "reference", message: "必須是受控 artifact reference" });
  else if (!known.has(value)) errors.push({ path, code: "reference", message: "必須列於 provenance.sourceArtifacts" });
}
function timed(start: unknown, duration: unknown, path: string, frameRate: number, errors: MediaTimelineV1ValidationError[]): number | undefined {
  if (!integer(start)) errors.push({ path: `${path}.startMs`, code: "value", message: "必須是非負整數毫秒" });
  if (!integer(duration) || duration === 0) errors.push({ path: `${path}.durationMs`, code: "value", message: "必須是大於零的整數毫秒" });
  if (integer(start) && !aligned(start, frameRate)) errors.push({ path: `${path}.startMs`, code: "alignment", message: "必須對齊影格邊界" });
  if (integer(duration) && duration > 0 && !aligned(duration, frameRate)) errors.push({ path: `${path}.durationMs`, code: "alignment", message: "必須對齊影格邊界" });
  return integer(start) && integer(duration) && duration > 0 ? start + duration : undefined;
}
function overlaps(ranges: readonly { start: number; end: number; path: string }[], errors: MediaTimelineV1ValidationError[]): void {
  const sorted = [...ranges].sort((a, b) => a.start - b.start || a.end - b.end);
  for (let i = 1; i < sorted.length; i++) if (sorted[i].start < sorted[i - 1].end) errors.push({ path: sorted[i].path, code: "overlap", message: "同一 track 的項目不可重疊" });
}

/** Validates deterministic structure only; ownership, rights, source bounds and safe areas need durable repository ports. */
export function validateMediaTimelineV1(input: unknown): MediaTimelineV1Validation {
  const errors: MediaTimelineV1ValidationError[] = [];
  if (!record(input)) return { ok: false, errors: [{ path: "$", code: "type", message: "Timeline 必須是 JSON 物件" }] };
  allowed(input, ["schemaVersion", "timelineId", "organizationId", "purpose", "frameRate", "outputProfiles", "tracks", "styleRef", "provenance"], "$", errors);
  if (input.schemaVersion !== MEDIA_TIMELINE_V1_SCHEMA) errors.push({ path: "$.schemaVersion", code: "value", message: `必須為 ${MEDIA_TIMELINE_V1_SCHEMA}` });
  if (typeof input.timelineId !== "string" || !/^tl_[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.timelineId)) errors.push({ path: "$.timelineId", code: "value", message: "必須是 tl_<uuid>" });
  if (typeof input.organizationId !== "string" || !UUID.test(input.organizationId)) errors.push({ path: "$.organizationId", code: "value", message: "必須是 organization UUID" });
  if (!(MEDIA_TIMELINE_V1_PURPOSES as readonly string[]).includes(input.purpose as string)) errors.push({ path: "$.purpose", code: "value", message: "必須是支援的製作目的" });
  const frameRate = typeof input.frameRate === "number" && (MEDIA_TIMELINE_V1_FRAME_RATES as readonly number[]).includes(input.frameRate) ? input.frameRate : 30;
  if (frameRate !== input.frameRate) errors.push({ path: "$.frameRate", code: "value", message: "必須是支援的 frameRate" });

  if (!Array.isArray(input.outputProfiles) || input.outputProfiles.length === 0) errors.push({ path: "$.outputProfiles", code: "required", message: "至少需要一個輸出 profile" });
  else {
    const profiles = new Set<string>();
    input.outputProfiles.forEach((profile, index) => {
      const path = `$.outputProfiles[${index}]`;
      if (typeof profile !== "string" || !(MEDIA_TIMELINE_V1_OUTPUT_PROFILES as readonly string[]).includes(profile)) errors.push({ path, code: "value", message: "不是支援的輸出 profile" });
      else if (profiles.has(profile)) errors.push({ path, code: "value", message: "輸出 profile 不可重複" }); else profiles.add(profile);
    });
  }

  const known = new Set<string>();
  if (!record(input.provenance)) errors.push({ path: "$.provenance", code: "type", message: "必須是 provenance 物件" });
  else {
    allowed(input.provenance, ["recipeId", "capabilityVersions", "sourceArtifacts"], "$.provenance", errors);
    if (input.provenance.recipeId !== undefined && (typeof input.provenance.recipeId !== "string" || !ARTIFACT.test(input.provenance.recipeId))) errors.push({ path: "$.provenance.recipeId", code: "reference", message: "必須是受控 recipe reference" });
    if (!record(input.provenance.capabilityVersions)) errors.push({ path: "$.provenance.capabilityVersions", code: "type", message: "必須是 capability version map" });
    else for (const [capability, version] of Object.entries(input.provenance.capabilityVersions)) if (!ID.test(capability) || typeof version !== "string" || version.length === 0 || version.length > 64) errors.push({ path: `$.provenance.capabilityVersions.${capability}`, code: "value", message: "capability ID 與版本必須有效" });
    if (!Array.isArray(input.provenance.sourceArtifacts)) errors.push({ path: "$.provenance.sourceArtifacts", code: "type", message: "必須是 artifact reference 陣列" });
    else input.provenance.sourceArtifacts.forEach((artifact, index) => { const path = `$.provenance.sourceArtifacts[${index}]`; if (typeof artifact !== "string" || !ARTIFACT.test(artifact)) errors.push({ path, code: "reference", message: "必須是受控 artifact reference" }); else if (known.has(artifact)) errors.push({ path, code: "value", message: "artifact reference 不可重複" }); else known.add(artifact); });
  }
  if (typeof input.styleRef !== "string" || !ARTIFACT.test(input.styleRef)) errors.push({ path: "$.styleRef", code: "reference", message: "必須是受控 style reference" });

  let maxEnd = 0;
  if (!Array.isArray(input.tracks)) errors.push({ path: "$.tracks", code: "type", message: "必須是 track 陣列" });
  else {
    if (input.tracks.length === 0 || input.tracks.length > MEDIA_TIMELINE_V1_MAX_TRACKS) errors.push({ path: "$.tracks", code: "limit", message: `track 數必須介於 1 與 ${MEDIA_TIMELINE_V1_MAX_TRACKS}` });
    const trackIds = new Set<string>();
    input.tracks.forEach((track, trackIndex) => {
      const trackPath = `$.tracks[${trackIndex}]`;
      if (!record(track)) { errors.push({ path: trackPath, code: "type", message: "track 必須是物件" }); return; }
      allowed(track, ["id", "kind", "items"], trackPath, errors); unique(track.id, trackIds, `${trackPath}.id`, errors);
      if (track.kind !== "video" && track.kind !== "audio" && track.kind !== "caption") { errors.push({ path: `${trackPath}.kind`, code: "value", message: "只支援 video、audio 或 caption track" }); return; }
      if (!Array.isArray(track.items) || track.items.length === 0 || track.items.length > MEDIA_TIMELINE_V1_MAX_ITEMS_PER_TRACK) { errors.push({ path: `${trackPath}.items`, code: "limit", message: `item 數必須介於 1 與 ${MEDIA_TIMELINE_V1_MAX_ITEMS_PER_TRACK}` }); return; }
      const ids = new Set<string>(); const ranges: { start: number; end: number; path: string }[] = [];
      track.items.forEach((item, itemIndex) => {
        const path = `${trackPath}.items[${itemIndex}]`;
        if (!record(item)) { errors.push({ path, code: "type", message: "item 必須是物件" }); return; }
        unique(item.id, ids, `${path}.id`, errors);
        if (track.kind === "caption") {
          allowed(item, ["id", "startMs", "endMs", "text", "sourceTranscriptSegmentIds"], path, errors);
          if (!integer(item.startMs) || !integer(item.endMs) || item.endMs <= item.startMs) { errors.push({ path, code: "value", message: "caption 必須有非負且遞增的 startMs/endMs" }); return; }
          if (!aligned(item.startMs, frameRate) || !aligned(item.endMs, frameRate)) errors.push({ path, code: "alignment", message: "caption 時間必須對齊影格邊界" });
          if (typeof item.text !== "string" || item.text.trim().length === 0 || item.text.length > 600) errors.push({ path: `${path}.text`, code: "value", message: "caption 必須是 1–600 字元" });
          else if (item.text.length / ((item.endMs - item.startMs) / 1_000) > MAX_CAPTION_READING_CHARS_PER_SECOND) errors.push({ path: `${path}.text`, code: "limit", message: "caption 閱讀速度超過限制" });
          if (!Array.isArray(item.sourceTranscriptSegmentIds) || item.sourceTranscriptSegmentIds.length === 0 || item.sourceTranscriptSegmentIds.some((id) => typeof id !== "string" || !SEGMENT.test(id))) errors.push({ path: `${path}.sourceTranscriptSegmentIds`, code: "reference", message: "必須包含受控 transcript segment IDs" });
          ranges.push({ start: item.startMs, end: item.endMs, path }); maxEnd = Math.max(maxEnd, item.endMs); return;
        }
        const keys = track.kind === "video" ? ["id", "startMs", "durationMs", "sourceArtifactId", "crop", "transitionOut", "provenance"] : ["id", "startMs", "durationMs", "sourceArtifactId", "transcriptRef"];
        allowed(item, keys, path, errors); const end = timed(item.startMs, item.durationMs, path, frameRate, errors); reference(item.sourceArtifactId, known, `${path}.sourceArtifactId`, errors);
        if (track.kind === "video") { if (item.crop !== "cover" && item.crop !== "contain") errors.push({ path: `${path}.crop`, code: "value", message: "必須是 cover 或 contain" }); if (!["cut", "fade", "slide_left", "slide_right"].includes(item.transitionOut as string)) errors.push({ path: `${path}.transitionOut`, code: "value", message: "必須是支援的 transitionOut" }); if (item.provenance !== "generated" && item.provenance !== "footage") errors.push({ path: `${path}.provenance`, code: "value", message: "必須是 generated 或 footage" }); }
        else if (item.transcriptRef !== undefined) reference(item.transcriptRef, known, `${path}.transcriptRef`, errors);
        if (end !== undefined && integer(item.startMs)) { ranges.push({ start: item.startMs, end, path }); maxEnd = Math.max(maxEnd, end); }
      });
      overlaps(ranges, errors);
    });
    if ((maxEnd * frameRate) / 1_000 > MEDIA_TIMELINE_V1_MAX_FRAMES) errors.push({ path: "$.tracks", code: "limit", message: `總長度不可超過 ${MEDIA_TIMELINE_V1_MAX_FRAMES} 影格` });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: input as unknown as MediaTimelineV1 };
}
