import { describe, expect, it } from "vitest";
import { rankOutcomeSnapshots } from "../outcome-feedback";

describe("outcome feedback ranking", () => {
  it("ranks by bounded quality ratios instead of raw audience size", () => {
    const result = rankOutcomeSnapshots([
      { releaseId: "small", maturity: "30d", metrics: { impressions: 100, likes: 20, completion_rate: 80 } },
      { releaseId: "large", maturity: "30d", metrics: { impressions: 100000, likes: 100, completion_rate: 20 } },
    ]);
    expect(result[0].releaseId).toBe("small");
  });

  it("raises confidence only after repeated snapshots", () => {
    const one = rankOutcomeSnapshots([{ releaseId: "r", maturity: "24h", metrics: { completion_rate: 50 } }]);
    const three = rankOutcomeSnapshots([
      { releaseId: "r", maturity: "24h", metrics: { completion_rate: 50 } },
      { releaseId: "r", maturity: "7d", metrics: { completion_rate: 50 } },
      { releaseId: "r", maturity: "30d", metrics: { completion_rate: 50 } },
    ]);
    expect(one[0].confidence).toBe("low");
    expect(three[0].confidence).toBe("high");
  });
});

