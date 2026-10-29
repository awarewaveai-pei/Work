// @vitest-environment jsdom
//
// ⑦ captions step, mounted for real: the two engines side by side with time and price before a click, and a client
// that keeps audio in-house sees no OpenAI button (the dispatch route refuses it too; this is the visible half).

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import CaptionsStep from "../CaptionsStep";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORG = "123e4567-e89b-42d3-a456-426614174001";
const asset = { id: "a1", object_url: "https://pub.example/a.mp4", byte_size: 5_000_000, created_at: "2026-10-29T00:00:00Z", asset_domain: "uploaded", mime_type: "video/mp4", metadata: { title: "訪談" } };

let container: HTMLDivElement;
let root: Root;

async function mount(externalAllowed: boolean) {
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    const body = url.startsWith("/api/video/assets") ? { items: [asset] }
      : url.startsWith("/api/video/transcription/options") ? { ok: true, hostReady: true, openAiReady: true, externalAllowed, canChangeSetting: true, hostRealtimeFactor: 1, openAiMaxBytes: 25 * 1024 * 1024, openAiUsdPerMin: 0.006, twdRate: 32 }
      : { ok: false, error: "job_not_found" };
    return new Response(JSON.stringify(body), { status: 200 });
  }));
  // jsdom never loads media: fire loadedmetadata with a 200-second video by hand.
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = create(tag);
    if (tag === "video") {
      Object.defineProperty(el, "duration", { value: 200 });
      Object.defineProperty(el, "src", { set() { setTimeout(() => (el as HTMLVideoElement).onloadedmetadata?.(new Event("loadedmetadata")), 0); } });
    }
    return el;
  });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<CaptionsStep organizationId={ORG} projectId="p1" onContinue={() => {}} />); });
  await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
}

afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("CaptionsStep engine choice", () => {
  it("shows both engines with time and price worked out from the video length", async () => {
    await mount(true);
    const text = container.textContent ?? "";
    expect(text).toContain("這支影片長 3 分 20 秒");
    expect(text).toContain("免費轉錄（主機）・約 4 分鐘");
    expect(text).toContain("快速轉錄（OpenAI）・約 NT$0.6");
  });

  it("hides the OpenAI button for a client that keeps audio in-house", async () => {
    await mount(false);
    const text = container.textContent ?? "";
    expect(text).toContain("免費轉錄（主機）");
    expect(text).not.toContain("快速轉錄（OpenAI）");
    expect(text).toContain("這個客戶設定音檔不可外送，只能用主機轉錄");
  });
});
