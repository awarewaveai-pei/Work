/**
 * B26 part 2: 「從這裡繼續」 on a run whose cut was made from shot pictures swapped since (workbench EpisodeSpine.cutOutdated)
 * tells the main system the video will be rendered AGAIN (PATCH /api/video/projects autoRun {action:"resume", rerender:true}).
 * The route records brief_json.autoRerender = {runId, at}; from then on auto-advance counts only renders and finished
 * videos created at/after `at` for that run (project-advance-deps renderState/rows). Until the new cut lands the project
 * is `waiting`, so the old cut is never reviewed, approved or put in a draft.
 * The mark belongs to one run: another runId (a new run) ignores it.
 */
export interface RerenderMark { runId: string; at: string }

/** ISO time of the run's resume-with-rerender, or null (no mark, another run's mark, unreadable time). */
export function rerenderSince(brief: unknown, runId: string | undefined): string | null {
  const m = (brief as { autoRerender?: Partial<RerenderMark> } | null | undefined)?.autoRerender;
  return runId && m && m.runId === runId && typeof m.at === "string" && Number.isFinite(Date.parse(m.at)) ? m.at : null;
}

/** Keeps only the rows created at/after `since`; no mark = all rows. A row without a readable created_at never counts as new. */
export function createdSince<T extends { created_at?: string | null }>(rows: readonly T[], since: string | null): T[] {
  if (!since) return [...rows];
  const from = Date.parse(since);
  return rows.filter((r) => Date.parse(String(r.created_at)) >= from);
}
