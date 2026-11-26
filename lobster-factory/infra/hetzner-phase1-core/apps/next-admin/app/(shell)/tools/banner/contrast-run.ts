// R2-C: applying an asynchronous contrast check to the design. Pure (node-testable): the page passes its state access.
// Invariant: a check's result is applied only to a design whose inputs are still the ones it measured, and only by the
// newest run of its lane; a run whose inputs changed meanwhile is dropped and checked again on the current design.

export interface GuardLane<S, P> {
  /** `build(prev)` = the design to check / apply on top of `prev`; `check` measures it (null = could not); `merge` puts
   *  the result on the built design. Resolves when this run is applied, superseded, or redone (the redo runs on its own). */
  run(build: (prev: S) => S, check: (st: S) => Promise<P | null>, merge: (built: S, result: P | null) => S): Promise<void>;
}

export function guardLane<S, P>(deps: {
  /** What the check depends on (same signature = same measurement). */
  sig(st: S): string;
  /** The latest state the page has rendered. */
  current(): S;
  /** The page's state update (React setState with an updater). */
  apply(fn: (prev: S) => S): void;
}): GuardLane<S, P> {
  let latest = 0;
  async function attempt(token: number, build: (prev: S) => S, check: (st: S) => Promise<P | null>, merge: (built: S, result: P | null) => S): Promise<void> {
    const input = build(deps.current());
    const want = deps.sig(input);
    const result = await check(input).catch(() => null);
    if (token !== latest) return;
    let redo = false; // React may call an updater twice: one redo per attempt
    deps.apply((prev) => {
      if (token !== latest) return prev;
      const built = build(prev);
      if (deps.sig(built) === want) return merge(built, result);
      if (!redo) { redo = true; queueMicrotask(() => void attempt(token, build, check, merge)); }
      return prev;
    });
  }
  return { run: (build, check, merge) => attempt(++latest, build, check, merge) };
}
