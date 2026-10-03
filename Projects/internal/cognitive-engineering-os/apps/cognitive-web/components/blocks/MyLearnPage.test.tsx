import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MyLearnPage } from "./MyLearnPage";
import { byText, click, doc, field, mount, saved, serve, type, type Call } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const NOW = () => new Date().toISOString();
const posts = (calls: Call[], path: string) => calls.filter((call) => call.method !== "GET" && call.path === path);
const chip = (host: Element, group: string, text: string) => byText(host.querySelector(`[aria-label="${group}"]`)!, "button", text);

async function open(routes: Record<string, unknown> = {}) {
  const calls = serve({ "/projects": [{ project_id: "P1", name: "合夥案", created_at: "2026-10-01T08:00:00Z" }], "/me/learn/patterns": { hints: [] }, "/me/reminders": [], ...routes });
  const page = await mount(<MyLearnPage />);
  return { ...page, calls };
}

describe("每天的校準 (outside any case)", () => {
  it("writes today's card to my own records; the counterexample and what would change it are mine", async () => {
    const { host, done, calls } = await open({ "POST /me/docs/learn.daily": (call: Call) => saved("learn.daily", "D1", call.body.content) });
    const save = () => byText(host, "button", "存今天這張") as HTMLButtonElement;
    expect(save().disabled).toBe(true);
    await click(chip(host, "信念、情緒或決定", "信念"));
    await type(field(host, "daily-text"), "我一定要先講話才安全");
    await type(field(host, "daily-counter"), "上次我先聽，也沒事");
    expect(save().disabled).toBe(false);
    await click(save());
    expect(posts(calls, "/me/docs/learn.daily")[0].body).toEqual({ content: { about: "信念", text: "我一定要先講話才安全", counterexample: "上次我先聽，也沒事" } });
    expect(calls.some((call) => call.path.includes("/projects/P1/docs"))).toBe(false);   // nothing goes into a case
    await done();
  });

  it("a high-risk word suggests opening a case and says the card is not copied", async () => {
    const notice = { type: "open_case", categories: ["金錢"], notice: "這張卡寫到比較高風險的事。要不要開一個案子，在案子裡處理？卡上的內容不會自動帶過去，要的話你自己貼進開案資料。" };
    const { host, done } = await open({ "POST /me/docs/learn.daily": (call: Call) => saved("learn.daily", "D1", call.body.content, [notice]) });
    await click(chip(host, "信念、情緒或決定", "決定"));
    await type(field(host, "daily-text"), "我想把存款全投進去");
    await click(byText(host, "button", "存今天這張"));
    expect(host.textContent).toContain("要不要開一個案子");
    expect(host.querySelector('a[href="/projects"]')).not.toBeNull();
    expect(host.textContent).toContain("卡上的內容不會自動帶過去");
    await done();
  });

  it("the AI is a mirror only once there is a card today, and its words carry the AI's tag", async () => {
    const card = doc("learn.daily", "D1", { about: "信念", text: "我一定要先講話才安全" }, { at: NOW() });
    const mirrors: unknown[] = [];
    const none = await open();
    expect(byText(none.host, "button", "請 AI 當鏡子")).toBeUndefined();   // no card yet: no button
    await none.done();
    vi.resetAllMocks();
    const { host, done, calls } = await open({
      "GET /me/docs/learn.daily": [card], "GET /me/docs/learn.daily_mirror": () => mirrors,
      "POST /me/ai/LEARN/mirror": () => { const made = doc("learn.daily_mirror", "M1", { summary: "你相信要先講話才安全。" }, { author: "ai", block: "LEARN", at: new Date(Date.now() + 1000).toISOString() }); mirrors.push(made); return { saved: made }; },
    });
    await click(byText(host, "button", "請 AI 當鏡子"));
    expect(posts(calls, "/me/ai/LEARN/mirror")[0].body).toEqual({ context: { card: "D1" } });
    expect(host.textContent).toContain("AI 寫的");
    expect(host.textContent).toContain("你相信要先講話才安全。");
    await done();
  });

  it("a mirror older than the card's last version says so instead of passing for the new one", async () => {
    const card = doc("learn.daily", "D1", { about: "信念", text: "我一定要先講話才安全" }, { at: NOW(), version: 2 });
    const old = doc("learn.daily_mirror", "M1", { summary: "舊的整理" }, { author: "ai", at: "2026-10-01T08:00:00Z" });
    const { host, done } = await open({ "GET /me/docs/learn.daily": [card], "GET /me/docs/learn.daily_mirror": [old] });
    expect(host.textContent).not.toContain("舊的整理");
    expect(host.textContent).toContain("你改過這張卡，這是之前的整理");
    await done();
  });

  it("saves the two practices as one setting", async () => {
    const { host, done, calls } = await open({ "POST /me/docs/learn.practice": (call: Call) => saved("learn.practice", "PR1", call.body.content) });
    await click(chip(host, "每天校準", "要"));
    await click(chip(host, "每週衝刺幾次", "2 次"));
    await click(byText(host, "button", "存這兩件"));
    expect(posts(calls, "/me/docs/learn.practice")[0].body).toEqual({ content: { daily: true, weekly_sprints: 2 } });
    await done();
  });

  it("records a sprint on one of my own cases and counts this week's", async () => {
    const sprints = [doc("learn.sprint", "S0", { project: "P1" }, { at: NOW() })];
    const { host, done, calls } = await open({ "GET /me/docs/learn.sprint": () => sprints, "POST /me/docs/learn.sprint": (call: Call) => saved("learn.sprint", "S1", call.body.content) });
    expect(host.textContent).toContain("這週記了 1 次");
    expect((byText(host, "button", "記下這次衝刺") as HTMLButtonElement).disabled).toBe(true);
    await click(chip(host, "挑一個案子", "合夥案"));
    expect(host.querySelector('a[href="/projects/P1/think"]')).not.toBeNull();
    await click(byText(host, "button", "記下這次衝刺"));
    expect(posts(calls, "/me/docs/learn.sprint")[0].body).toEqual({ content: { project: "P1" } });
    await done();
  });

  it("lists what the engine says is due and no dropdown anywhere", async () => {
    const { host, done } = await open({ "/me/reminders": [{ block: "LEARN", kind: "daily", since: "2026-10-03", text: "今天的 10 分鐘校準還沒寫", scope: "person", path: "/me/learn" }] });
    expect(host.textContent).toContain("今天的 10 分鐘校準還沒寫");
    expect(host.querySelector("select")).toBeNull();
    await done();
  });
});
