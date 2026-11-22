// Card SF-J: what the flow page shows. The closed catalog switch must be unpressable, the nine-step skeleton must render
// with no engine step bodies, and the regexes copied from gate-client.ts must stay the same expressions.
import { describe, expect, it } from "vitest";
import { SITE_DOMAIN_RE, SITE_SLUG_RE } from "../gate-client";
import { CLOSED_SWITCH_LABEL, DOMAIN_RE, FLOW_STEPS, SLUG_RE, hostSlugOf, keptKeysText, normalizeDomain, viewOf, type ApiStep } from "../page-model";

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

  it("with no step bodies every step renders as 尚未提供 with no button", () => {
    for (const d of FLOW_STEPS) {
      const v = viewOf(d, d.engineKey ? api({ key: d.engineKey, state: "not_available", enabled: false }) : null);
      expect(v.stateLabel).toBe("尚未提供");
      expect(v.action).toBeNull();
    }
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
