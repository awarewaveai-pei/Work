// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    render(<TextChainButtons chain="claude+api" claudeModel="sub-claude-opus" codexModel="sub-codex-sol" onChange={() => {}} lane="owner" />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "只用 API" })).toBeTruthy();
  });

  it("on a 500 keeps only 只用 API and says the state is unreadable", async () => {
    mockState(500, { ok: false });
    render(<TextChainButtons chain="claude+api" claudeModel="sub-claude-opus" codexModel="sub-codex-sol" onChange={() => {}} lane="owner" />);
    await screen.findByText("讀不到訂閱狀態");
    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("shows only the fixed 只用 API button when the state route says 403", async () => {
    mockState(403, { ok: false, error: "sub_operator_only" });
    render(<TextChainButtons chain="api" claudeModel="sub-claude-opus" codexModel="sub-codex-sol" onChange={() => {}} lane="owner" />);
    await waitFor(() => expect(screen.queryByText("Claude 訂閱 → API")).toBeNull());
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "只用 API" }).hasAttribute("disabled")).toBe(true);
  });

  it("offers the Claude level buttons only on a chain that has a claude segment", async () => {
    mockState(200, { ok: true, lane: "owner", tools: ["claude", "codex"], online: true, quotaBlockedUntil: {} });
    const { rerender } = render(<TextChainButtons chain="codex+api" claudeModel="sub-claude-opus" codexModel="sub-codex-sol" onChange={() => {}} lane="owner" />);
    await screen.findByText(/可用 · NT\$0/);
    expect(screen.queryByRole("button", { name: "Haiku" })).toBeNull();
    rerender(<TextChainButtons chain="claude+api" claudeModel="sub-claude-opus" codexModel="sub-codex-sol" onChange={() => {}} lane="owner" />);
    expect(screen.getByRole("button", { name: "Haiku" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Opus" }).getAttribute("aria-pressed")).toBe("true");
  });

  it("tells that an offline segment is skipped but keeps every button clickable; onChange carries chain, claudeModel and codexModel", async () => {
    mockState(200, { ok: true, lane: "owner", tools: [], online: false, quotaBlockedUntil: {} });
    const onChange = vi.fn();
    render(<TextChainButtons chain="claude+api" claudeModel="sub-claude-opus" codexModel="sub-codex-sol" onChange={onChange} lane="owner" />);
    await screen.findByText(/筆電離線，這一段會跳過/);
    expect(screen.getByText("啟動筆電")).toBeTruthy();
    for (const b of screen.getAllByRole("button")) expect(b.hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Codex 訂閱 → API" }));
    expect(onChange).toHaveBeenLastCalledWith({ chain: "codex+api", claudeModel: "sub-claude-opus", codexModel: "sub-codex-sol" });
    fireEvent.click(screen.getByRole("button", { name: "Sonnet" }));
    expect(onChange).toHaveBeenLastCalledWith({ chain: "claude+api", claudeModel: "sub-claude-sonnet", codexModel: "sub-codex-sol" });
    // K17: the codex row appears with a codex segment and carries the pick
    expect(screen.queryByRole("button", { name: "GPT-6.2 astra" })).toBeNull();
    cleanup();
    render(<TextChainButtons chain="claude+codex+api" claudeModel="sub-claude-opus" codexModel="sub-codex-sol" onChange={onChange} lane="owner" />);
    await screen.findAllByText(/筆電離線，這一段會跳過/);
    fireEvent.click(screen.getByRole("button", { name: "GPT-6.2 astra" }));
    expect(onChange).toHaveBeenLastCalledWith({ chain: "claude+codex+api", claudeModel: "sub-claude-opus", codexModel: "sub-codex-astra" });
  });

  it("reports a spent allowance with its Taipei reset time", async () => {
    mockState(200, { ok: true, lane: "schedule", tools: ["codex"], online: true, quotaBlockedUntil: { codex: Date.now() + 3_600_000 } });
    render(<TextChainButtons chain="codex+api" claudeModel="sub-claude-opus" codexModel="sub-codex-sol" onChange={() => {}} lane="schedule" />);
    await screen.findByText(/額度用完，\d+\/\d+ \d\d:\d\d 恢復，這一段會跳過/);
  });

  describe("polling", () => {
    const online = { ok: true, lane: "owner", tools: ["claude"], online: true, quotaBlockedUntil: {} };
    const offline = { ...online, tools: [], online: false };
    const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
    const setup = (...rs: Array<() => Response | Promise<Response>>) => {
      const f = vi.fn();
      rs.forEach((r) => f.mockImplementationOnce(async () => r()));
      f.mockImplementation(async () => rs[rs.length - 1]());
      vi.stubGlobal("fetch", f);
      return f;
    };
    const advance = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
    const vis = (v: "visible" | "hidden") => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
      document.dispatchEvent(new Event("visibilitychange"));
    };
    const ui = <TextChainButtons chain="claude+api" claudeModel="sub-claude-opus" codexModel="sub-codex-sol" onChange={() => {}} lane="owner" />;
    beforeEach(() => { vi.useFakeTimers(); vis("visible"); });
    afterEach(() => { cleanup(); vi.useRealTimers(); vis("visible"); });

    it("turns the offline line into available once the worker comes online", async () => {
      const f = setup(() => res(200, offline), () => res(200, online));
      render(ui);
      await advance(0);
      expect(screen.getByText(/筆電離線，這一段會跳過/)).toBeTruthy();
      await advance(15_000);
      expect(f).toHaveBeenCalledTimes(2);
      expect(screen.queryByText(/筆電離線，這一段會跳過/)).toBeNull();
      expect(screen.getByText(/可用 · NT\$0/)).toBeTruthy();
    });

    it("sends no request while the tab is hidden and reads at once when it is visible again", async () => {
      const f = setup(() => res(200, online));
      render(ui);
      await advance(0);
      vis("hidden");
      await advance(60_000);
      expect(f).toHaveBeenCalledTimes(1);
      vis("visible");
      await advance(0);
      expect(f).toHaveBeenCalledTimes(2);
    });

    it("stops asking after a 403", async () => {
      const f = setup(() => res(403, { ok: false }));
      render(ui);
      await advance(0);
      await advance(60_000);
      expect(f).toHaveBeenCalledTimes(1);
    });

    it("stops asking after unmount", async () => {
      const f = setup(() => res(200, online));
      const { unmount } = render(ui);
      await advance(0);
      unmount();
      await advance(60_000);
      expect(f).toHaveBeenCalledTimes(1);
    });

    it("keeps the last good state and says unreadable when a later read fails", async () => {
      setup(() => res(200, online), () => res(500, { ok: false }));
      render(ui);
      await advance(0);
      await advance(15_000);
      expect(screen.getByText("讀不到訂閱狀態")).toBeTruthy();
      expect(screen.getByText(/可用 · NT\$0/)).toBeTruthy();
      expect(screen.getByRole("button", { name: "Haiku" })).toBeTruthy();
    });
  });
});
