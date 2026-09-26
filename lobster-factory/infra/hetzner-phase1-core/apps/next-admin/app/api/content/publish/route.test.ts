// content/publish is the HTTP shell of publishToWordPress: a gate block (failure carrying `mode`) must go
// out as the shared 423 contract; every other failure keeps its text/json wire shape.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { blockedChangeBody } from "@/lib/system-modes/blocked-change";

vi.mock("@/lib/ops-role", () => ({ resolveOpsRole: () => ({ role: "owner" }), canCreateAiImageJob: () => true }));

const publishToWordPress = vi.hoisted(() => vi.fn(async (): Promise<Record<string, unknown>> => ({ ok: true, post_id: 1 })));
vi.mock("@/lib/content/publish/wordpress-core", () => ({ publishToWordPress }));

const { POST } = await import("./route");

const post = () => POST(new Request("http://localhost/api/content/publish", { method: "POST", body: JSON.stringify({ markdown: "# x" }) }));

beforeEach(() => publishToWordPress.mockClear());

describe("POST /api/content/publish -- failure wire shapes", () => {
  it("gate block: the shared 423 body", async () => {
    publishToWordPress.mockResolvedValueOnce({ ok: false, status: 423, error: "system_mode_blocks_change", wire: "json", mode: "read_only" });
    const res = await post();
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual(blockedChangeBody("read_only"));
  });

  it("other json failure: {ok:false,error} with its own status", async () => {
    publishToWordPress.mockResolvedValueOnce({ ok: false, status: 502, error: "bridge: boom", wire: "json" });
    const res = await post();
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ ok: false, error: "bridge: boom" });
  });

  it("text failure stays text", async () => {
    publishToWordPress.mockResolvedValueOnce({ ok: false, status: 400, error: "markdown required", wire: "text" });
    const res = await post();
    expect(res.status).toBe(400);
    expect(await res.text()).toBe("markdown required");
  });
});
