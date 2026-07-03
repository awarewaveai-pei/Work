import { describe, expect, it } from "vitest";
import { NEIGHBOR_WINDOW_MS, neighborWindow, renderEvidenceText } from "../evidence";
import type { EvidenceBundle } from "../evidence";

describe("neighborWindow", () => {
  it("builds a ±15min ISO window around the timestamp", () => {
    const { from, to } = neighborWindow("2026-07-03T12:00:00.000Z");
    expect(from).toBe("2026-07-03T11:45:00.000Z");
    expect(to).toBe("2026-07-03T12:15:00.000Z");
    expect(NEIGHBOR_WINDOW_MS).toBe(15 * 60_000);
  });

  it("accepts a custom window", () => {
    const { from, to } = neighborWindow("2026-07-03T12:00:00.000Z", 60_000);
    expect(from).toBe("2026-07-03T11:59:00.000Z");
    expect(to).toBe("2026-07-03T12:01:00.000Z");
  });

  it("falls back to now for an unparsable timestamp instead of throwing", () => {
    const { from, to } = neighborWindow("not-a-date");
    expect(new Date(from).getTime()).toBeLessThan(new Date(to).getTime());
  });
});

describe("renderEvidenceText", () => {
  const bundle = (summary: string, ok = true): EvidenceBundle => ({
    collected_at: "2026-07-03T12:00:00.000Z",
    sections: [
      { key: "neighbors", title: "同時間窗告警（±15 分鐘）", ok, summary },
      { key: "recent_deploys", title: "最近部署（48 小時內）", ok: true, summary: "無" },
    ],
  });

  it("renders section titles with summaries", () => {
    const text = renderEvidenceText(bundle("- [netdata/high/open] CPU 飆高"));
    expect(text).toContain("【同時間窗告警（±15 分鐘）】");
    expect(text).toContain("CPU 飆高");
    expect(text).toContain("【最近部署（48 小時內）】");
  });

  it("marks failed sections instead of dropping them", () => {
    const text = renderEvidenceText(bundle("查詢失敗：boom", false));
    expect(text).toContain("（收集失敗）");
    expect(text).toContain("查詢失敗：boom");
  });

  it("caps the total bundle length", () => {
    const text = renderEvidenceText(bundle("x".repeat(20_000)));
    expect(text.length).toBeLessThanOrEqual(6_000 + 10);
    expect(text).toContain("（截斷）");
  });
});
