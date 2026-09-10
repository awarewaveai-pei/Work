// robots.txt, as much of it as is honest to implement.
//
// Supports the parts that actually decide whether a path may be fetched: user-agent group matching
// (exact agent beats "*"), Allow/Disallow with longest-match-wins, "$" and "*" wildcards, and
// Crawl-delay. Sitemap lines are surfaced because C2's sitemap block will want them.
//
// FAIL-OPEN vs FAIL-CLOSED: a 404 (no robots.txt) means everything is allowed — that is the
// standard. A fetch ERROR is different: we do not know, so the crawl treats it as disallowed rather
// than pretending permission it never got.

export interface RobotsRules {
  groups: Array<{ agents: string[]; allow: string[]; disallow: string[]; crawlDelay: number | null }>;
  sitemaps: string[];
}

export function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { groups: [], sitemaps: [] };
  let current: RobotsRules["groups"][number] | null = null;
  let lastLineWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const idx = line.indexOf(":");
    if (idx < 0) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines share one group of rules.
      if (!current || !lastLineWasAgent) {
        current = { agents: [], allow: [], disallow: [], crawlDelay: null };
        rules.groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastLineWasAgent = true;
      continue;
    }
    lastLineWasAgent = false;

    if (field === "sitemap") {
      rules.sitemaps.push(value);
      continue;
    }
    if (!current) continue;
    if (field === "allow" && value) current.allow.push(value);
    else if (field === "disallow") current.disallow.push(value); // empty Disallow means "allow all"
    else if (field === "crawl-delay") {
      const n = Number(value);
      if (Number.isFinite(n)) current.crawlDelay = n;
    }
  }
  return rules;
}

function patternMatches(pattern: string, path: string): number {
  // Returns the match length (for longest-match-wins) or -1.
  const endAnchored = pattern.endsWith("$");
  const p = endAnchored ? pattern.slice(0, -1) : pattern;
  const parts = p.split("*");

  let cursor = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (!part) continue;
    const at = i === 0 ? (path.startsWith(part) ? 0 : -1) : path.indexOf(part, cursor);
    if (at < 0) return -1;
    cursor = at + part.length;
  }
  if (endAnchored && cursor !== path.length) return -1;
  return p.length;
}

export function groupFor(rules: RobotsRules, userAgent: string): RobotsRules["groups"][number] | null {
  const ua = userAgent.toLowerCase();
  // `a` must be non-empty: a malformed "User-agent:" with no value would otherwise match every
  // crawler as if it were an exact match, and its rules would outrank the real "*" group.
  const specific = rules.groups.find((g) => g.agents.some((a) => a !== "*" && a.length > 0 && ua.includes(a)));
  if (specific) return specific;
  return rules.groups.find((g) => g.agents.includes("*")) ?? null;
}

export function isAllowed(rules: RobotsRules, userAgent: string, pathname: string): boolean {
  const group = groupFor(rules, userAgent);
  if (!group) return true;
  const allow = Math.max(-1, ...group.allow.map((p) => patternMatches(p, pathname)));
  const disallow = Math.max(-1, ...group.disallow.filter(Boolean).map((p) => patternMatches(p, pathname)));
  if (disallow < 0) return true;
  return allow >= disallow; // ties go to Allow, per the de-facto standard
}

export interface RobotsFetcher {
  (robotsUrl: string): Promise<{ status: number; text: string }>;
}

/**
 * Per-origin cache of robots.txt. One lookup per origin per process; the crawl asks for every URL.
 */
export class RobotsCache {
  private readonly cache = new Map<string, { rules: RobotsRules | "error"; until: number }>();

  constructor(
    private readonly fetcher: RobotsFetcher,
    private readonly userAgent: string,
    private readonly opts: { errorTtlMs?: number; okTtlMs?: number; now?: () => number } = {},
  ) {}

  private now(): number {
    return this.opts.now?.() ?? Date.now();
  }

  async allows(url: string): Promise<{ allowed: boolean; reason: string | null; crawlDelay: number | null }> {
    let u: URL;
    try {
      u = new URL(url);
    } catch {
      return { allowed: false, reason: "unparseable_url", crawlDelay: null };
    }
    const origin = u.origin;
    const now = this.now();
    let entry = this.cache.get(origin);
    if (!entry || entry.until <= now) {
      let rules: RobotsRules | "error";
      try {
        const res = await this.fetcher(`${origin}/robots.txt`);
        // 404 means "no robots.txt", which means everything is allowed — that is the standard.
        // A fetch ERROR is different: we do not know, so we refuse rather than assume permission.
        rules = res.status === 200 ? parseRobots(res.text) : { groups: [], sitemaps: [] };
      } catch {
        rules = "error";
      }
      // Errors are cached BRIEFLY. Caching them for the life of the process turns one network
      // hiccup into "this whole site is off limits until the server restarts".
      const ttl = rules === "error" ? (this.opts.errorTtlMs ?? 60_000) : (this.opts.okTtlMs ?? 3_600_000);
      entry = { rules, until: now + ttl };
      this.cache.set(origin, entry);
    }
    const rules = entry.rules;
    if (rules === "error") return { allowed: false, reason: "robots_unavailable", crawlDelay: null };

    const group = groupFor(rules, this.userAgent);
    const allowed = isAllowed(rules, this.userAgent, u.pathname + u.search);
    return { allowed, reason: allowed ? null : "robots_disallow", crawlDelay: group?.crawlDelay ?? null };
  }

  sitemapsOf(url: string): string[] {
    try {
      const rules = this.cache.get(new URL(url).origin)?.rules;
      return rules && rules !== "error" ? rules.sitemaps : [];
    } catch {
      return [];
    }
  }
}
