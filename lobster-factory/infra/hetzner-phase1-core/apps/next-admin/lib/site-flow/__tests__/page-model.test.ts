// Card SF-J: what the flow page shows. The closed catalog switch must be unpressable, the nine-step skeleton must render
// with no engine step bodies, and the regexes copied from gate-client.ts must stay the same expressions.
import { describe, expect, it } from "vitest";
import { SITE_DOMAIN_RE, SITE_SLUG_RE } from "../gate-client";
import { BUSY_LABEL, CLOSED_SWITCH_LABEL, DOMAIN_RE, tickText, FLOW_STEPS, SLUG_RE, hostSlugOf, keptKeysText, normalizeDomain, viewOf, type ApiStep } from "../page-model";

const api = (over: Partial<ApiStep>): ApiStep => ({ key: "create", title: "t", enabled: true, state: "ready", reason: null, observation: null, lastRun: null, ...over });
const def = (key: string) => FLOW_STEPS.find((d) => d.engineKey === key)!;

describe("page-model", () => {
  it("copies the gate's slug and domain expressions", () => {
    expect(SLUG_RE.source).toBe(SITE_SLUG_RE.source);
    expect(DOMAIN_RE.source).toBe(SITE_DOMAIN_RE.source);
  });

  it("nine steps, numbered 1..9, each with a sentence", () => {
    expect(FLOW_STEPS.map((s) => s.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(FLOW_STEPS.every((s) => s.what.length > 5)).toBe(true);
  });

  it("an engine step without a body renders as 尚未提供 with no button; steps 4 and 8 never do", () => {
    for (const d of FLOW_STEPS.filter((x) => x.engineKey)) {
      const v = viewOf(d, api({ key: d.engineKey!, state: "not_available", enabled: false }));
      expect(v.stateLabel).toBe("尚未提供");
      expect(v.action).toBeNull();
    }
    const panels = { backup: { state: "listed", detail: "已列入每日備份", lastBackupAt: null }, manual_checks: [{ key: "uptime_monitor", label: "監控", where: "Uptime Kuma", tick: null }] };
    for (const d of FLOW_STEPS.filter((x) => x.panel)) expect(viewOf(d, null, { panels }).stateLabel).not.toBe("尚未提供");
  });

  // SF-H item 8
  it("while loading or after a failed read no step says 尚未提供", () => {
    for (const d of FLOW_STEPS) {
      expect(viewOf(d, null, { load: "loading" }).stateLabel).toBe("讀取中");
      expect(viewOf(d, null, { load: "failed" }).stateLabel).toBe("讀取失敗");
    }
  });

  it("while another step runs, every other step's button is disabled; the running one can still be followed", () => {
    expect(viewOf(def("create"), api({ state: "ready" }), { anyRunning: true }).action).toMatchObject({ kind: "plan", label: BUSY_LABEL, disabled: true });
    expect(viewOf(def("create"), api({ state: "running", lastRun: { id: "r", status: "running", started_at: "x", ended_at: null, error_summary: null } }), { anyRunning: true }).action).toMatchObject({ kind: "poll", disabled: false });
  });

  it("step 4 shows listed / not listed and the backup time when known; step 8 counts ticks and says who and when", () => {
    const backup = (b: { state: string; detail: string; lastBackupAt: string | null }) => viewOf(FLOW_STEPS[3], null, { panels: { backup: b } });
    expect(backup({ state: "listed", detail: "已列入每日備份", lastBackupAt: null })).toMatchObject({ stateLabel: "已列入", reason: expect.stringContaining("主機目前不回報") });
    expect(backup({ state: "listed", detail: "已列入", lastBackupAt: "2026-11-22T19:00:00Z" }).reason).toContain("最近一次備份：2026/11/23");
    expect(backup({ state: "absent", detail: "還沒列入", lastBackupAt: null }).stateLabel).toBe("未列入");
    const tick = { key: "uptime_monitor", by: "ops@aware-wave.com", at: "2026-11-22T02:00:00Z", note: "acme" };
    const manual = viewOf(FLOW_STEPS[7], null, { panels: { manual_checks: [{ key: "uptime_monitor", label: "a", where: "w", tick }, { key: "mail_setup", label: "b", where: "w", tick: null }] } });
    expect(manual.stateLabel).toBe("1 / 2 已確認");
    expect(tickText(tick)).toMatch(/^ops@aware-wave\.com 於 2026\/11\/22\s10:00:00：acme$/); // Taipei time; ICU may use a narrow space
  });

  it("a hand-confirmed step offers its tick instead of a preview", () => {
    expect(viewOf(def("vhost"), api({ key: "vhost", state: "ready", manual: { key: "gateway_routed", label: "工程師已設定" } })).action).toEqual({ kind: "tick", label: "工程師已設定", disabled: false });
  });

  it("a closed catalog switch shows 此步驟尚未開放 and the button is disabled", () => {
    const v = viewOf(def("create"), api({ state: "not_started", enabled: false, reason: CLOSED_SWITCH_LABEL }));
    expect(v.action).toEqual({ kind: "plan", label: CLOSED_SWITCH_LABEL, disabled: true });
    expect(viewOf(def("create"), api({ state: "failed", enabled: false })).action?.disabled).toBe(true);
  });

  it("ready = preview; failed = retry; running = progress; blocked and done = none (preflight can recheck)", () => {
    expect(viewOf(def("create"), api({ state: "ready" })).action).toMatchObject({ kind: "plan", disabled: false });
    expect(viewOf(def("create"), api({ state: "failed" })).action?.label).toMatch(/^重試/);
    expect(viewOf(def("create"), api({ state: "running", lastRun: { id: "r", status: "running", started_at: "x", ended_at: null, error_summary: null } })).action?.kind).toBe("poll");
    expect(viewOf(def("create"), api({ state: "blocked", enabled: false })).action).toBeNull();
    expect(viewOf(def("create"), api({ state: "done" })).action).toBeNull();
    expect(viewOf(def("preflight"), api({ key: "preflight", state: "done" })).action).toMatchObject({ kind: "refresh", label: "重新檢查" });
  });

  it("domain and host code", () => {
    expect(normalizeDomain(" https://Oracle.Aware-Wave.com/x ")).toBe("oracle.aware-wave.com");
    expect(normalizeDomain("not a domain")).toBeNull();
    expect(hostSlugOf("oracle.aware-wave.com")).toBe("oracle-aware-wave-com");
    expect(hostSlugOf("a".repeat(30) + "." + "b".repeat(30) + ".com")!.length).toBeLessThanOrEqual(40);
  });

  it("kept keys become one sentence; none = no sentence", () => {
    expect(keptKeysText(["client_config.site_url"])).toBe("這些值沒有套用，因為客戶已經有設定：client_config.site_url");
    expect(keptKeysText([])).toBeNull();
  });
});
