// Codex 2026-11-12 F2: background removal is billed per GPU second, so the hold covers the longest run this route waits
// for (replicate-run.ts DEFAULT_TIMEOUT_MS) and the charge is the run time Replicate reports.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { replicateRunUsd } from "@/lib/ai/cost-model";

const m = vi.hoisted(() => ({ held: [] as number[], logged: [] as number[], remove: vi.fn() }));
vi.mock("@/lib/entitlements/grant", () => ({
  withFeature: (_k: string, h: (r: Request, g: unknown) => Promise<Response>) => (r: Request) => h(r, { kind: "internal" }),
}));
vi.mock("../../../../../lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "operator" }), canCreateAiImageJob: () => true }));
vi.mock("../../../../../lib/studio/bg-remover", () => ({ removeBackground: m.remove }));
vi.mock("../../../../../lib/ai/log-ai-call", () => ({
  holdCost: async (_g: unknown, usd: number) => (m.held.push(usd), { id: "h1" }),
  logImageCost: (a: { costUsd: number }) => void m.logged.push(a.costUsd),
  releaseHold: () => undefined,
}));

import { POST } from "./route";

beforeEach(() => {
  vi.stubEnv("POD_DESIGNS_ENABLED", "true");
  m.held = []; m.logged = [];
});

describe("POST /api/tools/studio/remove-bg", () => {
  it("holds the timeout's worth of GPU seconds and charges the reported run time", async () => {
    m.remove.mockResolvedValue({ ok: true, image: "data:image/png;base64,QUJD", predictSec: 50 });
    const res = await POST(new Request("http://localhost/api/tools/studio/remove-bg", { method: "POST", body: JSON.stringify({ image: "data:image/png;base64,QUJD" }) }));
    expect(await res.json()).toMatchObject({ ok: true });
    expect(m.held).toEqual([replicateRunUsd("bg-remove", 55)]);
    expect(m.logged).toEqual([replicateRunUsd("bg-remove", 50)]);
    expect(m.logged[0]).toBeLessThanOrEqual(m.held[0]);
  });
});
