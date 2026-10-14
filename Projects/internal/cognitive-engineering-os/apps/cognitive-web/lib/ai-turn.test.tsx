import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiWaiting, IN_BACKGROUND, READY } from "../components/blocks/AiWaiting";
import { ApiError } from "./api";
import { AI_POLL_MS, ai } from "./blocks";

// A turn the API runs in the background (ai_lego/apps/api/blocks/ai.py: the 8000-token EXPRESS draft, ~2 minutes): the
// POST answers 202, ai() asks after it until the answer comes, and the block page says it is still writing.
(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;
const DRAFT = { doc_id: "D1", kind: "express.draft", version: 1, content: { sentences: [] }, author: "ai", block: "EXPRESS", at: "2026-10-13T00:00:00Z" };
const PENDING = () => json({ turn: "T1", status: "PENDING" }, 202);
// lib/ai-wait.ts keeps what settled for the whole tab: each test's clock starts after the last one's, as a real clock would
let clock = Date.parse("2026-10-14T00:00:00Z");
const later = () => vi.useFakeTimers({ now: (clock += 3_600_000) });

function server(turnAnswers: Response[]) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    asked.push(`${init?.method ?? "GET"} ${url}`);
    if (init?.method === "POST") return PENDING();
    return turnAnswers.shift() ?? PENDING();
  }));
  return asked;
}

async function mount(element: React.ReactElement) {
  const host = document.createElement("div");
  const root = createRoot(host);
  await act(async () => { root.render(element); });
  return { host, unmount: () => act(() => root.unmount()) };
}

describe("a background AI turn", () => {
  it("is asked after until its answer comes, while its page says the AI is still writing and another page says where it goes", async () => {
    later();
    const asked = server([PENDING(), json({}, 502), json({}, 500), json({ saved: DRAFT, model: "m" })]);
    const page = await mount(<AiWaiting projectId="P" block="EXPRESS" />);
    const other = await mount(<AiWaiting projectId="P" block="THINK" />);
    let answer: unknown;
    let turn!: Promise<void>;
    await act(async () => { turn = ai("P", "EXPRESS", "draft_from_outline").then((value) => { answer = value; }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(AI_POLL_MS + 10); });
    expect(page.host.textContent).toContain(IN_BACKGROUND);
    expect(page.host.textContent).toContain("已經過了 3 秒");
    expect(other.host.textContent).toBe("「產出與表達」的 AI 還在寫，寫好會留在那一塊。");
    await act(async () => { await vi.advanceTimersByTimeAsync(3 * AI_POLL_MS + 10); await turn; });
    expect(answer).toEqual({ saved: DRAFT, model: "m" });
    expect(asked).toEqual(["POST /api/projects/P/ai/EXPRESS/draft_from_outline", ...Array(4).fill("GET /api/projects/P/ai/turns/T1")]);   // a page with no code is asked past
    await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    expect(page.host.textContent).toBe("");
    page.unmount();
    other.unmount();
  });

  it("asked again while it runs is the same turn, and a page that came back is told when the answer is in", async () => {
    later();
    const asked = server([PENDING(), json({ saved: DRAFT, model: "m" })]);
    let first!: Promise<unknown>;
    await act(async () => { first = ai("P", "EXPRESS", "draft_from_outline", { selection: "S" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    const back = await mount(<AiWaiting projectId="P" block="EXPRESS" />);   // the page was left and opened again
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * AI_POLL_MS + 10); await first; });
    expect(asked.filter((line) => line.startsWith("POST"))).toHaveLength(1);
    expect(back.host.textContent).toContain(READY);
    back.unmount();

    server([PENDING(), json({ saved: DRAFT, model: "m" })]);
    let again!: Promise<unknown>;
    let pressed!: Promise<unknown>;
    await act(async () => { again = ai("P", "EXPRESS", "draft_from_outline", { selection: "S" }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    const joined = await mount(<AiWaiting projectId="P" block="EXPRESS" />);
    await act(async () => { pressed = ai("P", "EXPRESS", "draft_from_outline", { selection: "S" }); });
    expect(pressed).toBe(again);
    await act(async () => { await vi.advanceTimersByTimeAsync(2 * AI_POLL_MS + 10); await again; });
    expect(joined.host.textContent).toBe("");   // the page that pressed again gets the answer itself: no reload asked
    joined.unmount();
  });

  it("ends with the turn's own failure, as the POST would have answered it", async () => {
    later();
    server([json({ detail: "AI_PROVIDER_REFUSAL" }, 424)]);
    const turn = ai("P", "EXPRESS", "draft_from_outline").catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(AI_POLL_MS + 10);
    const error = await turn;
    expect(error).toBeInstanceOf(ApiError);
    expect([(error as ApiError).status, (error as ApiError).detail]).toEqual([424, "AI_PROVIDER_REFUSAL"]);
  });
});
