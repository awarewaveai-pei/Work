// Collect / sink registries.
//
// Deliberately SEPARATE from lib/content/blocks/registry.ts (ADR 011 §決策 5, plan §4-#1): that
// registry's `run` takes one argument and its ContentBlock has no `match`, so collect and sink do
// not fit. Widening it would change an interface eight already-live block kinds share, to serve two
// new ones. Same contract shape, two registries — the same honest split that file already documents
// between its front-end and back-end mirrors.
//
// Adding a collector is: one new file that calls registerCollector() once. The orchestrator never
// changes. (What that promises is "adding a SOURCE needs no routing change" — not "the orchestrator
// is finished forever"; ADR 011 §決策 5 says so out loud.)

import type { CollectBlock, SinkBlock } from "@/lib/collect/types";

const COLLECTORS: CollectBlock[] = [];
const SINKS: SinkBlock[] = [];

/** Register (or replace, so dev hot-reload does not stack duplicates) a collector. */
export function registerCollector(block: CollectBlock): void {
  const i = COLLECTORS.findIndex((b) => b.id === block.id);
  if (i >= 0) COLLECTORS[i] = block;
  else COLLECTORS.push(block);
}

export function registerSink(block: SinkBlock): void {
  const i = SINKS.findIndex((b) => b.id === block.id);
  if (i >= 0) SINKS[i] = block;
  else SINKS.push(block);
}

export function collectors(): CollectBlock[] {
  return COLLECTORS.filter((b) => b.enabled !== false);
}

export function sinks(): SinkBlock[] {
  return SINKS.filter((b) => b.enabled !== false);
}

export function collectorById(id: string): CollectBlock | undefined {
  return COLLECTORS.find((b) => b.id === id && b.enabled !== false);
}

export function sinkById(id: string): SinkBlock | undefined {
  return SINKS.find((b) => b.id === id && b.enabled !== false);
}

/** Test-only: registries are module state, and a leaked registration makes the next test lie. */
export function resetRegistriesForTest(): void {
  COLLECTORS.length = 0;
  SINKS.length = 0;
}
