// Plan U11 commit 1: the staff door's ScriptForge history moves to the video host; the handoff page takes it only from a staff host.
import { describe, expect, it } from "vitest";
import { HANDOFF_CHANNEL, acceptScriptHistory, mergeScriptHistory, storeScriptHistory } from "../script-history";

const opener = {};
const history = (items: unknown) => ({ channel: HANDOFF_CHANNEL, type: "history", items });
const staffHosts = ["app.aware-wave.com"];

describe("script history handoff", () => {
  it("a message whose origin is not a staff host is dropped", () => {
    const items = [{ id: 1, module: "hook" }];
    expect(acceptScriptHistory({ origin: "https://app.aware-wave.com", source: opener, data: history(items) }, { staffHosts, opener })).toEqual(items);
    expect(acceptScriptHistory({ origin: "https://evil.example", source: opener, data: history(items) }, { staffHosts, opener })).toBeNull();
    expect(acceptScriptHistory({ origin: "https://app.aware-wave.com.evil.example", source: opener, data: history(items) }, { staffHosts, opener })).toBeNull();
    expect(acceptScriptHistory({ origin: "null", source: opener, data: history(items) }, { staffHosts, opener })).toBeNull();
  });

  it("merges by id without overwriting this host's entries, newest first, at most 50; the source list is not changed", () => {
    const store = new Map<string, string>([["sf_history", JSON.stringify([{ id: 300, v: "video host" }, { id: 100, v: "video host" }])]]);
    const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
    const incoming = [{ id: 300, v: "staff" }, { id: 200, v: "staff" }];
    expect(storeScriptHistory(storage, incoming)).toBe(1);
    expect(JSON.parse(store.get("sf_history")!)).toEqual([{ id: 300, v: "video host" }, { id: 200, v: "staff" }, { id: 100, v: "video host" }]);
    expect(incoming).toEqual([{ id: 300, v: "staff" }, { id: 200, v: "staff" }]);
    expect(mergeScriptHistory([], Array.from({ length: 60 }, (_, i) => ({ id: i }))).length).toBe(50);
  });
});
