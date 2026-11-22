// @vitest-environment jsdom
//
// Site settings page: every single-choice default is a visible button group (no <select>), the same PATCH and the same
// fields as before, an old stored value still shows, and the must-carry paragraphs sit outside the collapsed panel.
import fs from "node:fs";
import path from "node:path";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedSite } from "@/app/api/content/sites/route";
import SiteManager from "../SiteManager";

// 目前客戶由外框的 ClientContextProvider 決定（ADR 020）；這裡只要一個固定的客戶。
const ORG = "11111111-1111-4111-8111-111111111111";
vi.mock("@/lib/client-context/use-client-context", () => ({
  useClientContext: () => ({ org: ORG, status: "ok" }),
}));

const site = (contentDefaults: ManagedSite["contentDefaults"] = {}): ManagedSite => ({
  id: "s1", name: "Shop", url: "https://shop.example.com", color: "#5855d0", active: true, tokenSet: true, usernameSet: true,
  note: null, source: "db", createdAt: "t", contentDefaults,
});

type Call = { url: string; method: string; body: Record<string, unknown> | null };
function stubFetch(initial: ManagedSite) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    if (method === "GET") return new Response(JSON.stringify({ ok: true, sites: [initial] }));
    const body = JSON.parse(init!.body as string) as Record<string, unknown>;
    calls.push({ url, method, body });
    return new Response(JSON.stringify({ ok: true, site: { ...initial, contentDefaults: body.contentDefaults } }));
  }));
  return calls;
}
const pressed = (group: string, name: string) =>
  Array.from(screen.getByRole("group", { name: group }).querySelectorAll("button")).find((b) => b.textContent === name)?.getAttribute("aria-pressed");
async function openPanel() {
  await screen.findByText("Shop");
  fireEvent.click(screen.getByText("▼ Content Studio 預設設定"));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("site defaults as buttons", () => {
  it("picking a button and saving sends the same PATCH: contentDefaults with that field", async () => {
    const calls = stubFetch(site({ tone: "Friendly", language: "English" }));
    render(<SiteManager />);
    await openPanel();
    expect(pressed("語氣風格", "親切友善")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "專業正式" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存預設" }));
    await waitFor(() => expect(calls).toHaveLength(1));

    expect(calls[0].url).toBe("/api/content/sites/s1");
    expect(calls[0].method).toBe("PATCH");
    expect(calls[0].body?.contentDefaults).toMatchObject({ tone: "Professional", language: "English" });
  });

  it("each of the ten groups writes its own field", async () => {
    const calls = stubFetch(site());
    render(<SiteManager />);
    await openPanel();
    const picks: Array<[string, string]> = [
      ["語氣風格", "溫暖可信"], ["文章類型", "列表文章"], ["可讀性", "大學程度"], ["人稱視角", "第二人稱（你）"],
      ["語言", "Japanese"], ["圖片模型", "Flux Dev（高品質）"], ["精選圖片標題字型", "明體（Noto Serif CJK）"],
      ["標題文字位置", "正中央"], ["漏斗階段預設", "決策（準備行動／購買）"], ["價格定位", "平價親民（可近性）"],
    ];
    for (const [group, name] of picks) {
      fireEvent.click(Array.from(screen.getByRole("group", { name: group }).querySelectorAll("button")).find((b) => b.textContent === name)!);
    }
    fireEvent.click(screen.getByRole("button", { name: "儲存預設" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    const d = calls[0].body?.contentDefaults as Record<string, unknown> & { marketing: Record<string, string> };
    expect(d).toMatchObject({
      tone: "Warm & Credible", articleType: "Listicle", readability: "College", pointOfView: "Second person",
      language: "Japanese", imageModel: "flux-dev", featuredImageFont: "serif", featuredImageTitlePosition: "center",
    });
    expect(d.marketing).toMatchObject({ funnelStage: "decision", pricePositioning: "value" });
  });

  it("old data: a stored value that is not an option still shows, pressed, and is saved back unchanged", async () => {
    const calls = stubFetch(site({ tone: "Playful", imageModel: "flux-1.1-pro" }));
    render(<SiteManager />);
    await openPanel();
    expect(pressed("語氣風格", "目前：Playful")).toBe("true");
    expect(pressed("圖片模型", "目前：flux-1.1-pro")).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "儲存預設" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body?.contentDefaults).toMatchObject({ tone: "Playful", imageModel: "flux-1.1-pro" });
  });
});

describe("must-carry paragraphs", () => {
  it("are visible with the panel collapsed, show how many are set, and save on their own", async () => {
    const calls = stubFetch(site({ tone: "Friendly", requiredBlocks: ["免責聲明", "求助專線"] }));
    render(<SiteManager />);
    await screen.findByText("Shop");
    expect(screen.queryByText("▲ 收合")).toBeNull();           // panel is collapsed
    expect(screen.getByText("已設 2 段")).toBeTruthy();

    fireEvent.change(screen.getByLabelText("每篇必附段落"), { target: { value: "免責聲明\n求助專線\n第三段" } });
    fireEvent.click(screen.getByRole("button", { name: "儲存必附段落" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body?.contentDefaults).toMatchObject({ tone: "Friendly", requiredBlocks: ["免責聲明", "求助專線", "第三段"] });
  });

  it("the defaults form does not overwrite them with a stale list", async () => {
    const calls = stubFetch(site({ requiredBlocks: ["免責聲明"] }));
    render(<SiteManager />);
    await openPanel();
    fireEvent.click(screen.getByRole("button", { name: "親切友善" }));
    fireEvent.click(screen.getByRole("button", { name: "儲存預設" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].body?.contentDefaults).toMatchObject({ requiredBlocks: ["免責聲明"] });
  });
});

describe("no dropdowns on this page", () => {
  it("no component in the sites page folder contains <select", () => {
    const dir = path.resolve(__dirname, "..");
    const files = fs.readdirSync(dir).filter((f) => /\.tsx?$/.test(f));
    expect(files).toEqual(expect.arrayContaining(["SiteManager.tsx", "OptionButtons.tsx", "RequiredBlocksField.tsx"]));
    const hits = files.flatMap((f) => fs.readFileSync(path.join(dir, f), "utf8").split("\n")
      .flatMap((line, i) => (/<select\b/.test(line) ? [`${f}:${i + 1}`] : [])));
    expect(hits).toEqual([]);
  });
});
