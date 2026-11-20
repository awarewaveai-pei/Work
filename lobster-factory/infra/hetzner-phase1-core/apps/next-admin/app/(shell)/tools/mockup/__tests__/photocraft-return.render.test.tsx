// @vitest-environment jsdom
//
// 模特兒圖 and composites open in PhotoCraft (修圖 / 在畫布編輯) with a 「傳回」 ticket; the edited image comes back to
// where it was sent from (operator, 2026-11-20: 「生出來的圖要能匯入 photo-pro 修改再存回，像 tarot」).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CanvasReturnHandler } from "@/components/tools/useCanvasReturn";

const handlers: Record<string, CanvasReturnHandler> = {};
const openInCanvas = vi.fn(async () => {});
vi.mock("@/components/tools/canvas-handoff", async (orig) => ({ ...(await orig<object>()), openInCanvas: (...a: unknown[]) => openInCanvas(...(a as [])) }));
vi.mock("@/components/tools/useCanvasReturn", () => ({ useCanvasReturn: (tool: string, fn: CanvasReturnHandler) => { handlers[tool] = fn; } }));
const sizes: Record<string, { w: number; h: number }> = {};
vi.mock("../modelLibrary", async (orig) => ({ ...(await orig<object>()), imageSize: async (src: string) => sizes[src] ?? null }));
const saveDesign = vi.fn(async () => ({ ok: true }));
vi.mock("@/lib/studio/design-upload", async (orig) => ({ ...(await orig<object>()), saveDesign: (...a: unknown[]) => saveDesign(...(a as [])), urlToBlob: async () => new Blob(["x"]) }));

// Each render's onEditedImage, newest last: the panel calls the one from the render its 生成 was clicked in.
const aiEditCallbacks: ((image: string, meta: { prompt: string; model: string; seed: null }) => void)[] = [];
vi.mock("@/components/tools/ImageEditPromptPanel", () => ({ default: (p: { onEditedImage: (typeof aiEditCallbacks)[number] }) => { aiEditCallbacks.push(p.onEditedImage); return null; } }));

import ModelLibraryStudio from "../ModelLibraryStudio";
import MockupStudio from "../MockupStudio";
import ModelMockupPanel from "../ModelMockupPanel";
import type { LibraryPhoto } from "../modelLibrary";

const boxed = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
const leo: LibraryPhoto = {
  id: "leo1", object_url: "https://pub-test.r2.dev/designs/2026-11/leo1.png", asset_domain: "mockup_model_preset",
  metadata: { preset_name: "Leo", model_key: "k-leo", photo_role: "pose", garment_color: "white", preset_settings: { mGender: "man" }, print_box: boxed },
};
const EDITED = "data:image/png;base64,RURJVA==";
const ret = () => (openInCanvas.mock.calls[0] as unknown as unknown[])[4] as { tool: string; slot: string; label: string };

function Library() {
  const [photos, setPhotos] = useState([leo]);
  return <ModelLibraryStudio photos={photos} setPhotos={setPhotos} />;
}

