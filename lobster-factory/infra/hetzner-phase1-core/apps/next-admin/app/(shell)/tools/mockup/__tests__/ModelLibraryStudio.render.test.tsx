// @vitest-environment jsdom
//
// 模特兒印製: photos group per model; only photos with a print outline can be picked; dragging a corner saves a tilted
// quad (a leaning torso, operator 2026-11-01); printing sends each picked photo with its own outline.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ModelLibraryStudio, { type LibraryPhoto } from "../ModelLibraryStudio";

const boxed = { x: 0.3, y: 0.3, w: 0.4, h: 0.4 };
const photo = (id: string, name: string, model: string, role: string, print_box?: typeof boxed): LibraryPhoto => ({
  id, object_url: `https://pub-test.r2.dev/designs/2026-11/${id}.png`, asset_domain: "mockup_model_preset",
  metadata: { preset_name: name, model_key: model, photo_role: role, preset_settings: { mGender: name === "Mia" ? "woman" : "man" }, ...(print_box ? { print_box } : {}) },
});

function Harness({ initial, onDeleted = () => {} }: { initial: LibraryPhoto[]; onDeleted?: (id: string) => void }) {
  const [photos, setPhotos] = useState(initial);
  return <ModelLibraryStudio designRef="https://pub-test.r2.dev/designs/2026-11/design.png" photos={photos} setPhotos={setPhotos} onDeleted={onDeleted} />;
}

beforeEach(() => {
  // jsdom has no PointerEvent: without this, fireEvent.pointerMove carries no clientX and the drag reads NaN.
  if (!("PointerEvent" in window)) (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = MouseEvent;
  // jsdom lays nothing out: give the outline frame a 100 x 100 box so pointer positions map to fractions.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ left: 0, top: 0, width: 100, height: 100, right: 100, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("ModelLibraryStudio", () => {
  const library = [
    photo("leo1", "Leo", "k-leo", "face-front", boxed),
    photo("leo2", "Leo", "k-leo", "pose"),
    photo("mia1", "Mia", "k-mia", "pose", boxed),
  ];

  it("groups photos per model; every photo can be picked for the AI print, only outlined ones count for the free preview", () => {
    render(<Harness initial={library} />);
    expect(screen.getByText("Leo")).toBeTruthy();
    expect(screen.getByText("Mia")).toBeTruthy();
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.disabled)).toEqual([false, false, false]);
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]); // leo2 has no outline
    expect(screen.getByRole("button", { name: /印上設計（AI，2 張/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /免費預覽（程式印，1 張）/ })).toBeTruthy();
  });

  it("dragging a corner saves a tilted quad with its bounding rectangle", async () => {
    const fetchMock = vi.fn(async (_u: string, init?: RequestInit) =>
      new Response(JSON.stringify({ ok: true, preset: { ...library[0], metadata: { ...library[0].metadata, print_box: JSON.parse(String(init?.body)).printBox } } })));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness initial={library} />);
    fireEvent.click(screen.getAllByRole("button", { name: "管理" })[0]);
    fireEvent.click(screen.getAllByAltText("Leo")[2]); // the manage grid's first photo
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
    expect(sent.quad[0]).toEqual({ x: 0.3, y: 0.3 });
    expect(sent).toMatchObject({ x: 0.3, y: 0.3 });
    expect(sent.w).toBeCloseTo(0.42);
  });

  it("AI print sends every picked photo across models without an outline; the free preview sends only outlined ones with their box", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, image: "data:image/jpeg;base64,AA==" })));
    vi.stubGlobal("fetch", fetchMock);
    render(<Harness initial={library} />);
    const boxes = screen.getAllByRole("checkbox");
    fireEvent.click(boxes[0]);
    fireEvent.click(boxes[1]);
    fireEvent.click(boxes[2]);
    fireEvent.click(screen.getByRole("button", { name: /印上設計（AI，3 張/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const ai = fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(fetchMock.mock.calls.every((c) => (c as unknown as [string])[0] === "/api/tools/studio/fabric-print")).toBe(true);
    expect(ai.every((b) => b.engine === "ai" && b.box === undefined)).toBe(true);
    expect(ai.map((b) => b.photo).sort()).toEqual(library.map((p) => p.object_url).sort());
    expect(ai[0].design).toBe("https://pub-test.r2.dev/designs/2026-11/design.png");
    await waitFor(() => expect(screen.getAllByAltText("印製結果")).toHaveLength(3));
    fetchMock.mockClear();
    fireEvent.click(screen.getByRole("button", { name: /免費預覽（程式印，2 張）/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const code = fetchMock.mock.calls.map((c) => JSON.parse(String((c as unknown as [string, RequestInit])[1].body)));
    expect(code.every((b) => b.engine === "code")).toBe(true);
    expect(code.map((b) => b.box)).toEqual([boxed, boxed]);
  });
});
