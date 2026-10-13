import React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProcessFacts } from "./ProcessFacts";
import { mount, serve } from "./JudgmentTestKit";

vi.mock("../../lib/api", async (original) => ({ ...(await original<typeof import("../../lib/api")>()), apiFetch: vi.fn() }));
afterEach(() => vi.resetAllMocks());

const opened = async (host: Element) => {
  const fold = host.querySelector("details")!;
  await act(async () => { fold.open = true; fold.dispatchEvent(new Event("toggle")); });
};

describe("過程紀錄 (card 70: the indicators were built with no page, 2026-10-13)", () => {
  it("a case: read only when opened, each sentence links to the page holding its records", async () => {
    const calls = serve({ "GET /projects/P1/indicators": { scope: "case", indicators: [
      { id: "assumptions_stated", sentence: "寫了自己的假設", present: true, evidence: [{ kind: "decide.judgment", doc_id: "D1", owner: "case:P1" }, { kind: "map.map", doc_id: "M1", owner: "case:P1" }, { kind: "decide.judgment", doc_id: "D2", owner: "case:P1" }] },
      { id: "modules_chosen_adjusted_or_off_with_reason", sentence: "積木調整過，或回答過積木的提議", present: true, evidence: [{ kind: "assembler.intake", doc_id: "I1", owner: "case:P1" }, { kind: "assembler.proposal.verify", doc_id: "Q1", owner: "case:P1" }, { kind: "assembler.answer", doc_id: "A1", owner: "case:P1" }] },
      { id: "ai_trust_calibrated", sentence: "回應 AI 的時候還沒寫理由", present: false, evidence: [] },
    ] } });
    const { host, done } = await mount(<ProcessFacts path="/projects/P1" projectId="P1" />);
    expect(calls).toEqual([]);
    await opened(host);
    const lines = [...host.querySelectorAll("li")];
    expect(lines.map((line) => line.textContent)).toEqual([
      "寫了自己的假設　到「判斷」看 →　到「拆解」看 →",
      "積木調整過，或回答過積木的提議　到「開案資料」看 →",
      "回應 AI 的時候還沒寫理由",
    ]);
    expect([...lines[0].querySelectorAll("a")].map((link) => link.getAttribute("href"))).toEqual(["/projects/P1/decide", "/projects/P1/map"]);
    expect(lines[1].querySelector("a")?.getAttribute("href")).toBe("/projects/P1/start");
    await done();
  });

  it("a group: no links (its records are on the group page); an open list is read again after a save on the page", async () => {
    let review = false;
    const calls = serve({ "GET /groups/G1/indicators": () => ({ scope: "group", indicators: [{ id: "review_held_after_decision", sentence: review ? "決定之後有回頭檢討" : "決定之後還沒有回頭檢討", present: review, evidence: [{ kind: "collab.review", doc_id: "R1", owner: "group:G1" }] }] }) });
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => { root.render(<ProcessFacts path="/groups/G1" stamp={1} />); });
    await opened(host);
    expect(host.querySelector("li")?.textContent).toBe("決定之後還沒有回頭檢討");
    expect(host.querySelector("li a")).toBeNull();
    review = true;
    await act(async () => { root.render(<ProcessFacts path="/groups/G1" stamp={2} />); });
    expect(host.querySelector("li")?.textContent).toBe("決定之後有回頭檢討");
    expect(calls.length).toBe(2);
    await act(async () => { root.unmount(); });
    host.remove();
  });
});
