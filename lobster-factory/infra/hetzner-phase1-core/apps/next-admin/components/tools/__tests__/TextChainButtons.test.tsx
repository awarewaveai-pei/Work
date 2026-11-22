// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TextChainButtons from "../TextChainButtons";

vi.mock("@/app/CodexLaptopButton", () => ({ CodexLaptopButton: () => <span>啟動筆電</span> }));

function mockState(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
}
beforeEach(() => { vi.unstubAllGlobals(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TextChainButtons", () => {
  it("shows only 只用 API while the request has not answered", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    render(<TextChainButtons chain="claude+api" claudeModel="sub-claude-opus" onChange={() => {}} lane="owner" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "只用 API" })).toBeTruthy();
  });

  it("on a 500 keeps only 只用 API and says the state is unreadable", async () => {
    mockState(500, { ok: false });
    render(<TextChainButtons chain="claude+api" claudeModel="sub-claude-opus" onChange={() => {}} lane="owner" />);
    await screen.findByText("讀不到訂閱狀態");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows only the fixed 只用 API button when the state route says 403", async () => {
    mockState(403, { ok: false, error: "sub_operator_only" });
    render(<TextChainButtons chain="api" claudeModel="sub-claude-opus" onChange={() => {}} lane="owner" />);
    await waitFor(() => expect(screen.queryByText("Claude 訂閱 → API")).toBeNull());
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "只用 API" }).hasAttribute("disabled")).toBe(true);
  });

  it("offers the Claude level buttons only on a chain that has a claude segment", async () => {
    mockState(200, { ok: true, lane: "owner", tools: ["claude", "codex"], online: true, quotaBlockedUntil: {} });
    const { rerender } = render(<TextChainButtons chain="codex+api" claudeModel="sub-claude-opus" onChange={() => {}} lane="owner" />);
    await screen.findByText(/可用 · NT\$0/);
    expect(screen.queryByRole("button", { name: "Haiku" })).toBeNull();
    rerender(<TextChainButtons chain="claude+api" claudeModel="sub-claude-opus" onChange={() => {}} lane="owner" />);
    expect(screen.getByRole("button", { name: "Haiku" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Opus" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("tells that an offline segment is skipped but keeps every button clickable; onChange carries chain and claudeModel", async () => {
    mockState(200, { ok: true, lane: "owner", tools: [], online: false, quotaBlockedUntil: {} });
    const onChange = vi.fn();
    render(<TextChainButtons chain="claude+api" claudeModel="sub-claude-opus" onChange={onChange} lane="owner" />);
    await screen.findByText(/筆電離線，這一段會跳過/);
    expect(screen.getByText("啟動筆電")).toBeTruthy();
    for (const b of screen.getAllByRole("button")) expect(b.hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Codex 訂閱 → API" }));
    expect(onChange).toHaveBeenLastCalledWith({ chain: "codex+api", claudeModel: "sub-claude-opus" });
    fireEvent.click(screen.getByRole("button", { name: "Sonnet" }));
    expect(onChange).toHaveBeenLastCalledWith({ chain: "claude+api", claudeModel: "sub-claude-sonnet" });
  });

  it("reports a spent allowance with its Taipei reset time", async () => {
    mockState(200, { ok: true, lane: "schedule", tools: ["codex"], online: true, quotaBlockedUntil: { codex: Date.now() + 3_600_000 } });
    render(<TextChainButtons chain="codex+api" claudeModel="sub-claude-opus" onChange={() => {}} lane="schedule" />);
    await screen.findByText(/額度用完，\d+\/\d+ \d\d:\d\d 恢復，這一段會跳過/);
  });
});
