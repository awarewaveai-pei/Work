// Crawl state persistence (DATA_COLLECTION_PLAN.md §1.2, "續傳").
//
// Without this, a budget-limited crawl restarts from the seed every time: pages 1..N are fetched
// again on every run and page N+1 is NEVER reached. Every test passes, every log looks busy, and
// the crawl silently makes no progress — the failure mode this interface exists to make impossible.
//
// C0 ships the in-memory implementation. C2 adds the durable one (collection_runs); the
// orchestrator takes a RunStore and does not care which it got.

import type { RunState, RunStore } from "@/lib/collect/types";

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, RunState>();

  async load(runId: string): Promise<RunState | null> {
    const s = this.runs.get(runId);
    // Deep-ish copy: handing back the live object would let the orchestrator mutate "saved" state
    // and hide a bug where nothing is actually persisted.
    return s ? { frontier: s.frontier.map((t) => ({ ...t })), seen: [...s.seen] } : null;
  }

  async save(runId: string, state: RunState): Promise<void> {
    this.runs.set(runId, { frontier: state.frontier.map((t) => ({ ...t })), seen: [...state.seen] });
  }
}

/** A store that forgets everything — for one-shot crawls that must not resume. */
export const NO_RUN_STORE: RunStore = {
  async load() {
    return null;
  },
  async save() {
    /* intentionally nothing */
  },
};
