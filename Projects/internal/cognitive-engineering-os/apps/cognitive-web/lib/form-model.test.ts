import { describe, expect, it } from "vitest";
import { applyLazyLines, initialState, toPayload } from "./form-model";
import iceberg from "../fixtures/payload-systems.iceberg_model.json";
import eisenhower from "../fixtures/payload-decision.eisenhower_matrix.json";
import decisionTree from "../fixtures/payload-decision.decision_tree.json";

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
  it("serializes the selected variant branch and drops the other branch", () => {
    const variantFields = [{ key: "node", kind: "variant", discriminator: "node_type", required: true, options: [
      { value: "decision", fields: [{ key: "question", kind: "text", required: true }] },
      { value: "leaf", fields: [{ key: "outcome", kind: "text", required: true }] },
    ] }];
    expect(toPayload(variantFields, { node: { node_type: "leaf", question: "old", outcome: "ship" } })).toEqual({ node: { node_type: "leaf", outcome: "ship" } });
  });
  it("serializes fixed rows, provenance and conditions like dashboard", () => {
    const fields = [{ key: "rows", kind: "fixed_rows", required: true, row_key: "step", min_rows: 1, rows: [
      { value: "PLAN", fields: [{ key: "text", kind: "text", required: true }] },
      { value: "DO", fields: [{ key: "text", kind: "text" }] },
    ] }, { key: "judgment", kind: "group", required: true, conditions: { answer: [{ mode: "forbidden", key: "status", equals: "UNKNOWN" }] }, fields: [
      { key: "status", kind: "choice", required: true }, { key: "answer", kind: "text" }, { key: "provenance", kind: "provenance", required: true },
    ] }];
    expect(toPayload(fields, { rows: [{ step: "PLAN", text: "plan" }], judgment: { status: "UNKNOWN", answer: "should vanish" } })).toEqual({ rows: [{ step: "PLAN", text: "plan" }], judgment: { status: "UNKNOWN", provenance: { epistemic_type: "HUMAN_OPINION", authorship_state: "HUMAN_ORIGINAL", locked: null } } });
  });
  it("matches the three dashboard payload fixtures", () => {
    const icebergFields = ["events", "patterns", "structures", "mental_models"].map((key) => ({ key, kind: "list", required: true }));
    expect(toPayload(icebergFields, iceberg)).toEqual(iceberg);
    const scale = [{ key: "min", kind: "number", required: true }, { key: "max", kind: "number", required: true }];
    const task = [{ key: "id", kind: "text", required: true }, { key: "label", kind: "text", required: true }, { key: "urgency", kind: "number", required: true }, { key: "importance", kind: "number", required: true }];
    const matrixFields = [{ key: "subject", kind: "text", required: true }, { key: "tasks", kind: "rows", item: { kind: "group", fields: task }, required: true }, { key: "urgency_scale", kind: "group", fields: scale, required: true }, { key: "importance_scale", kind: "group", fields: scale, required: true }, { key: "urgency_threshold", kind: "number", required: true }, { key: "importance_threshold", kind: "number", required: true }];
    expect(toPayload(matrixFields, eisenhower)).toEqual(eisenhower);
    const child = { key: "child", kind: "recursive", target: "node", required: true };
    const branch = { key: "branches", kind: "rows", required: true, item: { kind: "group", fields: [{ key: "label", kind: "text", required: true }, child] } };
    const node = { key: "root", kind: "variant", def_id: "node", discriminator: "node_type", required: true, options: [{ value: "decision", fields: [{ key: "label", kind: "text", required: true }, branch] }, { value: "terminal", fields: [{ key: "label", kind: "text", required: true }, { key: "payoff", kind: "number", required: true }] }] };
    expect(toPayload([{ key: "decision_context", kind: "text", required: true }, node], decisionTree)).toEqual(decisionTree);
  });
});
