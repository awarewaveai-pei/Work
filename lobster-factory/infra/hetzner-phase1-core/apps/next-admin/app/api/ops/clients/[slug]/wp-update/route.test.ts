// T17: checkProductionChangeAllowed gates this route before any SSH connection or audit-run
// write. checkProductionChangeAllowed itself is mocked (covered by
// lib/system-modes/__tests__/production-change-gate.test.ts) -- this file only proves the wiring.
// The ssh2 Client here never fires "ready"/"error" -- the point is only to observe that a
// connection attempt was made, not to run a real WP-CLI update.
import type { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const checkProductionChangeAllowed = vi.hoisted(() =>
  vi.fn(async (_client: unknown, _org: string | null): Promise<{ allowed: boolean; mode: string; reason?: string }> => ({
    allowed: true,
    mode: "normal",
  })),
);
vi.mock("../../../../../../lib/system-modes/production-change-gate", () => ({ checkProductionChangeAllowed }));

const beginOpsActionRun = vi.hoisted(() => vi.fn(async () => "run-1"));
const finishOpsActionRun = vi.hoisted(() => vi.fn(async () => {}));
vi.mock("../../../../../../lib/ops-actions/record", () => ({ beginOpsActionRun, finishOpsActionRun }));

vi.mock("../../../../../../lib/ops-role", () => ({
  resolveOpsRole: () => ({ role: "operator" }),
  canSyncWpReport: () => true,
}));

vi.mock("../../../../../../lib/ops-inbox/verifyIngestToken", () => ({ timingSafeEqual: () => false }));

const ORG_ROW = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "acme",
  name: "Acme",
  metadata: {
    client_config: {
      ssh_host: "h", ssh_user: "root", ssh_port: 22, ssh_key_name: "acme", wp_path: "/var/www/html",
      waves: { wave1: ["some-plugin"], wave2: [], wave3: [] },
    },
  },
};

function fakeSupabase() {
  const maybeSingle = vi.fn(async () => ({ data: ORG_ROW, error: null }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select, update: () => ({ eq: async () => ({}) }) }));
  return { from };
}

const getSupabaseServerClient = vi.hoisted(() => vi.fn());
const getSupabaseWriteClient = vi.hoisted(() => vi.fn());
vi.mock("../../../../../../lib/supabase-server", () => ({ getSupabaseServerClient, getSupabaseWriteClient }));

const sshConnect = vi.hoisted(() => vi.fn());
vi.mock("ssh2", () => ({
  Client: class {
    on() {
      return this;
    }
    connect() {
      sshConnect();
      // Never fires "ready"/"error" -- connectSsh()'s promise stays pending forever, harmless: we
      // only assert that a connection attempt was made, never wait for it to settle.
    }
    end() {}
  },
}));

const { POST } = await import("./route");

function post(wave = "wave1") {
  const request = new Request(`http://localhost/api/ops/clients/acme/wp-update`, {
    method: "POST",
    body: JSON.stringify({ wave }),
  });
  return POST(request as unknown as NextRequest, { params: Promise.resolve({ slug: "acme" }) });
}

beforeEach(() => {
  checkProductionChangeAllowed.mockClear();
  beginOpsActionRun.mockClear();
  sshConnect.mockClear();
  getSupabaseServerClient.mockReturnValue(fakeSupabase());
  getSupabaseWriteClient.mockReturnValue(fakeSupabase());
  process.env.SSH_KEY_ACME = Buffer.from("fake-key").toString("base64");
});

afterEach(() => {
  delete process.env.SSH_KEY_ACME;
});

describe("POST /api/ops/clients/[slug]/wp-update -- system-mode gate", () => {
  it("blocked: 423 with system_mode_blocks_change, no SSH connection and no audit run", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "emergency_stop", reason: "system in emergency_stop" });
    const res = await post();
    expect(res.status).toBe(423);
    expect(await res.json()).toEqual({ error: "system_mode_blocks_change", mode: "emergency_stop" });
    expect(sshConnect).not.toHaveBeenCalled();
    expect(beginOpsActionRun).not.toHaveBeenCalled();
  });

  it("allowed: continues past the gate to the SSH connection attempt", async () => {
    const res = await post();
    expect(res.status).toBe(200); // SSE stream started
    await vi.waitFor(() => expect(sshConnect).toHaveBeenCalled());
  });

  it("gates on the org row's own id (looked up from the slug), not the slug itself", async () => {
    checkProductionChangeAllowed.mockResolvedValueOnce({ allowed: false, mode: "unavailable", reason: "system_modes unreadable (fail closed)" });
    await post();
    expect(checkProductionChangeAllowed).toHaveBeenCalledWith(expect.anything(), ORG_ROW.id);
  });
});

// WpUpdateButtons.tsx (line ~58) calls this route as
// `POST .../wp-update?wave=${wave}` with NO body -- the route used to only read a JSON body, so
// request.json() on the empty body threw and every click was a 400 "Invalid JSON". Query now wins
// when present; the body read only happens as a fallback.
describe("POST /api/ops/clients/[slug]/wp-update -- wave from query parameter (button fix)", () => {
  function postQuery(wave: string | null) {
    const url = `http://localhost/api/ops/clients/acme/wp-update${wave !== null ? `?wave=${wave}` : ""}`;
    const request = new Request(url, { method: "POST" }); // no body -- exactly what WpUpdateButtons.tsx sends
    return POST(request as unknown as NextRequest, { params: Promise.resolve({ slug: "acme" }) });
  }

  it("?wave=wave1 with no body is not a 400 (reaches the gate/SSH path, same as a JSON-body call)", async () => {
    const res = await postQuery("wave1");
    expect(res.status).not.toBe(400);
    expect(res.status).toBe(200);
  });

  it("no query and no body: 400 (both are missing, same as before)", async () => {
    const res = await postQuery(null);
    expect(res.status).toBe(400);
  });
});
