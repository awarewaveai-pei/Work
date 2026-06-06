import { describe, it, expect } from "vitest";
import { createHetznerAdapter, type HetznerAdapterDeps } from "./HetznerHostingAdapter";

const INPUT = {
  siteId: "00000000-0000-0000-0000-000000000001",
  siteName: "Acme Shop",
  organizationId: "00000000-0000-0000-0000-000000000002",
  region: "sin",
  serverType: "cpx21",
  image: "ubuntu-24.04",
};

const FAKE_SECRET_STORE = {
  generateAndStore: async (siteId: string) => ({
    sshPublicKey: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIRealishPublicKeyForTest test@lobster",
    sshCredentialsRef: `vault://LOBSTER_SSH_KEY_${siteId}`,
  }),
};

type Call = { url: string; method: string; body?: any; auth?: string };

/** Scripted Hetzner mock. `servers` = existing-by-label result; create returns a server
 *  that flips to running after `runningAfterPolls` GET /servers/{id} calls. */
function mockHetzner(opts: {
  existing?: any[];
  serverTypes?: string[];
  runningAfterPolls?: number;
  createThrows?: boolean;
}) {
  const calls: Call[] = [];
  let pollCount = 0;
  let pipDeleted = false;
  const json = (obj: any, ok = true) =>
    ({ ok, status: ok ? 200 : 422, statusText: "", text: async () => JSON.stringify(obj) }) as any;

  const fetchImpl = (async (url: any, init: any) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push({ url: u, method, body: init?.body ? JSON.parse(init.body) : undefined, auth: init?.headers?.Authorization });

    // Primary IP lifecycle (teardown): GET returns an unassigned IP until it's DELETEd, then 404.
    if (/\/primary_ips\/999$/.test(u)) {
      if (method === "DELETE") {
        pipDeleted = true;
        return json({ action: { id: 1 } });
      }
      if (method === "GET") {
        return pipDeleted
          ? json({ error: { message: "not_found" } }, false)
          : json({ primary_ip: { id: 999, assignee_id: null } });
      }
    }

    if (method === "GET" && u.includes("/servers?label_selector")) {
      return json({ servers: opts.existing ?? [] });
    }
    if (method === "GET" && u.includes("/server_types")) {
      // include per-location price entry (sin) — the adapter validates location availability
      return json({
        server_types: (opts.serverTypes ?? ["cpx11", "cpx21", "cpx31"]).map((name) => ({
          name,
          prices: [{ location: "sin" }],
        })),
      });
    }
    if (method === "POST" && u.endsWith("/servers")) {
      if (opts.createThrows) return json({ error: { message: "quota exceeded" } }, false);
      return json({
        server: { id: 12345, status: "initializing", public_net: { ipv4: { ip: "203.0.113.10", id: 999 } } },
      });
    }
    if (method === "GET" && /\/servers\/12345$/.test(u)) {
      pollCount += 1;
      const status = pollCount >= (opts.runningAfterPolls ?? 1) ? "running" : "starting";
      return json({ server: { id: 12345, status, public_net: { ipv4: { ip: "203.0.113.10", id: 999 } } } });
    }
    if (method === "DELETE") return json({ action: { id: 1 } });
    return json({ error: { message: `unexpected ${method} ${u}` } }, false);
  }) as unknown as typeof fetch;

  return { fetchImpl, calls };
}

function deps(over: Partial<HetznerAdapterDeps>, fetchImpl: typeof fetch): HetznerAdapterDeps {
  return {
    apiToken: "hz-token-SECRET",
    region: "sin",
    billable: true,
    secretStore: FAKE_SECRET_STORE,
    fetchImpl,
    sleep: async () => {},
    pollIntervalMs: 1,
    pollTimeoutMs: 1000,
    ...over,
  };
}

