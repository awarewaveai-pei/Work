// T19: the orchestrator gates at the very start (right after input validation), before touching any
// provider. @trigger.dev/sdk's task() is mocked to just return its config object (exposing `.run`
// directly); provider/webhook calls are spies so a blocked run can be proven to have reached none of
// them. Supabase access goes through global.fetch (supabaseRestQuery), stubbed per-test.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runMockedTask } from "../test-utils/runMockedTask";

vi.mock("@trigger.dev/sdk", () => ({ task: (def: unknown) => def, logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
const postWebhook = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../lib/tenant-provisioning/postTenantIntegrationWebhook", () => ({ postTenantIntegrationWebhook: postWebhook }));
const runProviderStep = vi.hoisted(() => vi.fn(async () => ({ ok: true as const, secretRef: undefined, externalHint: undefined, apiMetadata: undefined, status: undefined })));
vi.mock("../lib/tenant-provisioning/providers/registry", () => ({ runProviderStep }));
vi.mock("../observability/posthog", () => ({ captureWorkflowEvent: vi.fn() }));
vi.mock("../observability/sentry", () => ({ captureWorkflowException: vi.fn() }));

const ORG_ID = "33333333-3333-4333-8333-333333333333";
type OrchestrationResult = {
  results: Array<{ ok: boolean }>;
  status?: string;
  mode?: string;
};
process.env.LOBSTER_SUPABASE_URL = "https://x.supabase.co";
process.env.LOBSTER_SUPABASE_SERVICE_ROLE_KEY = "test-key";

const originalFetch = global.fetch;
afterEach(() => {
  global.fetch = originalFetch;
});
beforeEach(() => {
  postWebhook.mockClear();
  runProviderStep.mockClear();
});

function fetchReturningSystemModeRows(rows: unknown[] | null, error = false) {
  return vi.fn(async (url: string) => {
    if (String(url).includes("/system_modes")) {
      if (error) return new Response("boom", { status: 500 });
      return new Response(JSON.stringify(rows ?? []), { status: 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const PAYLOAD = { organizationId: ORG_ID, customerEmail: "a@b.com", providers: ["github"] };

describe("orchestrate-tenant-provisioning -- system-mode gate", () => {
  it("blocked: a terminal result (never a throw -- a retried throw would run after the mode flips back), no provider touched", async () => {
    global.fetch = fetchReturningSystemModeRows([
      { scope_type: "global", scope_id: null, mode: "emergency_stop" },
    ]) as unknown as typeof fetch;

    const { orchestrateTenantProvisioning } = await import("./orchestrate-tenant-provisioning");
    await expect(runMockedTask<OrchestrationResult>(orchestrateTenantProvisioning, PAYLOAD)).resolves.toEqual({ status: "blocked_system_mode", mode: "emergency_stop", results: [] });
    expect(runProviderStep).not.toHaveBeenCalled();
    expect(postWebhook).not.toHaveBeenCalled();
  });

  it("allowed: proceeds to run the provider step", async () => {
    global.fetch = fetchReturningSystemModeRows([
      { scope_type: "global", scope_id: null, mode: "normal" },
    ]) as unknown as typeof fetch;

    const { orchestrateTenantProvisioning } = await import("./orchestrate-tenant-provisioning");
    const result = await runMockedTask<OrchestrationResult>(orchestrateTenantProvisioning, PAYLOAD);
    expect(runProviderStep).toHaveBeenCalled();
    expect(result.results[0].ok).toBe(true);
  });

  it("a system_modes read error also blocks (fail closed)", async () => {
    global.fetch = fetchReturningSystemModeRows(null, true) as unknown as typeof fetch;
    const { orchestrateTenantProvisioning } = await import("./orchestrate-tenant-provisioning");
    await expect(runMockedTask<OrchestrationResult>(orchestrateTenantProvisioning, PAYLOAD)).resolves.toMatchObject({ status: "blocked_system_mode", mode: "unavailable" });
    expect(runProviderStep).not.toHaveBeenCalled();
  });

  it("gates using the payload's organizationId", async () => {
    const spy = fetchReturningSystemModeRows([{ scope_type: "global", scope_id: null, mode: "normal" }]);
    global.fetch = spy as unknown as typeof fetch;

    const { orchestrateTenantProvisioning } = await import("./orchestrate-tenant-provisioning");
    await runMockedTask<OrchestrationResult>(orchestrateTenantProvisioning, PAYLOAD);

    const modeQuery = spy.mock.calls.map((c) => String(c[0])).find((u) => u.includes("/system_modes"));
    expect(modeQuery).toContain(ORG_ID);
  });
});
