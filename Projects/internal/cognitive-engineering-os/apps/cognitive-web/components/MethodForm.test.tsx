import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MethodForm } from "./MethodForm";
import { toPayload } from "../lib/form-model";
import { ApiError, apiFetch } from "../lib/api";

vi.mock("../lib/api", async (original) => ({ ...(await original<typeof import("../lib/api")>()), apiFetch: vi.fn() }));

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

  it("marks a field the run page still needs with class need, on both a list and a plain field, until it is filled", () => {
    const fields = [{ key: "events", kind: "list", label: "事件" }, { key: "objective", kind: "text", label: "目標" }];
    const empty = renderToStaticMarkup(<MethodForm fields={fields} state={{ events: [], objective: "" }} onState={() => undefined} onSubmit={() => undefined} needs={["events", "objective"]} />);
    expect(empty).toContain('<div class="field need">');
    expect(empty).toContain('<label class="field need">');
    const filled = renderToStaticMarkup(<MethodForm fields={fields} state={{ events: ["x"], objective: "y" }} onState={() => undefined} onSubmit={() => undefined} needs={["events", "objective"]} />);
    expect(filled).not.toContain("need");
  });
});

describe("MethodForm upstream steps (2026-10-14 walk: 5 Whys <- 魚骨圖 <- 問題陳述 could never run)", () => {
  const statement = [{ key: "text", kind: "text", label: "陳述", required: true }];
  const fishbone = [{ key: "problem_statement", kind: "upstream", label: "問題陳述", method_id: "framing.problem_statement", required: true },
                    { key: "hypotheses", kind: "rows", label: "原因假設", required: true, item: { kind: "group", fields: [{ key: "statement", kind: "text" }] } }];
  const whys = [{ key: "cause_hypothesis_set", kind: "upstream", label: "原因假設集（魚骨圖結果）", method_id: "root_cause.fishbone", required: true },
                { key: "target", kind: "text", label: "要追問的原因假設", required: true }];
  async function submit(state: Record<string, unknown>, fields = whys) {
    const host = document.createElement("div"); document.body.appendChild(host);
    const root = createRoot(host);
    const onSubmit = vi.fn();
    await act(async () => { root.render(<MethodForm fields={fields} state={state} onState={() => undefined} onSubmit={onSubmit} />); });
    await act(async () => { host.querySelector<HTMLButtonElement>("button[type=submit]")!.click(); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
    const alert = host.querySelector("[role=alert]")?.textContent ?? "";
    await act(async () => { root.unmount(); }); host.remove();
    return { onSubmit, alert };
  }
  const calls = () => vi.mocked(apiFetch).mock.calls.map(([path, init]) => `${init?.method ?? "GET"} ${path}`);

  it("invokes every depth, the inner step first, each record passed up", async () => {
    vi.mocked(apiFetch).mockReset().mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/methods/root_cause.fishbone/form") return { form: { fields: fishbone } } as never;
      if (path === "/methods/framing.problem_statement/form") return { form: { fields: statement } } as never;
      if (path === "/methods/framing.problem_statement/invoke") return { record: { statement_id: "PS-1" } } as never;
      if (path === "/methods/root_cause.fishbone/invoke") { expect(JSON.parse(String(init!.body)).problem_statement).toEqual({ statement_id: "PS-1" }); return { record: { set: "CHS-1" } } as never; }
      throw new Error(`unexpected ${path}`);
    });
    const { onSubmit, alert } = await submit({ target: "H1", cause_hypothesis_set: { methodId: "root_cause.fishbone", data: { hypotheses: [{ statement: "慢" }],
      problem_statement: { methodId: "framing.problem_statement", data: { text: "結帳慢" } } } } });
    expect(alert).toBe("");
    expect(calls().filter((call) => call.startsWith("POST"))).toEqual(["POST /methods/framing.problem_statement/invoke", "POST /methods/root_cause.fishbone/invoke"]);
    expect(onSubmit).toHaveBeenCalledWith({ target: "H1", cause_hypothesis_set: { set: "CHS-1" } });
  });

  it("uses a demo case's finished upstream record as it is, invoking nothing", async () => {
    vi.mocked(apiFetch).mockReset();
    const record = { generated_by_method: "root_cause.fishbone", hypotheses: [{ id: "H1", statement: "結帳頁面載入過慢" }] };
    const { onSubmit } = await submit({ target: "H1", cause_hypothesis_set: record });
    expect(calls()).toEqual([]);
    expect(onSubmit).toHaveBeenCalledWith({ target: "H1", cause_hypothesis_set: record });
    vi.mocked(apiFetch).mockImplementation(async (path: string) => ({ form: { fields: path.includes("fishbone") ? fishbone : statement } }) as never);   // not ready: its form loads
    const other = await submit({ target: "H1", cause_hypothesis_set: { ...record, generated_by_method: "security.stride" } });   // another method's record
    expect(other.onSubmit).not.toHaveBeenCalled();
    expect(other.alert).toContain("需要先填上游方法");
  });

  it("names a required box left out, and a step the builder refused with the box it named", async () => {
    vi.mocked(apiFetch).mockReset();
    const left = await submit({ cause_hypothesis_set: { generated_by_method: "root_cause.fishbone" } });
    expect(left.alert).toBe("還沒填：要追問的原因假設");
    expect(left.onSubmit).not.toHaveBeenCalled();
    vi.mocked(apiFetch).mockReset().mockImplementation(async (path: string) => {
      if (path === "/methods/root_cause.fishbone/form") return { form: { fields: [fishbone[1]] } } as never;
      throw new ApiError(422, "FISHBONE_INVALID: hypotheses must name at least one cause");
    });
    const refused = await submit({ target: "H1", cause_hypothesis_set: { methodId: "root_cause.fishbone", data: { hypotheses: [] } } });
    expect(refused.alert).toContain("「原因假設集（魚骨圖結果）」這一步沒有通過");
    expect(refused.alert).toContain("要再看的格子：原因假設。");
    expect(refused.onSubmit).not.toHaveBeenCalled();
  });
});
