import { describe, expect, it } from "vitest";
import { lessonHref, lessonOf } from "./lessons";

describe("lessons", () => {
  it("a lesson is found by id and kind only", () => {
    expect(lessonHref("systems.iceberg_model", "tool")).toBe("/learn/systems.iceberg_model");
    expect(lessonHref("life-decision-v1", "workflow")).toBe("/learn/workflow/life-decision-v1");
    expect(lessonHref("systems.iceberg_model", "workflow")).toBeNull();
    expect(lessonHref("strategy.swot", "tool")).toBeNull();
    expect(lessonOf("life-decision-v1", "workflow")?.title).toBe("做一個決定（3 站）：開始前 3 分鐘");
  });
});
