import { describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cronCadence } from "../cron-cadence";
import { HOST_JOBS } from "../host-jobs";
import { hostScheduleRows, hostScheduleRowsFrom, type HostSchedulesDoc } from "../adapters/host-schedules";

const NOW = Date.parse("2026-10-24T12:00:00Z");
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const H = 3_600_000;

describe("cronCadence (UTC cron -> Taipei text)", () => {
  it.each([
    ["0 10,22 * * *", "每天 06:00、18:00", 12 * H],
    ["0 19 * * *", "每天 03:00", 24 * H],
    ["30 3 * * 0", "每週日 11:30", 7 * 24 * H],
    ["0 20 * * 0", "每週一 04:00", 7 * 24 * H],
    ["15 4 1 * *", "每月 1 日 12:15", 31 * 24 * H],
    ["15 20 1 * *", "每月 2 日 04:15", 31 * 24 * H],
    ["*/10 * * * *", "每 10 分鐘", 10 * 60_000],
    ["* * * * *", "每分鐘", 60_000],
    ["@every 60s", "每 1 分鐘", 60_000],
    ["@daily", "每天", 24 * H],
  ])("%s", (expr, text, interval) => {
    expect(cronCadence(expr)).toEqual({ text, intervalMs: interval });
  });

  it("an unparsed shape shows raw and claims no interval", () => {
    expect(cronCadence("24 0 1-7 * *")).toEqual({ text: "24 0 1-7 * *（UTC）", intervalMs: null });
  });
});

function doc(entries: HostSchedulesDoc["entries"], extra: Partial<HostSchedulesDoc> = {}): HostSchedulesDoc {
  // Every registered job present and ok, so a test only sees the rows it is about.
  const ok = Object.keys(HOST_JOBS)
    .filter((k) => !entries.some((e) => e.key === k))
    .map((k) => ({ source: "/etc/cron.d/x", schedule: "* * * * *", key: k, records_result: true, log: null,
      last: { started_at: iso(1000), finished_at: iso(1000), exit_code: 0 } }));
  return { generated_at: iso(60_000), entries: [...entries, ...ok], cron_files_drift: [], ...extra };
}
const row = (rows: ReturnType<typeof hostScheduleRowsFrom>, key: string) => rows.find((r) => r.key === key);
const ent = (key: string | null, last: HostSchedulesDoc["entries"][0]["last"], over: object = {}) =>
  ({ source: "/etc/cron.d/awarewave-schedules", schedule: "0 10,22 * * *", key, records_result: true, log: "/var/log/v.log", last, ...over });

describe("hostScheduleRowsFrom", () => {
  it("a run that exited non-zero is failed, with its exit code", () => {
    const r = row(hostScheduleRowsFrom(doc([ent("reconcile_videos", { started_at: iso(H), finished_at: iso(H), exit_code: 1 })]), NOW), "reconcile_videos");
    expect(r).toMatchObject({ state: "failed", label: HOST_JOBS.reconcile_videos.label, cadence: "每天 06:00、18:00" });
    expect(r?.detail).toContain("1");
  });

  it("a run older than its interval allows is stale, a recent one ok", () => {
    const late = row(hostScheduleRowsFrom(doc([ent("reconcile_videos", { started_at: iso(20 * H), finished_at: iso(20 * H), exit_code: 0 })]), NOW), "reconcile_videos");
    const fresh = row(hostScheduleRowsFrom(doc([ent("reconcile_videos", { started_at: iso(2 * H), finished_at: iso(2 * H), exit_code: 0 })]), NOW), "reconcile_videos");
    expect([late?.state, fresh?.state]).toEqual(["stale", "ok"]);
  });

  it("a host line no one registered is shown, never dropped", () => {
    const rows = hostScheduleRowsFrom(doc([ent(null, null, { records_result: false, command: "/root/new-job.sh" })]), NOW);
    const r = rows.find((x) => x.state === "unregistered");
    expect(r?.description).toContain("/root/new-job.sh");
    expect(rows[0]).toBe(r); // problems are listed before the groups
  });

  it("a registered job missing on the host is shown as missing", () => {
    const d = doc([]);
    d.entries = d.entries.filter((e) => e.key !== "lobster_backup");
    expect(row(hostScheduleRowsFrom(d, NOW), "lobster_backup")?.state).toBe("missing");
  });

  it("an old inventory marks every row stale instead of trusting its ok", () => {
    const rows = hostScheduleRowsFrom(doc([], { generated_at: iso(2 * H) }), NOW);
    expect(rows.every((r) => r.state === "stale")).toBe(true);
  });

  it("a success record with an unreadable time is not ok", () => {
    const r = row(hostScheduleRowsFrom(doc([ent("reconcile_videos", { started_at: "x", finished_at: "not-a-time", exit_code: 0 })]), NOW), "reconcile_videos");
    expect(r?.state).toBe("missing");
  });

  it("a partial inventory does not claim a job is gone from the host", () => {
    const d = doc([], { errors: ["systemctl list-timers: failed"] });
    d.entries = d.entries.filter((e) => e.key !== "awarewave_endpoint_alert");
    const rows = hostScheduleRowsFrom(d, NOW);
    expect(row(rows, "host_inventory_errors")?.state).toBe("failed");
    expect(row(rows, "awarewave_endpoint_alert")?.state).toBe("stale");
  });

  it("a stopped systemd timer is never ok, whatever its last result", () => {
    const r = row(hostScheduleRowsFrom(doc([ent("awarewave_endpoint_alert", { started_at: iso(1000), finished_at: iso(1000), exit_code: 0 }, { schedule: "@inactive" })]), NOW), "awarewave_endpoint_alert");
    expect(r?.state).toBe("stale");
  });

  it("an old inventory keeps a known failure red", () => {
    const rows = hostScheduleRowsFrom(doc([ent("reconcile_videos", { started_at: iso(H), finished_at: iso(H), exit_code: 1 })], { generated_at: iso(2 * H) }), NOW);
    expect(row(rows, "reconcile_videos")?.state).toBe("failed");
  });

  it("a job whose exit code cannot fail says so when ok", () => {
    const r = row(hostScheduleRowsFrom(doc([]), NOW), "n8n_oom_restart");
    expect(r?.state).toBe("ok");
    expect(r?.detail).not.toBe("");
  });

  it("cron file drift is its own failed row", () => {
    const rows = hostScheduleRowsFrom(doc([], { cron_files_drift: ["lobster-backup"] }), NOW);
    expect(row(rows, "host_cron_drift")).toMatchObject({ state: "failed" });
  });
});

describe("hostScheduleRows file read", () => {
  it("no file = one missing row, not an empty section", async () => {
    const rows = await hostScheduleRows(join(tmpdir(), "does-not-exist-host-schedules.json"), NOW);
    expect(rows).toHaveLength(1);
    expect(rows[0].state).toBe("missing");
  });

  it("reads the file the reporter writes", async () => {
    const p = join(mkdtempSync(join(tmpdir(), "hs-")), "host-schedules.json");
    writeFileSync(p, JSON.stringify(doc([])));
    const rows = await hostScheduleRows(p, NOW);
    expect(rows.length).toBe(Object.keys(HOST_JOBS).length);
    expect(rows.every((r) => r.state === "ok")).toBe(true);
  });
});