beforeEach(() => { aiEditCallbacks.length = 0; openInCanvas.mockClear(); saveDesign.mockClear(); for (const k of Object.keys(sizes)) delete sizes[k]; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("模特兒圖庫 修圖 → PhotoCraft → 傳回", () => {
  it("a library photo comes back as a new photo of the same model; the original stays; the print box carries over at the same shape", async () => {
    sizes[leo.object_url!] = { w: 1024, h: 1536 };
    sizes[EDITED] = { w: 2048, h: 3072 };
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) => {
      const b = JSON.parse(String(init!.body));
      return new Response(JSON.stringify({ ok: true, preset: { ...leo, id: "leo1-edit", object_url: "https://pub-test.r2.dev/designs/2026-11/e.png",
        metadata: { ...leo.metadata, photo_role: b.photoRole, print_box: b.printBox } } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Library />);
    fireEvent.click(screen.getByRole("button", { name: "修圖" }));
    expect((openInCanvas.mock.calls[0] as unknown as unknown[])[0]).toBe(leo.object_url);
    expect(ret()).toEqual({ tool: "mockup-model", slot: "lib:leo1", label: "模特兒圖庫" });
    expect(await handlers["mockup-model"]("lib:leo1", EDITED)).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tools/presets");
    expect(JSON.parse(String(init!.body))).toMatchObject({ image: EDITED, presetType: "model", presetName: "Leo", modelKey: "k-leo",
      photoRole: "edit", garmentColor: "white", presetSettings: { mGender: "man" }, printBox: boxed });
    await waitFor(() => expect(screen.getAllByAltText("Leo")).toHaveLength(2)); // original kept
    expect(screen.getByText("白衣・修過・已框")).toBeTruthy();
  });

  it("a cropped edit (other shape) drops the print box; a deleted photo's return is refused (the editor keeps it in My Designs)", async () => {
    sizes[leo.object_url!] = { w: 1024, h: 1536 };
    sizes[EDITED] = { w: 1024, h: 1024 };
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, preset: { ...leo, id: "x" } })));
    vi.stubGlobal("fetch", fetchMock);
    render(<Library />);
    expect(await handlers["mockup-model"]("lib:gone", EDITED)).toBe(false);
    expect(await handlers["mockup-model"]("lib:leo1", EDITED)).toBe(true);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(JSON.parse(String((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body)).printBox).toBeUndefined();
  });

  it("when the library save fails after the return was accepted, the edit lands in My Designs instead of being lost", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "image too large (~9MB limit)" }), { status: 413 })));
    render(<Library />);
    expect(await handlers["mockup-model"]("lib:leo1", EDITED)).toBe(true);
    await waitFor(() => expect(saveDesign).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/image too large.*改過的圖已改存進 My Designs/)).toBeTruthy());
  });

  it("an unsaved generated photo is replaced in place by its edit; a regenerated batch refuses the old ticket", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, image: "data:image/png;base64,QQ==" }))));
    render(<Library />);
    fireEvent.click(screen.getByRole("button", { name: /^Leo/ }));
    fireEvent.click(screen.getByRole("button", { name: /生成 1 張模特兒圖/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "修圖" })).toHaveLength(2));
    const shotEdit = screen.getAllByRole("button", { name: "修圖" });
    fireEvent.click(shotEdit[0]); // the new shot is listed above the library
    const slot = ret().slot;
    expect(slot).toMatch(/^shot:/);
    expect(await handlers["mockup-model"](slot, EDITED)).toBe(true);
    await waitFor(() => expect(document.querySelector(`img[src="${EDITED}"]`)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /生成 1 張模特兒圖/ }));
    await waitFor(() => expect(document.querySelector(`img[src="${EDITED}"]`)).toBeNull());
    expect(await handlers["mockup-model"](slot, EDITED)).toBe(false);
  });
});

describe("returns that arrive while a save of the same image runs are refused (the editor then saves to My Designs)", () => {
  it("存進圖庫 in flight: a return for one of its shots is refused, so it is not dropped with the shot", async () => {
    let release: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(async (u: string) => u === "/api/tools/presets"
      ? new Promise<Response>((r) => { release = r; })
      : new Response(JSON.stringify({ ok: true, image: "data:image/png;base64,QQ==" }))));
    render(<Library />);
    fireEvent.click(screen.getByRole("button", { name: /^Leo/ }));
    fireEvent.click(screen.getByRole("button", { name: /生成 1 張模特兒圖/ }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: "修圖" })).toHaveLength(2));
    fireEvent.click(screen.getAllByRole("button", { name: "修圖" })[0]);
    const slot = ret().slot;
    fireEvent.click(screen.getByRole("button", { name: "勾選的存進 Leo" }));
    expect(await handlers["mockup-model"](slot, EDITED)).toBe(false);
    release(new Response(JSON.stringify({ ok: true, preset: { ...leo, id: "leo2" } })));
  });
});

describe("主頁 平拍 合成圖 在畫布編輯 → 傳回", () => {
  const DESIGN = "https://pub-test.r2.dev/designs/2026-11/d.png";
  function stubApi() {
    vi.stubGlobal("fetch", vi.fn(async (u: string) => {
      if (u.startsWith("/api/tools/designs?group=print")) return new Response(JSON.stringify({ ok: true, assets: [{ id: "d1", object_url: DESIGN, metadata: { prompt: "art" } }] }));
      if (u === "/api/tools/presets") return new Response(JSON.stringify({ ok: true, presets: [] }));
      return new Response(JSON.stringify({ ok: true, image: "data:image/png;base64,QQ==" }));
    }));
  }
  async function composite() {
    render(<MockupStudio />);
    fireEvent.click(await screen.findByAltText("art"));
    fireEvent.click(screen.getByRole("button", { name: "平拍" }));
    fireEvent.click(screen.getByRole("button", { name: "合成 Mockup" }));
    fireEvent.click(await screen.findByRole("button", { name: "在畫布編輯" }));
    return ret();
  }

  it("the edit replaces the composite; re-picking the same design keeps the ticket; 再合成一張 refuses it", async () => {
    stubApi();
    const t = await composite();
    expect(t).toMatchObject({ tool: "mockup", label: "商品圖" });
    expect(await handlers["mockup"](t.slot, EDITED)).toBe(true);
    await waitFor(() => expect(screen.getByAltText("合成結果").getAttribute("src")).toBe(EDITED));
    fireEvent.click(screen.getByAltText("art")); // same design re-picked: designRef unchanged, ticket still good
    expect(await handlers["mockup"](t.slot, EDITED)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "再合成一張" }));
    await waitFor(() => expect(screen.getByAltText("合成結果").getAttribute("src")).toBe("data:image/png;base64,QQ=="));
    expect(await handlers["mockup"](t.slot, EDITED)).toBe(false);
  });

  it("存入 My Designs in flight: the return is refused, so the edit is never shown as 已存", async () => {
    stubApi();
    let release: (v: { ok: true }) => void = () => {};
    saveDesign.mockImplementationOnce(() => new Promise((r) => { release = r as typeof release; }));
    const t = await composite();
    fireEvent.click(screen.getByRole("button", { name: "存入 My Designs" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "儲存中…" })).toBeTruthy());
    expect(await handlers["mockup"](t.slot, EDITED)).toBe(false);
    release({ ok: true });
    await waitFor(() => expect(screen.getByRole("button", { name: "已存入 My Designs ✓" })).toBeTruthy());
    expect(screen.getByAltText("合成結果").getAttribute("src")).toBe("data:image/png;base64,QQ==");
  });
});

