import { describe, expect, it, vi } from "vitest";
import { formatDigest, planAlerts, runScheduleAlerts, type AlertDeps, type OpenEpisode } from "../alerts";
import type { SystemRow } from "../types";

const row = (key: string, state: SystemRow["state"], detail = ""): SystemRow => ({
  key, label: `L-${key}`, description: "", cadence: "", lastAt: null, state, detail,
  details: { what: "", when: "", where: "", look: "", lookHref: "", fail: "" },
});
const ep = (key: string): OpenEpisode => ({ id: `id-${key}`, key, title: `L-${key}` });

function deps(rows: SystemRow[], open: OpenEpisode[], delivered = true, known: string[] = []) {
  const calls: string[] = [];
  const d: AlertDeps = {
    rows: async () => rows,
    openEpisodes: async () => open,
    knownKeys: async () => new Set(known),
    send: vi.fn(async () => {
      calls.push("send");
      return { delivered, complete: delivered, channels: { telegram: delivered ? "sent" : "uncertain:x" } };
    }),
    openEpisode: vi.fn(async (r: SystemRow, reopen: boolean) => (calls.push(`open:${r.key}:${reopen}`), null)),
    resolveEpisode: vi.fn(async (id: string) => (calls.push(`resolve:${id}`), null)),
    pageUrl: "https://x/ops/schedules",
  };
  return { d, calls };
}

describe("planAlerts", () => {
  it("alerts a row that turned red, once", () => {
    const rows = [row("a", "failed"), row("b", "stale"), row("c", "ok")];
    expect(planAlerts(rows, []).red.map((r) => r.key)).toEqual(["a", "b"]);
    expect(planAlerts(rows, [ep("a"), ep("b")]).red).toEqual([]); // still red: no repeat
  });

  it("a stale laptop row is shown but never pushed", () => {
    const laptop: SystemRow = { ...row("laptop_status_reports", "stale"), group: "laptop" };
    expect(planAlerts([laptop, row("a", "failed")], []).red.map((r) => r.key)).toEqual(["a"]);
  });

  it("the daily line does not count a stale laptop row as needing attention", () => {
    const laptop: SystemRow = { ...row("laptop_status_reports", "stale"), group: "laptop" };
    const text = formatDigest([laptop, row("a", "ok")], "u");
    expect(text).toContain("全部正常");
    expect(text).toContain("筆電與雲端有 1 項過時");
  });

  it("recovers only a listed, settled row; missing, unregistered or gone keeps its episode", () => {
    const p = planAlerts([row("a", "ok"), row("t", "untracked"), row("m", "missing"), row("u", "unregistered")], [ep("a"), ep("t"), ep("m"), ep("u"), ep("gone")]);
    expect(p.recovered.map((o) => o.key)).toEqual(["a", "t"]);
    expect(p.red).toEqual([]); // missing / unregistered jobs are not alerted
  });

  it("the reporter down: alert it alone, keep every other episode as it is", () => {
    const rows = [row("host_schedules_report", "stale"), row("a", "stale"), row("b", "stale")];
    expect(planAlerts(rows, [ep("c")])).toEqual({ red: [rows[0]], recovered: [] });
    expect(planAlerts(rows, [ep("host_schedules_report")])).toEqual({ red: [], recovered: [] });
    const unreadable = [row("host_schedules", "missing"), row("backup_coverage", "ok")];
    expect(planAlerts(unreadable, [ep("x")])).toEqual({ red: [unreadable[0]], recovered: [] });
  });
});

describe("runScheduleAlerts", () => {
  it("nothing changed: nothing sent", async () => {
    const { d, calls } = deps([row("a", "ok")], []);
    expect(await runScheduleAlerts(d)).toMatchObject({ ok: true, red: 0, recovered: 0 });
    expect(calls).toEqual([]);
  });

  it("a partial delivery is still ok for this job (the digest reports channels), and is recorded", async () => {
    const { d, calls } = deps([row("a", "failed")], []);
    d.send = vi.fn(async () => (calls.push("send"), { delivered: true, complete: false, channels: { telegram: "sent", slack: "failed:x" } }));
    expect(await runScheduleAlerts(d)).toMatchObject({ ok: true, red: 1 });
    expect(calls).toEqual(["send", "open:a:false"]);
  });

  it("sends before recording; a failed send records nothing, so the next run retries", async () => {
    const { d, calls } = deps([row("a", "failed")], [], false);
    expect(await runScheduleAlerts(d)).toMatchObject({ ok: false, red: 1 });
    expect(calls).toEqual(["send"]);
  });

  it("records red as open (reopen when the key had an episode before) and resolves recovered", async () => {
    const { d, calls } = deps([row("a", "failed"), row("b", "ok")], [ep("b")], true, ["a", "b"]);
    expect(await runScheduleAlerts(d)).toMatchObject({ ok: true, red: 1, recovered: 1 });
    expect(calls).toEqual(["send", "open:a:true", "resolve:id-b"]);
  });

  it("one message lists every change", async () => {
    const { d } = deps([row("a", "failed", "執行結束但失敗，結束代碼為 1。"), row("b", "stale"), row("c", "ok")], [ep("c")]);
    await runScheduleAlerts(d);
    const text = (d.send as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
    expect(text).toContain("排程異常（2）");
    expect(text).toContain("L-a：執行失敗");
    expect(text).toContain("排程恢復（1）");
    expect(text).toContain("https://x/ops/schedules");
  });
});

describe("formatDigest", () => {
  it("all fine vs needs attention (untracked is by design, not a fault)", () => {
    expect(formatDigest([row("a", "ok"), row("u", "untracked")], "u")).toContain("2 個排程全部正常");
    const t = formatDigest([row("a", "ok"), row("b", "missing")], "u");
    expect(t).toContain("1 個需要注意");
    expect(t).toContain("L-b：尚無資料"); // same words as the page
  });
});
