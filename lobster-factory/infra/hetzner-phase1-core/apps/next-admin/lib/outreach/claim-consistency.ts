// Card C16.2: is the fact check stable? Each email is checked twice; the share with the same verdict both times is the
// consistency rate (gate: >= 95%). An error on either run counts as a disagreement: an unstable check must not pass.
// Run by POST /api/internal/outreach/claim-consistency; any first email with approved evidence is a sample, sent or not.
import type { ClaimCheck } from "./review-policy";

export interface ConsistencySample { messageId: string; run(): Promise<ClaimCheck> }
export interface ConsistencyReport {
  n: number;
  agreed: number;
  /** agreed / n, 0 when n is 0 */
  rate: number;
  /** runs that answered error (unreadable reply, failed call), counted inside the disagreements */
  errors: number;
  /** the first error's text: 400 errors in 13 s were the gateway's 429, not the check (2026-11-05) */
  firstError: string | null;
  disagreements: Array<{ messageId: string; first: ClaimCheck["verdict"]; second: ClaimCheck["verdict"] }>;
}

/** Emails checked at once. Each voted check makes two calls at once; 8 workers got the database gateway's 429. */
const CONCURRENCY = 4;

export async function measureConsistency(samples: readonly ConsistencySample[]): Promise<ConsistencyReport> {
  const r: ConsistencyReport = { n: 0, agreed: 0, rate: 0, errors: 0, firstError: null, disagreements: [] };
  let next = 0;
  const once = (s: ConsistencySample) => s.run().catch((e): ClaimCheck => ({ verdict: "error", error: e instanceof Error ? e.message : String(e) }));
  const worker = async () => {
    for (let i = next++; i < samples.length; i = next++) {
      const s = samples[i];
      const [a, b] = [await once(s), await once(s)];
      r.n++;
      for (const x of [a, b]) if (x.verdict === "error") { r.errors++; r.firstError ??= x.error.slice(0, 200); }
      if (a.verdict === b.verdict && a.verdict !== "error") r.agreed++;
      else r.disagreements.push({ messageId: s.messageId, first: a.verdict, second: b.verdict });
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, samples.length) }, worker));
  r.rate = r.n ? r.agreed / r.n : 0;
  return r;
}
