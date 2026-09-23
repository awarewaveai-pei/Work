// Kill switch for the three copy-based "送去 X" bridges: /ops/collect's 送去 Cognitive OS and 送去 HCI,
// and the client hub's per-folder 送去 Cognitive OS (routes cognitive-os-import, hci-import,
// internal/cognitive-os/import-project-sources; libs lib/cognitive-os/import-sources.ts and
// lib/hci/import-sources.ts).
//
// OFF unless RESEARCH_BRIDGES_ENABLED is exactly "true". Frozen 2026-09-23 by
// Projects/internal/cognitive-engineering-os/docs/RESEARCH_LINES_MASTER_PLAN.md §5 P0: research
// collection moves to Cognitive OS Project actions (plan §3.2); these bridges copy data across tenants
// with no provenance and are retired at P4 (plan §8). Code and data stay untouched -- setting the env
// var is the whole rollback. The read-side handoff (app/api/cognitive-os/open) is deliberately NOT
// behind this switch: it copies nothing and still opens already-imported Projects.

export function isResearchBridgesEnabled(): boolean {
  return process.env.RESEARCH_BRIDGES_ENABLED === "true";
}

export const RESEARCH_BRIDGES_FROZEN = "research_bridges_frozen";

export const RESEARCH_BRIDGES_FROZEN_HINT =
  "「送去 Cognitive OS／HCI」已於 2026-09-23 凍結：研究蒐集改在 Cognitive OS 的專案內進行（RESEARCH_LINES_MASTER_PLAN §3.2）。";

/** Body every frozen bridge route answers with (HTTP 410 Gone: intentionally unavailable, not broken). */
export function researchBridgesFrozenBody(): { ok: false; error: typeof RESEARCH_BRIDGES_FROZEN; hint: string } {
  return { ok: false, error: RESEARCH_BRIDGES_FROZEN, hint: RESEARCH_BRIDGES_FROZEN_HINT };
}
