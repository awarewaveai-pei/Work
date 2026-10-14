import { describe, expect, it } from "vitest";
import { applyLazyLines, fieldsNamedIn, initialState, missingRequired, toPayload } from "./form-model";
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

describe("before sending, and after a refusal (2026-10-14 walk of 直接分析)", () => {
  const scores = { key: "scores", kind: "rows", label: "分數", required: true, item: { kind: "group", fields: [{ key: "value", kind: "number" }] } };
  const notes = { key: "sensitivity_notes", kind: "text", label: "敏感度說明", required: true };

  it("names a required field left out; an empty one is the builder's to judge (7 tools accept empty required lists)", () => {
    expect(missingRequired([scores, notes], { sensitivity_notes: "x" })).toEqual(["分數"]);
    expect(missingRequired([scores, notes], { scores: [], sensitivity_notes: "" })).toEqual([]);
    expect(missingRequired([{ key: "up", kind: "upstream", required: true }, { key: "p", kind: "provenance", required: true }], {})).toEqual([]);
    const tasks = { key: "tasks", kind: "rows", label: "任務", required: true, item: { kind: "group", fields: [{ key: "earliest_start", kind: "number", label: "最早開始", required: true }] } };
    expect(missingRequired([tasks], { tasks: [{}] })).toEqual([]);   // a required part inside a row may be computed (critical_path_method)
  });

  it("sends a blank nullable box as null, as the demo cases write it (人工簽核 went out as \"\" and was refused)", () => {
    const signoff = { key: "human_signoff", kind: "text", label: "人工簽核", required: true, nullable: true };
    expect(toPayload([signoff], initialState([signoff], { human_signoff: null }))).toEqual({ human_signoff: null });
    expect(toPayload([signoff], { human_signoff: "  " })).toEqual({ human_signoff: null });
    expect(toPayload([signoff], { human_signoff: "王經理" })).toEqual({ human_signoff: "王經理" });
  });

  it("names the boxes a refusal mentions by key, not a key inside another word", () => {
    const detail = "WDM_INVALID_SCORES: scores must be a non-empty list, got <list of 0 item(s)>";
    expect(fieldsNamedIn([scores, notes], detail)).toEqual(["分數"]);
    expect(fieldsNamedIn([{ key: "core", kind: "text", label: "核心" }], detail)).toEqual([]);
    expect(fieldsNamedIn([scores], { error: "METHOD_GATES_FAILED", detail })).toEqual(["分數"]);
    const profile = { key: "profile", kind: "group", label: "背景", fields: [{ key: "country", kind: "text", label: "國家" }] };
    expect(fieldsNamedIn([profile], "MADM_INVALID: country must be an ISO code")).toEqual(["背景・國家"]);
  });
});
