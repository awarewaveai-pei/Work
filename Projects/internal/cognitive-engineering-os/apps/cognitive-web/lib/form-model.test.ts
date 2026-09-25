import { describe, expect, it } from "vitest";
import { applyLazyLines, initialState, toPayload } from "./form-model";

const fields = [{ name: "event", required: true }, { name: "tags", kind: "list" }];

describe("form model", () => {
  it("creates payload without empty system fields", () => {
    const state = initialState(fields, { event: "release", tags: ["ops"] });
    expect(toPayload(fields, state)).toEqual({ event: "release", tags: ["ops"] });
  });
  it("parses lazy field lines and reports missing required values", () => {
    const result = applyLazyLines("event: deployment", fields, initialState(fields));
    expect(result.state.event).toBe("deployment");
    expect(result.missing).toEqual([]);
  });
});
