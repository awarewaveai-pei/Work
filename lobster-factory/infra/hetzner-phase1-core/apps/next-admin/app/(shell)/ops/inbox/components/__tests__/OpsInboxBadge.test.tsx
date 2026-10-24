// @vitest-environment jsdom
//
// The badge is the only alert signal on a collapsed sidebar section, and /api/ops/inbox/health
// answers 503 (counts still in the body) exactly when the probe is stale.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OpsInboxBadge } from "../OpsInboxBadge";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

async function mountWith(status: number, body: unknown) {
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(body), { status })));
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(<OpsInboxBadge />); });
  await act(async () => { await Promise.resolve(); });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("OpsInboxBadge", () => {
  it("shows the open count from a 503 health answer", async () => {
    await mountWith(503, { ok: false, open_count: 3, critical_count: 1 });
    expect(container.textContent).toBe("3");
  });

  it("shows nothing when the answer has no counts (db unavailable)", async () => {
    await mountWith(503, { ok: false, error: "db unavailable" });
    expect(container.textContent).toBe("");
  });
});
