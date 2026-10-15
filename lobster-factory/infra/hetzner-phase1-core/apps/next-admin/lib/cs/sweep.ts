// Hands claimed Chatwoot messages whose outcome never reached Chatwoot to a human. The webhook
// (app/api/webhooks/chatwoot/route.ts) answers right after claimMessage and runs the pipeline in after();
// work cut off there (container restart on deploy) or a failed delivery leaves cs_ai_replies.completed_at
// NULL (migration 0099). Called by POST /api/internal/cs/sweep, which the Trigger schedule
// `cs-inbound-sweep` hits every 5 minutes. Never re-runs the AI: the message may be minutes old and a
// second pass could reply twice.

import { loadCis } from "@/lib/cs/cis";
import { completeClaim, listUnfinishedClaims } from "@/lib/cs/db";
import { handoffToHuman, sendPrivateDraft } from "@/lib/cs/chatwoot-client";

/** Well past the slowest pipeline (CS_TIMEOUTS with CS_THRESHOLDS.maxToolRounds ≈ 3 min), so live work is never touched. */
export const CS_SWEEP_STALE_MS = 10 * 60_000;

export interface CsSweepResult {
  handedOff: number;
  failed: number;
}

/** Throws when the claim list cannot be read (the caller must not report "nothing to do"). */
export async function sweepUnfinishedClaims(): Promise<CsSweepResult> {
  const result: CsSweepResult = { handedOff: 0, failed: 0 };
  for (const claim of await listUnfinishedClaims(CS_SWEEP_STALE_MS)) {
    const { organizationId, conversationId } = claim;
    try {
      const cis = await loadCis(organizationId);
      if (cis.chatwoot) {
        // Handoff first: it is idempotent (status -> open), so a retry after a failed note never
        // posts the note twice. Closed only after both went through.
        await handoffToHuman(organizationId, cis.chatwoot, conversationId);
        await sendPrivateDraft(organizationId, cis.chatwoot, conversationId, "AI 處理中斷，未產生回覆，已轉真人");
      }
      if (await completeClaim(claim)) result.handedOff++;
    } catch (err) {
      result.failed++;
      console.error(`[cs/sweep] ${organizationId} message ${claim.messageId}: ${String(err).slice(0, 200)}`);
    }
  }
  return result;
}
