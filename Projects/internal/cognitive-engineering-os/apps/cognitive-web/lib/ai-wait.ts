// The AI turns this tab is waiting for (lib/blocks.ts ai()), for the one line that says so on every block page
// (components/blocks/AiWaiting.tsx): a page shows its own busy button, never its own timer.
import { useEffect, useState } from "react";

// ``where``: the case (null = your own page) and block the answer is saved in. ``background``: the API answered 202 -- the
// turn runs on the server without the request (api/blocks/ai.py). ``joined``: a page asked for the same turn again and gets
// its answer itself. ``ended``: when it settled.
export type AiWhere = { projectId: string | null; block: string };
export type AiWait = AiWhere & { id: number; since: number; background: boolean; joined: boolean; ended?: number };

const KEEP_SETTLED = 20;   // a page that came back looks only for what settled after it mounted
let state: { waits: AiWait[]; settled: AiWait[] } = { waits: [], settled: [] };
let lastId = 0;
const running = new Map<string, { id: number; answer: Promise<unknown> }>();   // the same request asked twice: one turn, one bill
const listeners = new Set<(value: typeof state) => void>();
const publish = (next: typeof state) => {
  state = next;
  for (const listener of listeners) listener(state);
};
const update = (id: number, change: Partial<AiWait>) => publish({ ...state, waits: state.waits.map((wait) => (wait.id === id ? { ...wait, ...change } : wait)) });

/** Runs ``work`` as one wait for ``where``; ``key`` names the request: asked again while it runs, the running one is
 *  answered (a page that came back, or a second press). ``work`` calls ``toBackground()`` when the server took the turn. */
export function waitFor<T>(where: AiWhere, key: string, work: (toBackground: () => void) => Promise<T>): Promise<T> {
  const found = running.get(key);
  if (found) {
    update(found.id, { joined: true });
    return found.answer as Promise<T>;
  }
  const id = ++lastId;
  publish({ ...state, waits: [...state.waits, { ...where, id, since: Date.now(), background: false, joined: false }] });
  const answer = (async () => {
    try {
      return await work(() => update(id, { background: true }));
    } finally {
      running.delete(key);
      const done = state.waits.find((wait) => wait.id === id);
      publish({ waits: state.waits.filter((wait) => wait.id !== id), settled: done ? [...state.settled, { ...done, ended: Date.now() }].slice(-KEEP_SETTLED) : state.settled });
    }
  })();
  running.set(key, { id, answer });
  return answer;
}

export function useAiWaits(): typeof state {
  const [value, setValue] = useState(state);
  useEffect(() => {
    listeners.add(setValue);
    setValue(state);
    return () => { listeners.delete(setValue); };
  }, []);
  return value;
}
