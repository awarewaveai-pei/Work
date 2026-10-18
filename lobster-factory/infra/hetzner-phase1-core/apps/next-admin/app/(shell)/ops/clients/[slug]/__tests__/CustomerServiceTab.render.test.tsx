// @vitest-environment jsdom
//
// 客服 tab, mounted for real (same convention as SiteWatchCard.render.test.tsx). Covers what tsc
// cannot: the four areas are sub-tabs with a status strip, every row carries its classification
// tags, the intent filter narrows the list, and switching sub-tabs keeps an unsaved FAQ draft.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientConfig } from "@/app/api/ops/clients/route";
import type { CsIntentRow } from "../CsIntentsCard";
import { CustomerServiceTab } from "../CustomerServiceTab";

// The FAQ editor calls router.refresh() after a save so a remount starts from the saved list; no App Router here.
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const intents: CsIntentRow[] = [
  { key: "course_info", label: "課程資訊", answer_level: "L2", action_level: "A1", is_sensitive: false, confidence_threshold: 0.7, canary_pct: 100, evalCaseCount: 30, handoffReply: null,
    graduation: { status: "passed", n: 30, passRate: 0.97, startedAt: "2026-10-15T01:00:00Z", finishedAt: "2026-10-15T01:03:00Z", current: true } as CsIntentRow["graduation"] },
  { key: "refund", label: "退款", answer_level: "L0", action_level: "A0", is_sensitive: true, confidence_threshold: 0.7, canary_pct: 0, evalCaseCount: 0, handoffReply: "請先留下想退款的原因", graduation: null },
  { key: "booking", label: "預約", answer_level: "L1", action_level: "A0", is_sensitive: false, confidence_threshold: 0.7, canary_pct: 0, evalCaseCount: 12, handoffReply: null, graduation: null },
];

const cfg = {
  csFaq: [
    { id: "f1", keywords: ["課程", "上課"], answer: "課程每週三晚上。", handoff: false },
    { id: "f2", keywords: ["費用"], answer: "費用請看官網。", handoff: true },
  ],
} as unknown as ClientConfig;

type Call = { url: string; method: string; body: unknown };
let container: HTMLDivElement;
let root: Root;
let calls: Call[];

function stubFetch(overrides: Partial<{ csEnabled: boolean; configured: boolean }> = {}) {
  calls = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const c = { url, method: init?.method ?? "GET", body: init?.body ? JSON.parse(String(init.body)) : null };
    calls.push(c);
    let body: unknown = { ok: true };
    if (url.endsWith("/cs-config/chatwoot-token")) body = { ok: true, configured: overrides.configured ?? true };
    else if (url.endsWith("/cs-config")) body = { ok: true, csEnabled: overrides.csEnabled ?? true, intents, kbMinRetrievalScore: 0.4, kbMinRetrievalScoreDefault: 0.5 };
    else if (url.endsWith("/cis") && c.method === "PATCH") {
      // Mirror lib/cs/faq.ts sanitizeFaq: incomplete rows are dropped, new rows get ids.
      const sent = (c.body as { csFaq: Array<{ id: string; keywords: string[]; answer: string; handoff: boolean }> }).csFaq;
      const kept = sent.filter((e) => e.keywords.length > 0 && e.answer.trim() !== "").map((e, i) => ({ ...e, id: e.id || `faq-${i + 1}` }));
      body = { ok: true, csFaq: kept };
    }
    return { ok: true, status: 200, json: async () => body } as Response;
  });
}

