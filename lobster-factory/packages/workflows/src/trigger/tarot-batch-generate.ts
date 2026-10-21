/**
 * Trigger.dev task: background 78-card tarot batch generation.
 *
 * Calls next-admin's POST /api/internal/tarot/batch/[jobId]/start, then .../card once per card. The card callback
 * generates the image with next-admin's API keys, saves it to R2 and records the card's row (migration 0115). A retried
 * card callback is safe: next-admin claims the card first, so it never generates or counts a card twice.
 *
 * Token: BATCH_INTERNAL_SECRET, synced by scripts/lobster-trigger-deploy.ps1 from the RUNNING next-admin. Never in the
 * payload: run payloads are stored and shown in the Trigger dashboard. Unset -> the run fails at once.
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
  // No whole-run retry: it would restart at card 0 and bill every finished card again; cards retry on their own below.
  retry: { maxAttempts: 1 },
  // Worst case 78 cards × 2 attempts × 65 s = 10,140 s. next-admin's job deadline is this + 10 min
  // (RUN_BUDGET_MS in apps/next-admin/lib/tarot/batch-store.ts): change both together.
  maxDuration: 10_800,
  run: async (payload: BatchPayload) => {
    const { jobId, cards, model, aspectRatio, seed } = payload;
    const token = process.env.BATCH_INTERNAL_SECRET?.trim();
    if (!token) throw new Error("tarot-batch: BATCH_INTERNAL_SECRET not set on this worker");
    const base = (process.env.AWAREWAVE_WEBHOOK_BASE_URL ?? "https://app.aware-wave.com").replace(/\/$/, "");
    const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

    logger.info("tarot-batch: started", {
      jobId,
      totalCards: cards.length,
      model,
      aspectRatio,
    });

    // 401 (token drift) or 404 (job lost to a next-admin restart) can never succeed: fail the run so it is seen,
    // instead of finishing "completed" with every card failed while the browser polls a job stuck at pending.
    const refused = (status: number) => status === 401 || status === 404;

    // Mark job as running
    const start = await fetch(`${base}/api/internal/tarot/batch/${jobId}/start`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(10_000),
    }).catch((e) => {
      logger.warn("tarot-batch: failed to mark running", { jobId, error: String(e) });
      return null;
    });
    if (start && refused(start.status)) throw new Error(`tarot-batch: next-admin refused start (${start.status})`);

    let done = 0;
    let failed = 0;

    for (const card of cards) {
      logger.info(`tarot-batch: card ${card.index + 1}/${cards.length}`, {
        cardName: card.name,
        jobId,
      });

      let result: CardCallbackResult = { ok: false, error: "unknown" };
      let quotaExceeded = false;
      let refusedStatus = 0;
      // Retry once on transient errors (timeout / 5xx).
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const res = await fetch(
            `${base}/api/internal/tarot/batch/${jobId}/card`,
            {
              method: "POST",
              headers,
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
          if (refused(res.status)) { refusedStatus = res.status; break; }
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

      if (refusedStatus) throw new Error(`tarot-batch: next-admin refused card ${card.index} (${refusedStatus})`);

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
