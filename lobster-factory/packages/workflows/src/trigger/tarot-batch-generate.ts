/**
 * Trigger.dev task: background 78-card tarot batch generation.
 *
 * Runs on EU Trigger.dev worker → calls SG next-admin card callback endpoint for each card.
 * The callback generates the image (using SG's API keys), saves to R2, and updates the
 * in-memory batch store. This keeps all secrets and R2 access on the SG server.
 */

import { task, logger } from "@trigger.dev/sdk";

interface BatchCard {
  index: number;
  name: string;
  prompt: string;
}

interface BatchPayload {
  jobId: string;
  cards: BatchCard[];
  model: string;
  aspectRatio: string;
  seed?: number | null;
  sgBaseUrl: string;      // e.g. https://app.aware-wave.com
  batchSecret?: string;   // BATCH_INTERNAL_SECRET — optional in dev, required in prod
}

interface CardCallbackResult {
  ok: boolean;
  cardIndex?: number;
  url?: string;
  error?: string;
}

export const tarotBatchGenerate = task({
  id: "tarot-batch-generate",
  // Limit to 2 concurrent batch runs to avoid exhausting Replicate quota.
  queue: { concurrencyLimit: 2 },
  // Allow up to 90 min for a full 78-card run (worst case: 78 × ~60s + retries).
  maxDuration: 5400,
  run: async (payload: BatchPayload) => {
    const { jobId, cards, model, aspectRatio, seed, sgBaseUrl, batchSecret } = payload;
    const base = sgBaseUrl.replace(/\/$/, "");

    // Build auth headers for card callback — prefer shared secret, fall back to role header.
    const cardAuthHeaders: Record<string, string> = batchSecret
      ? { Authorization: `Bearer ${batchSecret}` }
      : { "x-ops-claims-role": "operator" };

    logger.info("tarot-batch: started", {
      jobId,
      totalCards: cards.length,
      model,
      aspectRatio,
    });

    // Mark job as running
    try {
      await fetch(`${base}/api/tools/tarot/batch/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-ops-claims-role": "operator" }, // status endpoint uses role check
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (e) {
      logger.warn("tarot-batch: failed to mark running", { jobId, error: String(e) });
    }

    let done = 0;
    let failed = 0;

    for (const card of cards) {
      logger.info(`tarot-batch: card ${card.index + 1}/${cards.length}`, {
        cardName: card.name,
        jobId,
      });

      let result: CardCallbackResult = { ok: false, error: "unknown" };
      let quotaExceeded = false;
      // Retry once on transient errors (timeout / 5xx).
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(
            `${base}/api/tools/tarot/batch/${jobId}/card`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json", ...cardAuthHeaders },
              body: JSON.stringify({
                cardIndex: card.index,
                cardName: card.name,
                prompt: card.prompt,
                model,
                aspectRatio,
                seed: seed ?? null,
              }),
              // Each card generation can take up to 60s; add 5s buffer.
              signal: AbortSignal.timeout(65_000),
            },
          );
          result = (await res.json()) as CardCallbackResult;
          if (res.status === 429) { quotaExceeded = true; break; }
          if (result.ok) break;
        } catch (e) {
          result = { ok: false, error: String(e) };
          if (attempt === 0) {
            logger.warn("tarot-batch: card attempt 1 failed, retrying", {
              cardIndex: card.index,
              error: String(e),
            });
          }
        }
      }

      if (quotaExceeded) {
        logger.warn("tarot-batch: quota exceeded — aborting remaining cards", { jobId, done, failed });
        failed += cards.length - done - failed - 1; // count remaining as failed
        break;
      }

      if (result.ok) {
        done++;
        logger.info("tarot-batch: card done", { cardIndex: card.index, done, failed });
      } else {
        failed++;
        logger.warn("tarot-batch: card failed", {
          cardIndex: card.index,
          error: result.error,
          done,
          failed,
        });
      }
    }

    const summary = { jobId, done, failed, total: cards.length };
    logger.info("tarot-batch: completed", summary);
    return summary;
  },
});