describe("HetznerHostingAdapter", () => {
  it("dry-run (billable=false) returns a plan and makes NO POST", async () => {
    const { fetchImpl, calls } = mockHetzner({});
    const a = createHetznerAdapter(deps({ billable: false }, fetchImpl));
    const r = await a.provisionServer(INPUT);
    expect(r.outcome).toBe("dry_run");
    if (r.outcome === "dry_run") {
      expect(r.plan.serverType).toBe("cpx21");
      expect(r.plan.region).toBe("sin");
      expect(r.plan.cloudInitBytes).toBeGreaterThan(0);
      expect(r.plan.labels["lobster-site-id"]).toBe(INPUT.siteId);
    }
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("idempotency (C2): reuses an existing server matched by site label", async () => {
    const { fetchImpl, calls } = mockHetzner({
      existing: [{ id: 777, status: "running", public_net: { ipv4: { ip: "203.0.113.7", id: 1 } } }],
    });
    const a = createHetznerAdapter(deps({}, fetchImpl));
    const r = await a.provisionServer(INPUT);
    expect(r.outcome).toBe("reused");
    if (r.outcome === "reused") expect(r.ref.serverId).toBe("777");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("blocks when the requested serverType is not offered (cx deprecated guard)", async () => {
    const { fetchImpl } = mockHetzner({ serverTypes: ["cpx11", "cpx31"] }); // no cpx21
    const a = createHetznerAdapter(deps({}, fetchImpl));
    const r = await a.provisionServer(INPUT);
    expect(r.outcome).toBe("blocked");
    if (r.outcome === "blocked") expect(r.message).toContain("not offered");
  });

  it("provisions: create → poll → running → provisioned ref", async () => {
    const { fetchImpl, calls } = mockHetzner({ runningAfterPolls: 2 });
    const a = createHetznerAdapter(deps({}, fetchImpl));
    const r = await a.provisionServer(INPUT);
    expect(r.outcome).toBe("provisioned");
    if (r.outcome === "provisioned") {
      expect(r.ref.serverId).toBe("12345");
      expect(r.ref.ipv4).toBe("203.0.113.10");
      expect(r.ref.sshHost).toBe("203.0.113.10");
      expect(r.ref.sshCredentialsRef).toMatch(/^vault:\/\//);
    }
    // user_data carries the PUBLIC key, never a private key
    const post = calls.find((c) => c.method === "POST");
    expect(post?.body.user_data).toContain("ssh-ed25519");
    expect(post?.body.user_data).not.toMatch(/PRIVATE KEY/);
    expect(post?.body.labels["lobster-site-id"]).toBe(INPUT.siteId);
  });

  it("rollback (M9): create failure → rolled_back, no orphan", async () => {
    const { fetchImpl, calls } = mockHetzner({ createThrows: true });
    const a = createHetznerAdapter(deps({}, fetchImpl));
    const r = await a.provisionServer(INPUT);
    expect(r.outcome).toBe("rolled_back");
    // create itself failed (no server id) → nothing to delete, but it must not throw
    expect(calls.some((c) => c.method === "POST")).toBe(true);
  });

  it("rollback (M9): poll timeout → DELETE server AND primary_ip (no orphan billing)", async () => {
    const { fetchImpl, calls } = mockHetzner({ runningAfterPolls: 9999 }); // never runs
    const a = createHetznerAdapter(deps({ pollTimeoutMs: 5 }, fetchImpl));
    const r = await a.provisionServer(INPUT);
    expect(r.outcome).toBe("rolled_back");
    const deletes = calls.filter((c) => c.method === "DELETE");
    expect(deletes.some((c) => c.url.includes("/servers/12345"))).toBe(true);
    expect(deletes.some((c) => c.url.includes("/primary_ips/999"))).toBe(true);
  });

  it("sends token only in Authorization header", async () => {
    const { fetchImpl, calls } = mockHetzner({ runningAfterPolls: 1 });
    const a = createHetznerAdapter(deps({}, fetchImpl));
    await a.provisionServer(INPUT);
    for (const c of calls) {
      expect(c.url).not.toContain("SECRET");
      expect(c.auth).toBe("Bearer hz-token-SECRET");
    }
  });
});
