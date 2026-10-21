// Auto-reply rules (migration 0105 social_auto_rules; ADR 016 §5 decision 6): what a rule may hold. The composer's
// 這則的自動回覆 (C21) writes a post's own rule; the brand's rules tab and matching come with C27.
// Pure (the composer imports it): RuleError here, the route turns it into a 400 (the repeat-rule.ts pattern).
import type { AutoRuleInput } from "./store";
import type { AutoRule } from "./store";

export const RULE_PLATFORMS = ["facebook", "instagram"] as const;   // Meta's review covers these two only (0105 check)
const TRIGGERS = ["comment", "dm"] as const;
const ACTIONS = ["reply", "dm", "both"] as const;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}

/** Keywords as typed: comma separated (、 and ， too), trimmed, empty ones dropped. */
export function splitKeywords(text: string): string[] {
  return text.split(/[,，、]/).map((k) => k.trim()).filter(Boolean);
}

/** The rule as 0105 social_save_auto_rule takes it, or RuleError. A rule that can answer needs keywords, a reply and
 *  a platform (the mock's composer check), so a half-filled form is refused rather than stored doing nothing. */
export function parseAutoRule(raw: unknown): AutoRuleInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new RuleError("rule must be an object");
  const r = raw as Record<string, unknown>;
  const str = (k: string, max: number) => {
    const v = r[k] ?? "";
    if (typeof v !== "string" || v.length > max) throw new RuleError(`rule.${k} must be a string of at most ${max}`);
    return v.trim();
  };
  if (!TRIGGERS.includes(r.trigger as never)) throw new RuleError(`rule.trigger must be one of ${TRIGGERS.join(", ")}`);
  if (!ACTIONS.includes(r.action as never)) throw new RuleError(`rule.action must be one of ${ACTIONS.join(", ")}`);
  const keywords = Array.isArray(r.keywords) && r.keywords.every((k) => typeof k === "string") ? (r.keywords as string[]).map((k) => k.trim()).filter(Boolean)
    : typeof r.keywords === "string" ? splitKeywords(r.keywords) : null;
  if (!keywords?.length || keywords.length > 50) throw new RuleError("rule.keywords: 1..50 keywords");
  const platforms = Array.isArray(r.platforms) ? [...new Set(r.platforms)] : [];
  if (!platforms.length || platforms.some((p) => !RULE_PLATFORMS.includes(p as never))) throw new RuleError(`rule.platforms: one or more of ${RULE_PLATFORMS.join(", ")}`);
  const reply = str("reply", 2000);
  if (!reply) throw new RuleError("rule.reply is empty");
  if (r.post_id != null && (typeof r.post_id !== "string" || !UUID_RE.test(r.post_id))) throw new RuleError("rule.post_id must be a uuid");
  return {
    post_id: (r.post_id as string | null | undefined) ?? null,
    name: str("name", 80), trigger: r.trigger as AutoRuleInput["trigger"], keywords, platforms: platforms as string[],
    action: r.action as AutoRuleInput["action"], reply, active: r.active === undefined ? true : r.active === true,
  };
}

export interface AutoRuleMatchInput {
  postId?: string | null;
  trigger: AutoRule["trigger"];
  platform: string;
  text: string;
}

/** Choose the first active keyword rule; an explicitly supplied post rule excludes brand rules. */
export function matchRule(text: string, rules: AutoRule[], postRule?: AutoRule | null): AutoRule | null {
  const candidates = postRule ? [postRule] : rules;
  const lowerText = text.toLocaleLowerCase();
  return candidates.find((rule) => rule.active
    && rule.keywords.some((keyword) => splitKeywords(keyword).some((part) => lowerText.includes(part.toLocaleLowerCase())))) ?? null;
}

/** Choose the first active rule matching the event; a post rule wins over brand rules. */
export function matchAutoRule(rules: AutoRule[], input: AutoRuleMatchInput): AutoRule | null {
  const ownRules = input.postId ? rules.filter((rule) => rule.post_id === input.postId) : [];
  const candidates = (ownRules.length ? ownRules : rules.filter((rule) => rule.post_id === null))
    .filter((rule) => rule.trigger === input.trigger && rule.platforms.includes(input.platform));
  return matchRule(input.text, candidates);
}
