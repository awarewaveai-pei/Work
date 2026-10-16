// The Chatwoot baseline is idempotent (an account that already has it gets no write) and every
// write sits behind the production-change gate.
import { beforeEach, describe, expect, it, vi } from "vitest";

const gate = vi.fn(async (): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({ allowed: true, mode: "normal" }));
vi.mock("@/lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed: gate }));
const client = vi.hoisted(() => ({
  getAccountSettings: vi.fn(async () => ({})),
  listMacros: vi.fn(async () => []),
  updateAccountSettings: vi.fn(async () => undefined),
  createMacro: vi.fn(async () => undefined),
  updateMacro: vi.fn(async () => undefined),
}));
vi.mock("@/lib/cs/chatwoot-client", () => client);

const { applyChatwootBaseline, desiredChatwootBaseline, planChatwootBaseline } = await import("@/lib/cs/chatwoot-baseline");

const desired = desiredChatwootBaseline({ csVoice: {} });
const config = { accountId: 2, baseUrl: "https://chatwoot.example" };

beforeEach(() => {
  vi.clearAllMocks();
  gate.mockResolvedValue({ allowed: true, mode: "normal" });
});

describe("planChatwootBaseline", () => {
  it("an account that already matches, even with numbers stored as strings, needs no change", () => {
    const current = {
      settings: { auto_resolve_after: String(desired.account.auto_resolve_after), auto_resolve_message: desired.account.auto_resolve_message, auto_resolve_ignore_waiting: false },
      macros: [{ id: 7, ...desired.macros[0] }],
    };
    expect(planChatwootBaseline(desired, current)).toEqual([]);
  });

  it("a fresh account gets auto-resolve (duration + message; unset ignore_waiting already means false) and the macro", () => {
    const changes = planChatwootBaseline(desired, { settings: {}, macros: [] });
    expect(changes.map((c) => c.kind)).toEqual(["account", "account", "macro_create"]);
  });

  it("a macro of the same name with other actions is updated, not duplicated", () => {
    const current = { settings: desired.account as unknown as Record<string, unknown>, macros: [{ id: 9, name: desired.macros[0].name, visibility: "global" as const, actions: [{ action_name: "resolve_conversation", action_params: [] }] }] };
    expect(planChatwootBaseline(desired, current)).toEqual([{ kind: "macro_update", name: desired.macros[0].name, id: 9 }]);
  });
});

describe("applyChatwootBaseline", () => {
  it("a blocking system mode writes nothing to Chatwoot", async () => {
    gate.mockResolvedValueOnce({ allowed: false, mode: "frozen", reason: "x" });
    const r = await applyChatwootBaseline(null, "o", config, { csVoice: {} });
    expect(r.ok).toBe(false);
    expect(client.getAccountSettings).not.toHaveBeenCalled();
    expect(client.updateAccountSettings).not.toHaveBeenCalled();
  });

  it("applies only the difference: existing macro, missing auto-resolve", async () => {
    client.listMacros.mockResolvedValueOnce([{ id: 7, ...desired.macros[0] }]);
    const r = await applyChatwootBaseline(null, "o", config, { csVoice: {} });
    expect(r.ok).toBe(true);
    expect(client.updateAccountSettings).toHaveBeenCalledTimes(1);
    expect(client.createMacro).not.toHaveBeenCalled();
    expect(client.updateMacro).not.toHaveBeenCalled();
  });
});
