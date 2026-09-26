import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MethodForm } from "./MethodForm";
import { toPayload } from "../lib/form-model";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("MethodForm", () => {
  it("renders structured list, rows, fixed rows, group and variant controls", () => {
    const fields = [
      { key: "events", kind: "list", label: "事件" },
      { key: "weights", kind: "list", item_kind: "number", label: "權重" },
      { key: "tasks", kind: "rows", label: "任務", item: { kind: "group", fields: [{ key: "label", kind: "text", label: "名稱" }] } },
      { key: "stages", kind: "fixed_rows", label: "階段", rows: [{ value: "PLAN", label: "規劃", fields: [{ key: "text", kind: "text", label: "內容" }] }] },
      { key: "scale", kind: "group", label: "範圍", fields: [{ key: "min", kind: "number", label: "最小" }] },
      { key: "root", kind: "variant", label: "節點", discriminator: "node_type", options: [{ value: "leaf", label: "葉節點", fields: [{ key: "payoff", kind: "number", label: "收益" }] }] },
    ];
    const html = renderToStaticMarkup(<MethodForm fields={fields} state={{ events: ["a"], weights: [1], tasks: [{}], stages: [], scale: {}, root: {} }} onState={() => undefined} onSubmit={() => undefined} />);
    for (const text of ["＋ 新增一項", "＋ 新增一列", "規劃", "最小", "葉節點", "收益"]) expect(html).toContain(text);
    expect(html).not.toContain("原始 JSON");
  });

  it("the run form of the mock: a text list is one box (one item per line) with its hint and an example; three actions", () => {
    const fields = [{ key: "events", kind: "list", label: "① 事件：發生了什麼？", hint: "一件具體的事，有時間、有數字。" }];
    const html = renderToStaticMarkup(<MethodForm fields={fields} state={{ events: ["第一行", "第二行"] }} onState={() => undefined} onSubmit={() => undefined}
      example={{ events: ["第 6 次 session 只有 2 人主動分享"] }} onFill={() => undefined} onClear={() => undefined} label="冰山模型的格子" />);
    expect(html).toContain('<form class="runform" aria-label="冰山模型的格子">');
    expect(html).toContain('<label for="f-events">① 事件：發生了什麼？</label><p class="hint" id="f-events-hint">一件具體的事，有時間、有數字。</p>');
    expect(html).toContain('placeholder="例：第 6 次 session 只有 2 人主動分享"');
    expect(html).toContain(">第一行\n第二行</textarea>");
    for (const text of ['class="btn primary big">執行分析', 'class="btn">用示範案例填入', 'class="btn ghost">清空，填我自己的']) expect(html).toContain(text);
  });

  it("one analysis per click: a second submit while the first is in flight is ignored; busy disables the button", async () => {
    let release: () => void = () => undefined;
    const onSubmit = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<MethodForm fields={[{ key: "events", kind: "list", label: "事件" }]} state={{ events: ["x"] }} onState={() => undefined} onSubmit={onSubmit} />); });
    const form = host.querySelector("form")!;
    await act(async () => { form.requestSubmit(); form.requestSubmit(); });
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(host.querySelector("button[type=submit]")!.hasAttribute("disabled")).toBe(true);
    await act(async () => { release(); });
    expect(host.querySelector("button[type=submit]")!.textContent).toBe("執行分析");
    await act(async () => { root.render(<MethodForm fields={[]} state={{}} onState={() => undefined} onSubmit={onSubmit} busy />); });
    expect(host.querySelector("button[type=submit]")!.textContent).toBe("分析中…");
    await act(async () => { root.unmount(); }); host.remove();
  });

  it("a blank line in a text list is not an item", () => {
    expect(toPayload([{ key: "events", kind: "list", label: "事件" }], { events: ["  第一件 ", "", "   ", "第二件"] })).toEqual({ events: ["第一件", "第二件"] });
  });
});
