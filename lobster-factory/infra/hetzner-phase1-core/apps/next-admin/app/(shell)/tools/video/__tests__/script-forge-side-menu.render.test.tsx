// @vitest-environment jsdom
//
// ScriptForge's side menu (AUTO_CONTENT plan P5.26), as the video workbench's 腳本 mounts it (app/video/(wb)/script-forge):
// every module in a right column with its one-line blurb, grouped in sections that fold like the app sidebar; a click
// opens that module. Without sideMenu there is no side column.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FORGE_NAV } from "@/lib/script-forge/nav";

vi.mock("@/lib/entitlements/use-paid-features", () => ({ usePaidFeatures: () => ({ why: () => undefined }) }));
vi.mock("../StoryBibleWorkbench", () => ({ default: () => null }));
vi.mock("../OrganizationPicker", () => ({ default: () => null }));
const { default: ScriptForge } = await import("../ScriptForge");

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("ScriptForge side menu", () => {
  it("lists every module with its blurb in the right column, and a click opens it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, sites: [] }))));
    render(<ScriptForge sideMenu />);
    const menu = screen.getByRole("complementary", { name: "ScriptForge 模組" });
    // Groups fold like the app sidebar: only the current module's group (生成) starts open.
    expect(screen.getByRole("button", { name: "生成", expanded: true })).toBeTruthy();
    expect(menu.textContent).not.toContain("一次 10 種風格的開頭鉤子");
    for (const g of ["工具", "分析", "設定", "規劃", "紀錄"]) fireEvent.click(screen.getByRole("button", { name: g, expanded: false }));
    for (const m of FORGE_NAV) expect(menu.textContent).toContain(m.blurb);
    fireEvent.click(screen.getByRole("button", { name: /Hook生成器/ }));
    await waitFor(() => expect(screen.getByPlaceholderText("輸入影片主題...")).toBeTruthy());
  });

  it("opening a module in a folded group (紀錄 → 開始生成腳本) unfolds that group", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, sites: [] }))));
    render(<ScriptForge sideMenu />);
    fireEvent.click(screen.getByRole("button", { name: "生成", expanded: true }));
    fireEvent.click(screen.getByRole("button", { name: "紀錄", expanded: false }));
    fireEvent.click(screen.getByRole("button", { name: /腳本歷史/ }));
    fireEvent.click(await screen.findByRole("button", { name: /開始生成腳本/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: "生成", expanded: true })).toBeTruthy());
  });

  it("without sideMenu there is no side column", () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, sites: [] }))));
    render(<ScriptForge />);
    expect(screen.queryByRole("complementary", { name: "ScriptForge 模組" })).toBeNull();
  });
});
