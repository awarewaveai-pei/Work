import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";

// Unit tests for connectSsh()'s host-key pinning (added WORKLOG 2026-09-23 續107, after codex-review
// flagged that connectSsh() accepted ANY host key -- the same incident class where a retired IP got
// silently reassigned to a third party). Mocks ssh2's Client so no real network I/O happens; asserts
// the exact contract connectSsh() has with ssh2's hostVerifier/hostHash wiring (verified by reading
// node_modules/ssh2/lib/client.js: hostVerifier receives the lowercase hex sha256 of the raw host key
// when hostHash:'sha256' is set, and calling `verify(false)` is how a mismatch is signalled upstream).

const HASH_OK = "a".repeat(64);
const HASH_WRONG = "b".repeat(64);

type ConnectOpts = { hostHash?: string; hostVerifier?: (hash: string) => boolean };

class FakeSshChannel extends EventEmitter {
  stderr = new EventEmitter();
}

class FakeSshClient extends EventEmitter {
  connectOpts: ConnectOpts | undefined;
  connect(opts: ConnectOpts) {
    this.connectOpts = opts;
    // Mirror ssh2's own client.js wiring (read at node_modules/ssh2/lib/client.js:273-287): the
    // library calls hostVerifier itself and only proceeds to 'ready' if it returns/verifies true.
    if (opts.hostVerifier) {
      const ok = opts.hostVerifier(HASH_OK);
      if (!ok) return; // the real lib does not emit 'ready'; connectSsh must reject via its own path
    }
    process.nextTick(() => this.emit("ready"));
  }
  end() {}
  // Real ssh.ts's sshExec() (left unmocked in this file) drives this exactly like a real ssh2
  // ClientChannel: data on the stream, data on stream.stderr, then a close with an exit code.
  // Always answers "OK" -- these route.ts-level tests only need to distinguish "no attempt was
  // made" (fail-closed, unconfigured) from "an attempt was made and this transport answered".
  exec(_command: string, callback: (err: Error | null, stream: FakeSshChannel) => void) {
    const stream = new FakeSshChannel();
    callback(null, stream);
    process.nextTick(() => {
      stream.emit("data", Buffer.from("OK\n"));
      stream.emit("close", 0);
    });
  }
}

vi.mock("ssh2", () => ({ Client: FakeSshClient }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseServerClient: () => null }));
vi.mock("@/lib/repair-center/service", () => ({ getCurrentSystemMode: async () => "normal" }));

afterEach(() => {
  vi.resetModules();
});

const BASE_TARGET = { host: "host.docker.internal", port: 58122, username: "root", privateKey: "k" };

describe("connectSsh host-key pinning (low-level primitive -- see readSshTarget below for the production fail-closed wrapper)", () => {
  it("primitive-level: connects without hostHash/hostVerifier when called directly with no fingerprint, and warns loudly", async () => {
    // connectSsh() itself stays permissive-with-a-warning by design (round 1's original fix); round 3
    // (WORKLOG 續107) correctly rejected relying on that alone for production and made readSshTarget()
    // /statRemoteScript() refuse to ever construct a target that reaches this path in practice. This
    // test documents connectSsh()'s own primitive-level contract, not an endorsement of using it this way.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { connectSsh } = await import("../ssh");
    const conn = (await connectSsh(BASE_TARGET)) as unknown as FakeSshClient;
    expect(conn.connectOpts?.hostHash).toBeUndefined();
    expect(conn.connectOpts?.hostVerifier).toBeUndefined();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("no hostKeyFingerprint pinned"));
    warn.mockRestore();
  });

  it("passes hostHash:'sha256' and accepts a matching fingerprint (case-insensitive)", async () => {
    const { connectSsh } = await import("../ssh");
    const conn = (await connectSsh({ ...BASE_TARGET, hostKeyFingerprint: HASH_OK.toUpperCase() })) as unknown as FakeSshClient;
    expect(conn.connectOpts?.hostHash).toBe("sha256");
    expect(typeof conn.connectOpts?.hostVerifier).toBe("function");
  });

  it("rejects with HostKeyMismatchError when the presented key does not match, and never resolves", async () => {
    const { connectSsh, HostKeyMismatchError } = await import("../ssh");
    await expect(connectSsh({ ...BASE_TARGET, hostKeyFingerprint: HASH_WRONG })).rejects.toBeInstanceOf(HostKeyMismatchError);
  });

  it("mismatch error message names the host and port without leaking the key material", async () => {
    const { connectSsh } = await import("../ssh");
    await expect(connectSsh({ ...BASE_TARGET, hostKeyFingerprint: HASH_WRONG })).rejects.toThrow(
      /host_key_mismatch.*host\.docker\.internal:58122/,
    );
  });
});