describe("主頁 平拍: an AI edit (修圖 prompt) that lands late never overwrites a newer image", () => {
  const DESIGN = "https://pub-test.r2.dev/designs/2026-11/d.png";
  const AI = "data:image/png;base64,QUk=";
  beforeEach(() => vi.stubGlobal("fetch", vi.fn(async (u: string) => {
    if (u.startsWith("/api/tools/designs?group=print")) return new Response(JSON.stringify({ ok: true, assets: [{ id: "d1", object_url: DESIGN, metadata: { prompt: "art" } }] }));
    if (u === "/api/tools/presets") return new Response(JSON.stringify({ ok: true, presets: [] }));
    return new Response(JSON.stringify({ ok: true, image: "data:image/png;base64,QQ==" }));
  })));
  async function composite() {
    render(<MockupStudio />);
    fireEvent.click(await screen.findByAltText("art"));
    fireEvent.click(screen.getByRole("button", { name: "平拍" }));
    fireEvent.click(screen.getByRole("button", { name: "合成 Mockup" }));
    fireEvent.click(await screen.findByRole("button", { name: "在畫布編輯" }));
    return ret();
  }

  it("PhotoCraft 傳回 accepted first: the late AI edit goes to My Designs and the PhotoCraft edit stays on screen", async () => {
    const t = await composite();
    const startedFrom = aiEditCallbacks[aiEditCallbacks.length - 1]; // render showing the original composite
    expect(await handlers["mockup"](t.slot, EDITED)).toBe(true);
    await waitFor(() => expect(screen.getByAltText("合成結果").getAttribute("src")).toBe(EDITED));
    startedFrom(AI, { prompt: "brighter", model: "nano-banana-2", seed: null });
    await waitFor(() => expect(saveDesign).toHaveBeenCalledTimes(1));
    expect((saveDesign.mock.calls[0] as unknown as [Blob, { prompt: string }])[1].prompt).toBe("[mockup:ai-edit] brighter");
    expect(await screen.findByText("AI 修圖完成時合成圖已換過，修改版已存進 My Designs")).toBeTruthy();
    expect(screen.getByAltText("合成結果").getAttribute("src")).toBe(EDITED);
  });

  it("an AI edit that lands while 存入 My Designs runs replaces the image, and the save's answer no longer marks it 已存", async () => {
    let release: (v: { ok: true }) => void = () => {};
    saveDesign.mockImplementationOnce(() => new Promise((r) => { release = r as typeof release; }));
    await composite();
    fireEvent.click(screen.getByRole("button", { name: "存入 My Designs" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "儲存中…" })).toBeTruthy());
    aiEditCallbacks[aiEditCallbacks.length - 1](AI, { prompt: "p", model: "nano-banana-2", seed: null });
    await waitFor(() => expect(screen.getByAltText("合成結果").getAttribute("src")).toBe(AI));
    release({ ok: true });
    await new Promise((r) => setTimeout(r, 20));
    expect(screen.getByRole("button", { name: "存入 My Designs" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "已存入 My Designs ✓" })).toBeNull();
  });
});

describe("主頁 模特 合成結果 在畫布編輯 → 傳回", () => {
  it("the edited composite replaces the one sent and can be saved again; an older batch's ticket is refused", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, image: "data:image/png;base64,QQ==" }))));
    render(<ModelMockupPanel designRef="https://pub-test.r2.dev/designs/2026-11/d.png" designName="d" photos={[leo]} onOpenLibrary={() => {}} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: /合成（1 張/ }));
    fireEvent.click(await screen.findByRole("button", { name: "在畫布編輯" }));
    expect(ret()).toEqual({ tool: "mockup-composite", slot: "1:leo1", label: "商品 Mockup" });
    expect(await handlers["mockup-composite"]("1:leo1", EDITED)).toBe(true);
    await waitFor(() => expect(screen.getByAltText("商品 Mockup").getAttribute("src")).toBe(EDITED));
    expect(await handlers["mockup-composite"]("0:leo1", EDITED)).toBe(false);
  });
});
