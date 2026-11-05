// @vitest-environment jsdom
// My Designs panel (C5.2) reads every editor-specific value from ctx.host: one save and one list per host (vector, canvas),
// and a vector host never lists a .pcraft original. The canvas host literal below is the C4.2 shape (ctx-contract.md "host").
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import myDesigns from "../../../public/editor-shared/blocks/my-designs.js";
import { createVectorcraftCtx } from "../../../public/editor-shared/ctx-vectorcraft.js";

const ID = "11111111-1111-4111-8111-111111111111";
const VECTOR = createVectorcraftCtx({ frame: () => undefined }).host;
const CANVAS = { id: "photocraft", label: "畫布", sourceExt: ".pcraft", sourceName: "design.pcraft",
  saveTag: { source: "canvas", modelName: "canvas", prompt: "canvas edit" }, listSources: ["canvas"] };

const asset = (n: number, source: string, ext?: string, name?: string) => ({
  id: `a${n}`, created_at: `2026-11-0${n}T10:00:00Z`, object_url: `https://r2.test/designs/2026-11/p${n}.png`,
  metadata: { source, ...(ext ? { source_name: name ?? `design${ext}` } : {}) },
  ...(ext ? { source_url: `https://r2.test/designs/2026-11/${ID.replace(/1$/, String(n))}${ext}` } : {}),
});
const ROWS = [
  asset(1, "vector-pro", ".vectorcraft"),
  asset(2, "canvas", ".pcraft", "poster.pcraft"),
  asset(3, "tarot"),
  asset(4, "canvas"), // canvas preview only
  asset(5, "vector-editor"), // old vector editor, preview only
  asset(6, "vector-pro", ".pcraft"), // right source tag, original this host cannot open -> hidden in both lists
  asset(7, "canvas", ".vectorcraft"),
];

let posts: any[];
let rows: unknown[];
beforeEach(() => {
  posts = []; rows = ROWS;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, blob: async () => new Blob(["bytes"]) });
    if (init?.method === "POST") { posts.push(JSON.parse(String(init.body))); return ok({ ok: true }); }
    if (String(url).startsWith("/api/tools/designs?")) return ok({ ok: true, assets: rows, nextCursor: null });
    return ok({}); // download proxy
  });
});
afterEach(() => { vi.unstubAllGlobals(); });

function mountPanel(host: unknown, extra: Record<string, unknown> = {}) {
  const body = document.createElement("div");
  document.body.appendChild(body);
  const ctx = {
    host, info() {}, busy() {},
    exportArtboard: async () => new Blob(["png"], { type: "image/png" }),
    saveAs: async () => new Blob(["source"]),
    openFile: vi.fn(async () => true), placeImage: vi.fn(async () => ({ ids: [1] })),
    ...extra,
  };
  myDesigns.mount(ctx as never, body);
  return { body, ctx };
}
const rowsShown = (body: HTMLElement) => [...body.querySelectorAll("button.fontrow")].map((b) => (b.querySelector("img") as HTMLImageElement).src);

describe.each([
  ["vector", VECTOR, "design.vectorcraft", { source: "vector-pro", modelName: "vector-pro", prompt: "vector edit" }, [1, 5], "還沒有向量編輯器存過的設計。"],
  ["canvas", CANVAS, "design.pcraft", { source: "canvas", modelName: "canvas", prompt: "canvas edit" }, [2, 4], "還沒有畫布編輯器存過的設計。"],
] as const)("%s host", (_n, host, sourceName, tag, listed, emptyText) => {
  it("saves the host's original-file name and tags", async () => {
    const { body } = mountPanel(host);
    expect(body.querySelector("#mdInfo")!.textContent).toContain(host.sourceExt);
    (body.querySelector("#saveDesign") as HTMLButtonElement).click();
    await vi.waitFor(() => expect(posts).toHaveLength(1));
    expect(posts[0].sourceFile.name).toBe(sourceName);
    expect({ source: posts[0].source, modelName: posts[0].modelName, prompt: posts[0].prompt }).toEqual(tag);
  });

  it("lists only this host's designs", async () => {
    const { body } = mountPanel(host);
    await vi.waitFor(() => expect(rowsShown(body).length).toBeGreaterThan(0));
    expect(rowsShown(body)).toEqual(listed.map((n) => `https://r2.test/designs/2026-11/p${n}.png`));
  });

  it("says which editor the empty list belongs to", async () => {
    rows = [asset(3, "tarot")];
    const { body } = mountPanel(host);
    await vi.waitFor(() => expect(body.querySelector("#mdList")!.textContent).toBe(emptyText));
  });
});

describe("importLegacy is shown only when the host provides it", () => {
  it("no importLegacy -> no legacy input; with importLegacy -> input, and the file goes to it", async () => {
    expect(mountPanel(CANVAS).body.querySelector("#mdProj")).toBeNull();
    const importLegacy = vi.fn(async () => ({ objects: 3 }));
    const { body } = mountPanel(VECTOR, { importLegacy });
    const input = body.querySelector("#mdProj") as HTMLInputElement;
    expect(input).not.toBeNull();
    const file = new File(["{}"], "old.design.json");
    Object.defineProperty(input, "files", { value: [file] });
    input.onchange!({ target: input } as unknown as Event);
    await vi.waitFor(() => expect(importLegacy).toHaveBeenCalledWith(file));
    await vi.waitFor(() => expect(body.querySelector("#mdInfo")!.textContent).toContain("3 個物件"));
  });
});

describe("open", () => {
  it("opens the original with the stored name; a preview-only row is placed as an image", async () => {
    const { body, ctx } = mountPanel(CANVAS);
    await vi.waitFor(() => expect(rowsShown(body)).toHaveLength(2));
    const [withSource, previewOnly] = [...body.querySelectorAll("button.fontrow")] as HTMLButtonElement[];
    withSource.click();
    await vi.waitFor(() => expect(ctx.openFile).toHaveBeenCalledTimes(1));
    expect((ctx.openFile.mock.calls[0] as unknown[])[1]).toBe("poster.pcraft");
    previewOnly.click();
    await vi.waitFor(() => expect(ctx.placeImage).toHaveBeenCalledTimes(1));
  });
});

describe("mount without a host", () => {
  it("fails loudly instead of defaulting to an editor", () => {
    expect(() => mountPanel(undefined)).toThrow(/ctx\.host/);
  });
});
