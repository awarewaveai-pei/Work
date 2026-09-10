import { createHash } from "crypto";

export type OutcomePlatform = "wordpress" | "instagram" | "facebook" | "youtube" | "tiktok" | "linkedin";
export interface OutcomeEvent { readonly releaseId: string; readonly deliveryId: string; readonly platform: OutcomePlatform; readonly externalPostId: string; readonly observedAt: string; readonly metrics: Readonly<Record<string, number>>; readonly maturity: "24h" | "7d" | "30d"; }
export interface OutcomeValidation { readonly ok: boolean; readonly eventId?: string; readonly errors: readonly string[]; }
const METRIC = /^(impressions|reach|views|likes|comments|shares|saves|clicks|watch_time_seconds|completion_rate)$/;
export function validateOutcomeEvent(input: unknown): OutcomeValidation {
  const errors: string[] = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, errors: ["event must be an object"] };
  const e = input as Record<string, unknown>;
  for (const field of ["releaseId", "deliveryId", "platform", "externalPostId", "observedAt", "maturity"]) if (typeof e[field] !== "string" || !(e[field] as string).trim()) errors.push(`${field} is required`);
  if (typeof e.platform === "string" && !["wordpress", "instagram", "facebook", "youtube", "tiktok", "linkedin"].includes(e.platform)) errors.push("platform is unsupported");
  if (typeof e.maturity === "string" && !["24h", "7d", "30d"].includes(e.maturity)) errors.push("maturity is unsupported");
  if (typeof e.observedAt === "string" && Number.isNaN(Date.parse(e.observedAt))) errors.push("observedAt must be ISO timestamp");
  if (!e.metrics || typeof e.metrics !== "object" || Array.isArray(e.metrics)) errors.push("metrics must be an object"); else for (const [key, value] of Object.entries(e.metrics as Record<string, unknown>)) { if (!METRIC.test(key)) errors.push(`metric ${key} is unsupported`); if (typeof value !== "number" || !Number.isFinite(value) || value < 0) errors.push(`metric ${key} must be a non-negative number`); }
  if (errors.length) return { ok: false, errors };
  const canonical = JSON.stringify({ releaseId: e.releaseId, deliveryId: e.deliveryId, platform: e.platform, externalPostId: e.externalPostId, observedAt: e.observedAt, maturity: e.maturity });
  return { ok: true, eventId: createHash("sha256").update(canonical).digest("hex"), errors: [] };
}