function typeInto(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

async function mount() {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root.render(<CustomerServiceTab org={{ slug: "shop-a" }} cfg={cfg} />));
  await act(async () => { await Promise.resolve(); });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

const text = () => container.textContent ?? "";
const tab = (label: string) => Array.from(container.querySelectorAll<HTMLButtonElement>("[role=tab]")).find((b) => b.textContent?.includes(label))!;
const visiblePanel = () => Array.from(container.querySelectorAll<HTMLDivElement>("[role=tabpanel]")).filter((p) => !p.hidden);
const click = (el: HTMLElement) => act(async () => { el.click(); });

describe("CustomerServiceTab", () => {
  it("shows the four areas as sub-tabs with a status strip, AI 開關 first", async () => {
    stubFetch();
    await mount();
    const tabs = Array.from(container.querySelectorAll("[role=tab]")).map((b) => b.textContent);
    expect(tabs.map((t) => t?.slice(0, 2))).toEqual(["AI", "常見", "意圖", "Ch"]);
    expect(tab("AI 開關").getAttribute("aria-selected")).toBe("true");
    expect(visiblePanel()).toHaveLength(1);
    expect(visiblePanel()[0].textContent).toContain("AI 總開關");
    // Header status is plain text (role=status), not buttons: AI on with its threshold, token set.
    const status = container.querySelector("[role=status]")!;
    expect(status.querySelectorAll("button")).toHaveLength(0);
    expect(status.textContent).toContain("AI 啟用中");
    expect(status.textContent).toContain("知識門檻 0.4");
    expect(status.textContent).toContain("Chatwoot 個人 token 已設定");
    // The tab bar is the app's shared tab component, not hand-drawn pills.
    expect(container.querySelector("[role=tablist]")!.className).toBe("tab-bar");
    expect(tab("AI 開關").className).toBe("tab tab--active");
    // Tab counts are plain numbers after the label; the only clickable things above the panels are the tabs.
    expect(tab("常見問答").textContent).toBe("常見問答 2");
    expect(tab("意圖與自動化").textContent).toBe("意圖與自動化 3");
  });

  it("tags every intent by answer level, action, sensitivity and exam state, and filters by them", async () => {
    stubFetch();
    await mount();
    await click(tab("意圖與自動化"));
    const panel = visiblePanel()[0];
    expect(panel.textContent).toContain("自動 100%");
    expect(panel.textContent).toContain("唯讀");
    expect(panel.textContent).toContain("考試通過 · 30 題");
    expect(panel.textContent).toContain("永遠轉真人");
    expect(panel.textContent).toContain("敏感");
    expect(panel.textContent).toContain("草稿");
    expect(panel.textContent).toContain("還沒考 · 12 題");
    // Rows are collapsed: the controls appear only once a row is opened.
    expect(panel.textContent).not.toContain("回覆方式");
    const rows = () => Array.from(panel.querySelectorAll<HTMLButtonElement>("button[aria-expanded]"));
    expect(rows()).toHaveLength(3);
    await click(rows()[2]);
    expect(panel.textContent).toContain("回覆方式");
    expect(panel.textContent).toContain("通過考試後才能改自動");
    // 待考試 keeps the two intents without a current pass; the filter chips carry counts.
    const chip = (label: string) => Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === label)!;
    expect(chip("待考試 2")).toBeTruthy();
    await click(chip("待考試 2"));
    expect(rows().map((r) => r.textContent)).toHaveLength(2);
    expect(panel.textContent).not.toContain("課程資訊");
    await click(chip("敏感 1"));
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("退款");
  });

  it("tags FAQ rows by keyword and handoff, and keeps an unsaved draft across sub-tab switches", async () => {
    stubFetch();
    await mount();
    await click(tab("常見問答"));
    const panel = visiblePanel()[0];
    expect(panel.textContent).toContain("免費・不經 AI");
    expect(panel.textContent).toContain("上課");
    expect(panel.textContent).toContain("答完轉真人");
    const add = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "＋ 新增一題")!;
    await click(add);
    expect(panel.textContent).toContain("沒有關鍵字");
    const inputs = panel.querySelectorAll<HTMLInputElement>("input[placeholder='例如：課程、療癒模組、上課']");
    expect(inputs).toHaveLength(3);
    await act(async () => { typeInto(inputs[2], "退費、退款"); });
    expect(panel.textContent).toContain("退費");
    await click(tab("Chatwoot 連線"));
    expect(visiblePanel()[0].textContent).toContain("Chatwoot 個人 token");
    await click(tab("常見問答"));
    expect(visiblePanel()[0].querySelectorAll("input[placeholder='例如：課程、療癒模組、上課']")).toHaveLength(3);
    expect(visiblePanel()[0].textContent).toContain("退費");
    // The sub-tab count follows the draft count.
    expect(tab("常見問答").textContent).toContain("3");
  });

  it("keeps a row under the 未完成 filter while the operator fixes it, and rebuilds the list from what the server kept", async () => {
    stubFetch();
    await mount();
    await click(tab("常見問答"));
    const panel = visiblePanel()[0];
    const chip = (label: string) => Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === label)!;
    await click(chip("＋ 新增一題"));
    await click(chip("未完成 1"));
    const kwInputs = () => panel.querySelectorAll<HTMLInputElement>("input[placeholder='例如：課程、療癒模組、上課']");
    expect(kwInputs()).toHaveLength(1);
    // Typing makes the row complete-ish; it must stay visible (the filter is a snapshot, not live).
    await act(async () => { typeInto(kwInputs()[0], "退費"); });
    expect(kwInputs()).toHaveLength(1);
    expect(panel.textContent).toContain("退費");
    // Save with the answer still empty: the server drops that row; the editor shows the 2 it kept and says so.
    await click(chip("儲存問答"));
    expect(calls.filter((c) => c.method === "PATCH" && c.url.endsWith("/cis"))).toHaveLength(1);
    expect(panel.textContent).toContain("✓ 已儲存 2 題。1 題少了關鍵字或答案，沒有存。");
    expect(kwInputs()).toHaveLength(2);
    expect(panel.textContent).not.toContain("退費");
    expect(refresh).toHaveBeenCalled();
    expect(tab("常見問答").textContent).toContain("2");
  });

  it("refuses a non-numeric 知識門檻 instead of sending null (which would reset the tenant to the default)", async () => {
    stubFetch();
    await mount();
    const panel = visiblePanel()[0];
    const input = panel.querySelector<HTMLInputElement>("input[inputmode='decimal']")!;
    expect(input.value).toBe("0.4");
    const save = Array.from(panel.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent === "存" && b.previousElementSibling === input)!;
    await act(async () => { typeInto(input, "０.４５"); });
    await click(save);
    const patches = () => calls.filter((c) => c.method === "PATCH" && c.url.endsWith("/cs-config"));
    expect(patches()).toHaveLength(1);
    expect(patches()[0].body).toEqual({ kbMinRetrievalScore: 0.45 });
    await act(async () => { typeInto(input, "abc"); });
    await click(save);
    expect(patches()).toHaveLength(1);
    expect(panel.textContent).toContain("不是數字，沒有存");
  });

  it("warns inside 意圖與自動化 when the kill-switch is off", async () => {
    stubFetch({ csEnabled: false, configured: false });
    await mount();
    expect(text()).toContain("已停用");
    expect(text()).toContain("token 未設");
    await click(tab("意圖與自動化"));
    expect(visiblePanel()[0].textContent).toContain("AI 已停用");
    expect(calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });
});