describe("readSshTarget: production wrapper fails closed on a missing host-key fingerprint", () => {
  // codex-review round 3 (WORKLOG 續107): "require a valid SHA-256 fingerprint and add a
  // regression test that missing or malformed fingerprints reject before connection." This is
  // that test -- for readSshTarget, the actual entry point every real caller (backup.ts,
  // evidence.ts, remediations) uses. route.ts's own inline statRemoteScript() applies the
  // identical rule independently (it doesn't go through readSshTarget); not covered here since
  // route.ts doesn't export that function -- see autorepair-gate-contract.test.ts's beforeAll,
  // which exercises route.ts's GET() (with ssh.ts fully mocked for its own, different purpose).
  const KEYS = [
    "AUTO_REPAIR_SG_SSH_HOST",
    "AUTO_REPAIR_SG_SSH_USER",
    "AUTO_REPAIR_SG_SSH_PORT",
    "AUTO_REPAIR_SG_SSH_KEY_B64",
    "AUTO_REPAIR_SG_SSH_HOST_KEY_SHA256",
    "AUTO_REPAIR_EU_SSH_HOST",
    "AUTO_REPAIR_EU_SSH_USER",
    "AUTO_REPAIR_EU_SSH_PORT",
    "AUTO_REPAIR_EU_SSH_KEY_B64",
    "AUTO_REPAIR_EU_SSH_HOST_KEY_SHA256",
  ];
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("returns a target (with the fingerprint threaded through) when host, key, and fingerprint are all set", async () => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.AUTO_REPAIR_SG_SSH_HOST = "host.docker.internal";
    process.env.AUTO_REPAIR_SG_SSH_KEY_B64 = "a2V5"; // "key"
    process.env.AUTO_REPAIR_SG_SSH_HOST_KEY_SHA256 = HASH_OK;

    const { readSshTarget } = await import("../ssh");
    expect(readSshTarget("SG")).toMatchObject({ host: "host.docker.internal", hostKeyFingerprint: HASH_OK });
  });

  it("returns null -- same as 'not configured' -- when host and key are set but the fingerprint is missing", async () => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.AUTO_REPAIR_EU_SSH_HOST = "host.docker.internal";
    process.env.AUTO_REPAIR_EU_SSH_KEY_B64 = "a2V5";
    delete process.env.AUTO_REPAIR_EU_SSH_HOST_KEY_SHA256;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { readSshTarget } = await import("../ssh");
    expect(readSshTarget("EU")).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("AUTO_REPAIR_EU_SSH_HOST_KEY_SHA256 is not set"));
    warn.mockRestore();
  });

  it("returns null when the fingerprint env var is set but blank/whitespace-only", async () => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.AUTO_REPAIR_SG_SSH_HOST = "host.docker.internal";
    process.env.AUTO_REPAIR_SG_SSH_KEY_B64 = "a2V5";
    process.env.AUTO_REPAIR_SG_SSH_HOST_KEY_SHA256 = "   ";
    vi.spyOn(console, "warn").mockImplementation(() => {});

    const { readSshTarget } = await import("../ssh");
    expect(readSshTarget("SG")).toBeNull();
  });
});

