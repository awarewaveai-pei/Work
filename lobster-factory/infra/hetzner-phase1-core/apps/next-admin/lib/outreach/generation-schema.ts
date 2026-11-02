// Cold Outreach v2 — the shape a generation must have (SPEC §5.3). Hand-written guard: the repo carries no schema library.
// Errors are short and specific because they go back to the model once as the repair request.

/** The opening angle of a first email (SPEC D24 ③): fixed, so reply rates group per angle (co_messages.angle, stats.ts) and
 *  the winner can be named in the prompt. The model picks one per variant; A and B must differ. */
export const ANGLES = ["observation", "pain", "result", "question", "peer"] as const;
export type Angle = (typeof ANGLES)[number];
/** What each angle means, in the words the prompt and the 「有效做法」 section use. */
export const ANGLE_LABEL: Record<Angle, string> = {
  observation: "以對方網站上的具體觀察開場",
  pain: "以這類業者常見的困擾開場",
  result: "以我們做得出的具體成果開場",
  question: "以一個直接的問句開場",
  peer: "以同類型業者的做法開場",
};
export const isAngle = (v: unknown): v is Angle => typeof v === "string" && (ANGLES as readonly string[]).includes(v);

export interface GeneratedBody { label: "A" | "B"; angle: Angle; text: string; evidence_ids: string[] }
export interface GeneratedFollowup { step: number; delay_days: number; text: string }
export interface GenerationOutput { subjects: [string, string]; bodies: [GeneratedBody, GeneratedBody]; followups: GeneratedFollowup[] }

export type ParseResult = { ok: true; value: GenerationOutput } | { ok: false; error: string };

const MAX_FOLLOWUPS = 4;
/** Output ceiling for the generators (ai-claude/openai/gemini): two first emails and up to four follow-ups as JSON. */
export const OUTREACH_MAX_TOKENS = 3000;
const isStr = (v: unknown): v is string => typeof v === "string" && v.trim() !== "";

/** The first {...} block of a reply (models wrap JSON in prose or fences despite being told not to). */
function jsonObject(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  return start >= 0 && end > start ? raw.slice(start, end + 1) : null;
}

export function parseGenerationOutput(raw: string, knownEvidenceIds: readonly string[]): ParseResult {
  const block = jsonObject(raw ?? "");
  if (!block) return { ok: false, error: "no JSON object in the reply" };
  let v: unknown;
  try { v = JSON.parse(block); } catch (e) { return { ok: false, error: `invalid JSON: ${e instanceof Error ? e.message : "parse error"}` }; }
  if (!v || typeof v !== "object") return { ok: false, error: "the reply is not a JSON object" };
  const o = v as Record<string, unknown>;

  const subjects = o.subjects;
  if (!Array.isArray(subjects) || subjects.length !== 2 || !subjects.every(isStr)) {
    return { ok: false, error: "subjects must be an array of exactly 2 non-empty strings" };
  }

  const bodies = o.bodies;
  if (!Array.isArray(bodies) || bodies.length !== 2) return { ok: false, error: "bodies must be an array of exactly 2 objects" };
  const known = new Set(knownEvidenceIds);
  const parsed: GeneratedBody[] = [];
  for (const [i, b] of bodies.entries()) {
    const want = i === 0 ? "A" : "B";
    if (!b || typeof b !== "object") return { ok: false, error: `bodies[${i}] must be an object` };
    const r = b as Record<string, unknown>;
    if (r.label !== want) return { ok: false, error: `bodies[${i}].label must be "${want}"` };
    if (!isStr(r.text)) return { ok: false, error: `bodies[${i}].text must be a non-empty string` };
    if (!isAngle(r.angle)) return { ok: false, error: `bodies[${i}].angle must be one of ${ANGLES.join(", ")}` };
    const ids = r.evidence_ids;
    if (!Array.isArray(ids) || ids.length === 0 || !ids.every(isStr)) {
      return { ok: false, error: `bodies[${i}].evidence_ids must list at least one evidence id` };
    }
    const unknown = ids.filter((id) => !known.has(id));
    if (unknown.length) return { ok: false, error: `bodies[${i}].evidence_ids names ids that are not in the evidence: ${unknown.join(", ")}` };
    parsed.push({ label: want, angle: r.angle, text: r.text.trim(), evidence_ids: Array.from(new Set(ids)) });
  }

  const followups = o.followups ?? [];
  if (!Array.isArray(followups) || followups.length > MAX_FOLLOWUPS) {
    return { ok: false, error: `followups must be an array of at most ${MAX_FOLLOWUPS} objects` };
  }
  const fu: GeneratedFollowup[] = [];
  for (const [i, f] of followups.entries()) {
    if (!f || typeof f !== "object") return { ok: false, error: `followups[${i}] must be an object` };
    const r = f as Record<string, unknown>;
    const step = r.step, delay = r.delay_days;
    if (step !== i + 2) return { ok: false, error: `followups[${i}].step must be ${i + 2}` };
    if (typeof delay !== "number" || !Number.isInteger(delay) || delay < 1 || delay > 60) {
      return { ok: false, error: `followups[${i}].delay_days must be an integer from 1 to 60` };
    }
    if (!isStr(r.text)) return { ok: false, error: `followups[${i}].text must be a non-empty string` };
    fu.push({ step: i + 2, delay_days: delay, text: r.text.trim() });
  }

  if (parsed[0].angle === parsed[1].angle) return { ok: false, error: "bodies A and B must use different angles" };

  return {
    ok: true,
    value: { subjects: [subjects[0].trim(), subjects[1].trim()], bodies: [parsed[0], parsed[1]], followups: fu },
  };
}

/** The one repair turn: the model's own reply and what was wrong with it. */
export function repairPrompt(original: string, reply: string, error: string): string {
  return [original, "", "## 你上一次的回覆格式不對", `錯誤：${error}`, "上一次的回覆：", reply.slice(0, 4000), "",
    "請只輸出修正後的 JSON 物件。"].join("\n");
}
