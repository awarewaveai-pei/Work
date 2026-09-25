import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MethodForm } from "./MethodForm";

describe("MethodForm", () => {
  it("renders structured list, rows, fixed rows, group and variant controls", () => {
    const fields = [
      { key: "events", kind: "list", label: "事件" },
      { key: "tasks", kind: "rows", label: "任務", item: { kind: "group", fields: [{ key: "label", kind: "text", label: "名稱" }] } },
      { key: "stages", kind: "fixed_rows", label: "階段", rows: [{ value: "PLAN", label: "規劃", fields: [{ key: "text", kind: "text", label: "內容" }] }] },
      { key: "scale", kind: "group", label: "範圍", fields: [{ key: "min", kind: "number", label: "最小" }] },
      { key: "root", kind: "variant", label: "節點", discriminator: "node_type", options: [{ value: "leaf", label: "葉節點", fields: [{ key: "payoff", kind: "number", label: "收益" }] }] },
    ];
    const html = renderToStaticMarkup(<MethodForm fields={fields} state={{ events: ["a"], tasks: [{}], stages: [], scale: {}, root: {} }} onState={() => undefined} onSubmit={() => undefined} />);
    for (const text of ["＋ 新增一項", "＋ 新增一列", "規劃", "最小", "葉節點", "收益"]) expect(html).toContain(text);
    expect(html).not.toContain("原始 JSON");
  });
});