describe("route.ts's own inline SshTarget construction fails closed the same way", () => {
  // route.ts's statRemoteScript() doesn't go through readSshTarget (it builds a target from flat
  // args), so it needs its own regression test. ssh2/supabase-server/service are mocked above (file
  // scope); ssh.ts is intentionally left UNMOCKED here so the real fail-closed guard runs. No real
  // network I/O happens either way: a missing fingerprint returns "unconfigured" before any connect
  // attempt, so this is fast and deterministic, not a live-network test.
  const KEYS = [
    "AUTO_REPAIR_SG_SSH_HOST",
    "AUTO_REPAIR_SG_SSH_PORT",
    "AUTO_REPAIR_SG_SSH_USER",
    "AUTO_REPAIR_SG_SSH_KEY_B64",
    "AUTO_REPAIR_SG_SSH_HOST_KEY_SHA256",
    "AUTO_REPAIR_EU_SSH_HOST",
    "AUTO_REPAIR_EU_SSH_PORT",
    "AUTO_REPAIR_EU_SSH_USER",
    "AUTO_REPAIR_EU_SSH_KEY_B64",
    "AUTO_REPAIR_EU_SSH_HOST_KEY_SHA256",
    "AUTO_REPAIR_REQUIRE_EU_BACKUP",
  ];
  const saved: Record<string, string | undefined> = {};

  afterEach(() => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  });

  it("backup_script_probe and auto_reboot report 'unconfigured', not an attempted connection, when the fingerprint is missing", async () => {
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.AUTO_REPAIR_SG_SSH_HOST = "host.docker.internal";
    process.env.AUTO_REPAIR_SG_SSH_KEY_B64 = "a2V5";
    delete process.env.AUTO_REPAIR_SG_SSH_HOST_KEY_SHA256; // the case under test
    process.env.AUTO_REPAIR_EU_SSH_HOST = "host.docker.internal";
    process.env.AUTO_REPAIR_EU_SSH_KEY_B64 = "a2V5";
    delete process.env.AUTO_REPAIR_EU_SSH_HOST_KEY_SHA256;
    process.env.AUTO_REPAIR_REQUIRE_EU_BACKUP = "true";

    const start = Date.now();
    const { GET } = await import("@/app/api/ops/repairs/health/route");
    const res = await GET();
    const body = await res.json();
    // Generous bound, not a tight timing assertion: the point is "no network round trip was
    // attempted," which a real SSH connect to a real port would take far longer than this either
    // way (connect timeout is 5000ms per probe) -- this just rules out an accidental real attempt.
    expect(Date.now() - start).toBeLessThan(2000);
    expect(body.backup_script_probe).toEqual({ sg: "unconfigured", eu: "unconfigured" });
    expect(body.auto_reboot.sg).toBe("unconfigured");
    expect(body.auto_reboot.eu).toBe("unconfigured");
  });

  it("reports 'ok' via the real fail-closed-then-pinned path once the fingerprint is set and the target is reachable", async () => {
    // Full loop, real ssh.ts + real statRemoteScript, mocked ssh2 transport only: proves the
    // fingerprint being present is what flips 'unconfigured' back to an actual attempt.
    for (const k of KEYS) saved[k] = process.env[k];
    process.env.AUTO_REPAIR_SG_SSH_HOST = "host.docker.internal";
    process.env.AUTO_REPAIR_SG_SSH_KEY_B64 = "a2V5";
    process.env.AUTO_REPAIR_SG_SSH_HOST_KEY_SHA256 = HASH_OK;
    process.env.AUTO_REPAIR_EU_SSH_HOST = "host.docker.internal";
    process.env.AUTO_REPAIR_EU_SSH_KEY_B64 = "a2V5";
    process.env.AUTO_REPAIR_EU_SSH_HOST_KEY_SHA256 = HASH_OK;
    process.env.AUTO_REPAIR_REQUIRE_EU_BACKUP = "true";

    const { GET } = await import("@/app/api/ops/repairs/health/route");
    const res = await GET();
    const body = await res.json();
    expect(body.backup_script_probe).toEqual({ sg: "ok", eu: "ok" });
  });
});
