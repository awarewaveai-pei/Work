// @vitest-environment jsdom
//
// Mockup Studio's model flow (operator, 2026-11-02): 【模特兒印製】 generates 模特兒圖 into the library; the 主頁 模特 tab
// picks several of them + one design and composites one product mockup per photo.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelLibraryStudio from "../ModelLibraryStudio";
import ModelMockupPanel from "../ModelMockupPanel";
import type { LibraryPhoto } from "../modelLibrary";

const boxed = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
const DESIGN = "https://pub-test.r2.dev/designs/2026-11/design.png";
const photo = (id: string, name: string, model: string, print_box?: typeof boxed): LibraryPhoto => ({
  id, object_url: `https://pub-test.r2.dev/designs/2026-11/${id}.png`, asset_domain: "mockup_model_preset",
  metadata: { preset_name: name, model_key: model, photo_role: "pose", garment_color: "white",
    preset_settings: { mGender: name === "Mia" ? "woman" : "man" }, ...(print_box ? { print_box } : {}) },
});
const library = [photo("leo1", "Leo", "k-leo", boxed), photo("leo2", "Leo", "k-leo"), photo("mia1", "Mia", "k-mia", boxed)];
const bodies = (m: ReturnType<typeof vi.fn>) => m.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
const urls = (m: ReturnType<typeof vi.fn>) => m.mock.calls.map((c) => (c as unknown as [string])[0]);

