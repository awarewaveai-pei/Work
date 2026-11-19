// U3.6 one-click: what counts as a usable answer from the two budgeted tasks. One rule for the route (receipt /
// cache) and the page (stop point). The shapes are the ones modules.ts asks for and modules.test.ts pins with
// fixtures (manual.script -> scenes[], result.score -> overall); "total" was never one of them, so every one-click
// run stopped at scoring (AwareWave live run 2026-11-19).
export type AutoRunTask = "script" | "score";

export function autoRunResultValid(task: AutoRunTask, parsed: unknown): boolean {
  const p = (parsed && typeof parsed === "object" ? parsed : null) as Record<string, unknown> | null;
  if (task === "script") return Array.isArray(p?.scenes) && p!.scenes.length > 0;
  return Number.isFinite(p?.overall);
}
