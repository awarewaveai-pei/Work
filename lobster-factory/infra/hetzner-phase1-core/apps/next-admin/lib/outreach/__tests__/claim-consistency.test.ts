// C16.2: two runs per email; the same verdict twice agrees, an error on either run never does.
import { describe, expect, it } from "vitest";
import type { ClaimCheck } from "../review-policy";
import { measureConsistency } from "../claim-consistency";

const seq = (...v: ClaimCheck[]) => { let i = 0; return async () => v[i++]; };
const direct = <T,>(_org: string, fn: () => Promise<T>) => fn();

describe("measureConsistency", () => {
  it("counts the same verdict twice as agreed, a different one or any error as a disagreement", async () => {
    const r = await measureConsistency([
      { messageId: "a", organizationId: "o", run: seq({ verdict: "supported" }, { verdict: "supported" }) },
      { messageId: "b", organizationId: "o", run: seq({ verdict: "supported" }, { verdict: "unsupported", claims: ["x"] }) },
      { messageId: "c", organizationId: "o", run: seq({ verdict: "error", error: "x" }, { verdict: "error", error: "x" }) },
      { messageId: "d", organizationId: "o", run: async () => { throw new Error("down"); } },
    ], direct);
    expect(r).toMatchObject({ n: 4, agreed: 1, rate: 0.25, errors: 4 });
    expect(r.disagreements.map((d) => d.messageId).sort()).toEqual(["b", "c", "d"]);
  });
  it("no samples is an empty report, not a pass", async () => {
    expect(await measureConsistency([], direct)).toMatchObject({ n: 0, rate: 0 });
  });
});
