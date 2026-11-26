// R2-C: applying an asynchronous contrast check to the design. Pure (node-testable): the page passes its state access.
// Invariant: a check's result is applied only to a design whose inputs are still the ones it measured, and only by the
// newest run of its lane; a run whose inputs changed meanwhile is dropped and checked again on the current design. A
// check that fails applies nothing (the design it was for is not put on unchecked).
import type { State } from "./banner-state";

/** Fields that do not change what is drawn (flags, the copy list). Everything else is an input of the check. */
const NOT_DRAWN = new Set<keyof State>(["saving", "saved", "error", "generating", "designing", "productRemoving", "copyGenerating", "copyStream", "copyVariants"]);
/** Same drawing inputs: strings (pictures included, as data URLs) compared whole -- the same reference is the same
 *  picture, two different ones compare by content, so two pictures of equal length still differ; other values by JSON. */
export function sameDrawInputs(a: State, b: State): boolean {
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)]) as Set<keyof State>) {
    if (NOT_DRAWN.has(k)) continue;
    const x = a[k], y = b[k];
    if (x === y) continue;
    if (typeof x !== "object" || typeof y !== "object" || x === null || y === null || JSON.stringify(x) !== JSON.stringify(y)) return false;
  }
  return true;
}

export interface GuardLane<S, P> {
  /** `build(prev)` = the design to check / apply on top of `prev`; `check` measures it; `merge` puts the result on the
   *  built design; `fail` = what the page shows when the check could not run (the built design is NOT applied).
   *  Resolves when this run is applied, failed, superseded, or redone (the redo runs on its own). */
  run(build: (prev: S) => S, check: (st: S) => Promise<P>, merge: (built: S, result: P) => S, fail: (prev: S, err: unknown) => S): Promise<void>;
}

export function guardLane<S, P>(deps: {
  /** Same inputs = the same measurement (the page: sameDrawInputs). */
  same(a: S, b: S): boolean;
  /** The latest state the page has rendered. */
  current(): S;
  /** The page's state update (React setState with an updater). */
  apply(fn: (prev: S) => S): void;
}): GuardLane<S, P> {
  let latest = 0;
  async function attempt(token: number, build: (prev: S) => S, check: (st: S) => Promise<P>, merge: (built: S, result: P) => S, fail: (prev: S, err: unknown) => S): Promise<void> {
    const input = build(deps.current());
    const got = await check(input).then((result) => ({ result }), (err: unknown) => ({ err }));
    if (token !== latest) return;
    let redo = false; // React may call an updater twice: one redo per attempt
    deps.apply((prev) => {
      if (token !== latest) return prev;
      const built = build(prev);
      if (!deps.same(built, input)) {
        if (!redo) { redo = true; queueMicrotask(() => void attempt(token, build, check, merge, fail)); }
        return prev;
      }
      return "result" in got ? merge(built, got.result) : fail(prev, got.err);
    });
  }
  return { run: (build, check, merge, fail) => attempt(++latest, build, check, merge, fail) };
}
