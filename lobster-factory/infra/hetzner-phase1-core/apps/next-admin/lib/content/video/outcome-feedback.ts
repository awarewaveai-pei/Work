/**
 * Vendor-neutral outcome feedback model.  It ranks immutable outcome
 * snapshots; fetching those snapshots remains an adapter concern.
 */
export interface OutcomeSnapshotForRanking {
  readonly releaseId: string;
  readonly maturity: "24h" | "7d" | "30d";
  readonly metrics: Readonly<Record<string, unknown>>;
}

export interface OutcomeRanking {
  readonly releaseId: string;
  readonly score: number;
  readonly confidence: "low" | "medium" | "high";
  readonly snapshots: number;
}

function number(metrics: Readonly<Record<string, unknown>>, key: string): number {
  const value = metrics[key];
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : 0;
}

function ratio(metrics: Readonly<Record<string, unknown>>, numerator: number, denominator: number): number {
  return denominator > 0 ? Math.min(1, numerator / denominator) : 0;
}

function snapshotScore(snapshot: OutcomeSnapshotForRanking): number {
  const m = snapshot.metrics;
  const impressions = Math.max(number(m, "impressions"), number(m, "reach"));
  const engagement = number(m, "likes") + number(m, "comments") + number(m, "shares") + number(m, "saves");
  const clicks = number(m, "clicks");
  const completion = number(m, "completion_rate") / 100;
  const maturityWeight = snapshot.maturity === "30d" ? 1 : snapshot.maturity === "7d" ? 0.85 : 0.65;
  // All terms are bounded to [0, 1] so a large account cannot win only by
  // audience size. Missing metrics contribute zero rather than being guessed.
  return Math.round((0.5 * Math.min(1, completion) + 0.3 * ratio(m, engagement, impressions) + 0.2 * ratio(m, clicks, impressions)) * maturityWeight * 10_000) / 10_000;
}

/** Return a stable, descending ranking for dashboard and recommendation jobs. */
export function rankOutcomeSnapshots(snapshots: readonly OutcomeSnapshotForRanking[]): OutcomeRanking[] {
  const groups = new Map<string, OutcomeRanking>();
  for (const snapshot of snapshots) {
    const previous = groups.get(snapshot.releaseId);
    const score = snapshotScore(snapshot);
    const snapshotsCount = (previous?.snapshots ?? 0) + 1;
    const mean = previous ? (previous.score * previous.snapshots + score) / snapshotsCount : score;
    const confidence: OutcomeRanking["confidence"] = snapshotsCount >= 3 ? "high" : snapshotsCount === 2 ? "medium" : "low";
    groups.set(snapshot.releaseId, { releaseId: snapshot.releaseId, score: Math.round(mean * 10_000) / 10_000, confidence, snapshots: snapshotsCount });
  }
  return [...groups.values()].sort((a, b) => b.score - a.score || b.snapshots - a.snapshots || a.releaseId.localeCompare(b.releaseId));
}

