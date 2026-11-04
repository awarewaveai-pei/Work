// Drift guard for the 🪄 去背 union (CARD-06): the AI 去背 request, messages and pixel pick are ONE file,
// public/editor-shared/bg-remove.js, used by /tools/canvas (via lib/studio/editor-bg-remove.ts) and public/vector-editor.html
// (<script type="module">). Fails if the request loses the role header the route needs, the duplicate blocks come back,
// or either editor grows a private copy.
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { roleHeader } from "../../ops-role";
import { BG_MSG, OPS_ROLE_HEADER, REMOVE_BG_URL, isRouteImage, keepViewAfterSwap, requestRemoveBg } from "../editor-bg-remove";

const APP = path.resolve(__dirname, "..", "..", "..");
const read = (rel: string) => fs.readFileSync(path.join(APP, rel), "utf8");
const PNG = "data:image/png;base64,iVBORw0KGgo=";

describe("requestRemoveBg", () => {
  it("POSTs { image } to the route with the operator role header (the route answers 403 forbidden_role without one)", async () => {
    expect(OPS_ROLE_HEADER).toEqual(roleHeader("operator"));
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true, image: PNG }), { status: 200 }));
    const r = await requestRemoveBg(PNG, fetchImpl as unknown as typeof fetch);
    expect(r).toEqual({ ok: true, image: PNG });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(REMOVE_BG_URL);
    expect(url).toBe("/api/tools/studio/remove-bg");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json", ...roleHeader("operator") });
    expect(JSON.parse(init.body as string)).toEqual({ image: PNG });
  });
  it("maps every failure to { ok:false, error } and never throws", async () => {
    const mk = (body: unknown, status = 200) => (async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status })) as unknown as typeof fetch;
    expect(await requestRemoveBg(PNG, mk({ ok: false, error: "no_credits" }))).toEqual({ ok: false, error: "no_credits" });
    expect(await requestRemoveBg(PNG, mk({ ok: false, error: "forbidden_role" }, 403))).toEqual({ ok: false, error: "forbidden_role" });
    expect(await requestRemoveBg(PNG, mk("<html>", 502))).toEqual({ ok: false, error: "bad_response" });
    expect(await requestRemoveBg(PNG, mk({ ok: true }, 200))).toEqual({ ok: false, error: "HTTP 200" });
    expect(await requestRemoveBg(PNG, (async () => { throw new Error("offline"); }) as unknown as typeof fetch)).toEqual({ ok: false, error: "offline" });
  });
  it("only png / jpeg / webp data URLs go to the route (it 400s anything else)", () => {
    expect(isRouteImage(PNG)).toBe(true);
    expect(isRouteImage("data:image/jpeg;base64,AA")).toBe(true);
    expect(isRouteImage("data:image/webp;base64,AA")).toBe(true);
    for (const bad of ["data:image/gif;base64,AA", "data:image/svg+xml;base64,AA", "https://x/y.png", "", undefined]) expect(isRouteImage(bad)).toBe(false);
  });
  it("the route still has the contract the request relies on (role gate, image field, size cap)", () => {
    const route = read("app/api/tools/studio/remove-bg/route.ts");
    expect(route).toContain("resolveOpsRole(request)");
    expect(route).toContain("body.image");
    expect(route).toMatch(/MAX_IMAGE_CHARS = 12_000_000/);
  });
});

describe("keepViewAfterSwap", () => {
  it("same pixel size → nothing changes; a shrunk source keeps the crop window and the displayed size", () => {
    const b = { cropX: 10, cropY: 20, width: 100, height: 80, scaleX: 2, scaleY: 3 };
    expect(keepViewAfterSwap(b, 400, 400)).toEqual(b);
    expect(keepViewAfterSwap(b, 400, 200)).toEqual({ cropX: 5, cropY: 10, width: 50, height: 40, scaleX: 4, scaleY: 6 });
    expect(keepViewAfterSwap({ width: 9, height: 9, scaleX: 1, scaleY: 1 }, 0, 50).scaleX).toBe(1);
  });
});

describe("no duplicates, no private copies", () => {
  const vector = read("public/vector-editor.html");
  const canvas = read("app/(shell)/tools/canvas/CanvasEditor.tsx");
  it("vector: the old 去白底 / 去背 and AI 去背 blocks are gone; exactly one 🪄 去背 panel, loaded from the shared module", () => {
    expect(vector).not.toMatch(/id:'bg-remove'|id:'ai-bg'|去白底 \/ 去背|AI 去背（雲端）'/);
    expect((vector.match(/<summary>🪄 去背<\/summary>/g) ?? []).length).toBe(1);
    expect(vector).toMatch(/<script type="module">[^<]*editor-shared\/bg-remove\.js/);
    expect(vector).toMatch(/const LAYER_PROPS=\[[^\]]*'bgOriginal'/);
    expect(vector).not.toMatch(/fetch\('\/api\/tools\/studio\/remove-bg'/); // the request lives in bg-remove.js only
  });
  it("canvas: one 🪄 去背 panel, request / messages from the shared module, bgOriginal persisted", () => {
    expect((canvas.match(/title="🪄 去背"/g) ?? []).length).toBe(1);
    expect(canvas).toContain('from "@/lib/studio/editor-bg-remove"');
    expect(canvas).not.toMatch(/\/api\/tools\/studio\/remove-bg/);
    expect(canvas).toMatch(/"name", "adj", "bgOriginal"/);
  });
  it("both editors: same data-bg-* hooks and the shared messages (no private strings)", () => {
    for (const hook of ["data-bg-color", "data-bg-pick", "data-bg-dist", "data-bg-go", "data-bg-ai", "data-bg-revert", "data-bg-msg", "data-bg-hint"]) {
      expect(vector, `vector ${hook}`).toContain(hook);
      expect(canvas, `canvas ${hook}`).toContain(hook);
    }
    for (const msg of [BG_MSG.busy, BG_MSG.ok, "AI 去背失敗"]) {
      expect(vector).not.toContain(msg);
      expect(canvas).not.toContain(msg);
    }
    expect(vector).toContain("window.AWBG.BG_MSG");
  });
  it("canvas: 去背 sits right after 調色 and before the other AI image tools; vector: 調色 → 去背 → 匯出", () => {
    const i = canvas.indexOf('title="🎨 調色"'), j = canvas.indexOf('title="🪄 去背"'), k = canvas.indexOf('title="🪄 去除 / 生成填色（AI）"');
    expect(i).toBeGreaterThan(0);
    expect(j).toBeGreaterThan(i);
    expect(k).toBeGreaterThan(j);
  });
});