beforeEach(() => {
  // jsdom has no PointerEvent: without this, fireEvent.pointerMove carries no clientX and the drag reads NaN.
  if (!("PointerEvent" in window)) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  // jsdom lays nothing out: give the outline frame a 100 x 100 box so pointer positions map to fractions.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("主頁 模特: 模特兒圖 + design → product mockups", () => {
  it("groups photos per model; every photo can be picked; 全選 picks a whole model", () => {
    render(<ModelMockupPanel designRef={DESIGN} designName="" photos={library} onOpenLibrary={() => {}} />);
    expect(screen.getByText("Leo")).toBeTruthy();
    expect(screen.getByText("Mia")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "全選" })[0]);
    expect(screen.getByRole("button", { name: /合成（2 張/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /免費預覽（1 張）/ })).toBeTruthy();
  });

  it("合成 sends every picked photo across models to the AI print; 免費預覽 sends only outlined ones with their box", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, image: "data:image/jpeg;base64,AA==" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<ModelMockupPanel designRef={DESIGN} designName="" photos={library} onOpenLibrary={() => {}} />);
    for (const box of screen.getAllByRole("checkbox")) fireEvent.click(box);
    fireEvent.click(screen.getByRole("button", { name: /合成（3 張/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(urls(fetchMock).every((u) => u === "/api/tools/studio/fabric-print")).toBe(true);
    const ai = bodies(fetchMock);
    expect(ai.every((b) => b.engine === "ai" && b.box === undefined && b.design === DESIGN && b.placement === "center-chest")).toBe(true);
    expect(ai.map((b) => b.photo).sort()).toEqual(library.map((p) => p.object_url).sort());
    await waitFor(() => expect(screen.getAllByAltText("商品 Mockup")).toHaveLength(3));
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /免費預覽（2 張）/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(bodies(fetchMock).map((b) => [b.engine, b.box])).toEqual([["code", boxed], ["code", boxed]]);
  });

  it("a gateway error page (HTML 502 while a deploy restarts the app) reads as words, not a JSON parse error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("<!DOCTYPE html><html>502</html>", { status: 502, headers: { "content-type": "text/html" } })));
    render(<ModelMockupPanel designRef={DESIGN} designName="" photos={library} onOpenLibrary={() => {}} />);
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /合成（1 張/ }));
    await waitFor(() => expect(screen.getByText(/伺服器暫時沒有回應（HTTP 502）/)).toBeTruthy());
    expect(screen.queryByText(/Unexpected token/)).toBeNull();
  });

  it("the model buttons list only models that take two references, and the picked one is sent; results enlarge on click", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, image: "data:image/jpeg;base64,AA==" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<ModelMockupPanel designRef={DESIGN} designName="" photos={library} onOpenLibrary={() => {}} />);
    expect(screen.queryByRole("button", { name: /FLUX/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Imagen/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Nano Banana 2\.1（/ }));
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.click(screen.getByRole("button", { name: /合成（1 張，約 NT\$2）/ /* nano-banana-2 = Nano Banana 2.1 on Google at 2K: US$0.057 x 32 */ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(bodies(fetchMock)[0].model).toBe("nano-banana-2");
    fireEvent.click(await screen.findByAltText("商品 Mockup"));
    expect(screen.getByRole("dialog", { name: "放大檢視" })).toBeTruthy();
    fireEvent.click(screen.getByRole("dialog"));
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("an empty library points to 【模特兒印製】", () => {
    const open = vi.fn();
    render(<ModelMockupPanel designRef={DESIGN} designName="" photos={[]} onOpenLibrary={open} />);
    fireEvent.click(screen.getByRole("button", { name: "到【模特兒印製】生成" }));
    expect(open).toHaveBeenCalled();
  });
});

function Library({ initial }: { initial: LibraryPhoto[] }) {
  const [photos, setPhotos] = useState(initial);
  return <ModelLibraryStudio photos={photos} setPhotos={setPhotos} />;
}

describe("【模特兒印製】: settings → 模特兒圖 → library", () => {
  it("a new person's batch is one person: the first photo comes from the description, the rest copy its face", async () => {
    let n = 0;
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/api/tools/studio/generate") return new Response(JSON.stringify({ ok: true, image: `data:image/png;base64,P${++n}` }));
      const b = JSON.parse(String(init!.body));
      return new Response(JSON.stringify({ ok: true, preset: { id: `s${n++}`, object_url: "https://pub-test.r2.dev/designs/2026-11/x.png", asset_domain: "mockup_model_preset", metadata: { preset_name: b.presetName, model_key: b.modelKey } } }));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<Library initial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "男性" }));
    fireEvent.click(screen.getByRole("button", { name: "靠牆" })); // standing is preselected → 2 poses
    fireEvent.click(screen.getByRole("button", { name: /生成 2 張模特兒圖/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [first, second] = bodies(fetchMock);
    expect(first.model).toBe("nano-banana-2");
    expect(first.referenceImages).toEqual([]);
    expect(first.prompt).toContain("(man)");
    expect(first.prompt).not.toContain("REFERENCE IMAGES");
    expect(second.referenceImages).toEqual(["data:image/png;base64,P1"]);
    expect(second.prompt).toContain("ALL reference images show the SAME person");
    await waitFor(() => expect(screen.getAllByRole("checkbox")).toHaveLength(2));
    // A generated 模特兒圖 opens full size on click; that click does not drop it from the save.
    fireEvent.click(screen.getByAltText("standing"));
    expect(screen.getByRole("dialog", { name: "放大檢視" })).toBeTruthy();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect((screen.getAllByRole("checkbox") as HTMLInputElement[]).every((c) => c.checked)).toBe(true);

    fetchMock.mockClear();
    fireEvent.change(screen.getByPlaceholderText(/新模特兒名字/), { target: { value: "Leo" } });
    fireEvent.click(screen.getByRole("button", { name: "勾選的存成新模特兒" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const saves = bodies(fetchMock);
    expect(urls(fetchMock).every((u) => u === "/api/tools/presets")).toBe(true);
    expect(saves.every((b) => b.presetName === "Leo" && b.photoRole === "pose" && b.garmentColor === "white")).toBe(true);
    expect(new Set(saves.map((b) => b.modelKey)).size).toBe(1);
  });

  it("when a new person's first photo fails, the rest are not generated (nothing to copy the face from)", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "生成失敗：x" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<Library initial={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "靠牆" }));
    fireEvent.click(screen.getByRole("button", { name: /生成 2 張模特兒圖/ }));
    await waitFor(() => expect(screen.getByText(/第一張沒有生成成功/)).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an existing model's photos are the face for every new photo", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, image: "data:image/png;base64,QQ==" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<Library initial={library} />);
    fireEvent.click(screen.getByRole("button", { name: /^Leo/ }));
    expect(screen.queryByRole("button", { name: "男性" })).toBeNull(); // no description for an existing person
    fireEvent.click(screen.getByRole("button", { name: /生成 1 張模特兒圖/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [b] = bodies(fetchMock);
    expect(b.referenceImages).toEqual([library[0].object_url, library[1].object_url]);
    expect(b.prompt).toContain("SAME person");
  });

  it("several photos are deleted in one go; a refused delete shows the server's reason and keeps that photo", async () => {
    const fetchMock = vi.fn(async (url: string) => url.endsWith("leo2")
      ? new Response(JSON.stringify({ ok: false, error: "無法確認檔案是否仍被文章使用，未刪除（reference_scan_http_400:Soulful Expression）" }), { status: 502 })
      : new Response(JSON.stringify({ ok: true })));
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Library initial={library} />);
    for (const c of screen.getAllByRole("checkbox", { name: "勾選刪除" })) fireEvent.click(c);
    fireEvent.click(screen.getByRole("button", { name: "永久刪除勾選的 3 張" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(urls(fetchMock).every((u) => u.startsWith("/api/tools/presets?id=") && true)).toBe(true);
    expect(fetchMock.mock.calls.every((c) => (c as unknown as [string, RequestInit])[1].method === "DELETE")).toBe(true);
    await waitFor(() => expect(screen.getByText(/有 1 張沒有刪除：.*Soulful Expression/)).toBeTruthy());
    expect(screen.getAllByRole("checkbox", { name: "勾選刪除" })).toHaveLength(1); // leo2 stays
  });

  it("dragging a corner of a photo's outline saves a tilted quad with its bounding rectangle", async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true, preset: { ...library[0], metadata: { ...library[0].metadata, print_box: JSON.parse(String(init?.body)).printBox } } })));
    vi.stubGlobal("fetch", fetchMock);
    render(<Library initial={library} />);
    fireEvent.click(screen.getAllByAltText("Leo")[0]);
    const topRight = document.querySelector('[data-corner="1"]')!;
    const frame = topRight.parentElement!;
    fireEvent.pointerDown(topRight, { clientX: 70, clientY: 30, pointerId: 1 });
    fireEvent.pointerMove(frame, { clientX: 72, clientY: 38, pointerId: 1 });
    fireEvent.pointerUp(frame, { pointerId: 1 });
    fireEvent.click(screen.getByRole("button", { name: "儲存印花框" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/tools/presets?id=leo1");
    const sent = JSON.parse(String(init!.body)).printBox;
    expect(sent.quad[1]).toEqual({ x: 0.72, y: 0.38 });
    expect(sent).toMatchObject({ x: 0.3, y: 0.3 });
    expect(sent.w).toBeCloseTo(0.42);
  });
});
