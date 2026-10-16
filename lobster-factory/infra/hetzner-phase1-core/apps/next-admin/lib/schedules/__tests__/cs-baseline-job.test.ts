// The daily cs_chatwoot_baseline job: re-applies the baseline when it drifted; a client without
// Chatwoot is skipped (same answer the schedules table shows), never an incident.
import { beforeEach, describe, expect, it, vi } from "vitest";

const apply = vi.hoisted(() => vi.fn());
const cis = vi.hoisted(() => ({ value: { organizationId: "o", chatwoot: { accountId: 2, baseUrl: "https://c" } } as Record<string, unknown> }));
vi.mock("@/lib/cs/chatwoot-baseline", () => ({ applyChatwootBaseline: apply }));
vi.mock("@/lib/cs/cis", () => ({ loadCis: vi.fn(async () => cis.value) }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));
vi.mock("@/lib/collect/run", () => ({ runCollection: vi.fn() }));
vi.mock("@/lib/collect/blocks", () => ({}));

const { clientJob } = await import("@/lib/schedules/jobs");
const job = clientJob("cs_chatwoot_baseline")!;

beforeEach(() => {
  apply.mockReset();
  cis.value = { organizationId: "o", chatwoot: { accountId: 2, baseUrl: "https://c" } };
});

describe("cs_chatwoot_baseline job", () => {
  it("re-applies what drifted and says what it changed", async () => {
    apply.mockResolvedValueOnce({ ok: true, changes: [{ kind: "account", field: "auto_resolve_after", from: 0, to: 2880 }] });
    expect(await job.run("o", "rk")).toBe("reapplied auto_resolve_after");
  });

  it("a client without Chatwoot is skipped without touching Chatwoot, and shown as unavailable in the table", async () => {
    cis.value = { organizationId: "o" };
    expect(await job.run("o", "rk")).toBe("skipped: 沒有接 Chatwoot");
    expect(apply).not.toHaveBeenCalled();
    expect(job.unavailable?.({ siteUrl: null, chatwoot: null })).toBe("沒有接 Chatwoot");
  });
});
