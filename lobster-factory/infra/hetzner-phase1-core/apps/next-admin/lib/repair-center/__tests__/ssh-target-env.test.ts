import { afterEach, describe, expect, it, vi } from "vitest";
import { readSshTargetFromEnv } from "../ssh";

// readSshTargetFromEnv: explicit mode (hosting bridge) refuses the root/22 defaults Auto-Repair keeps.
const P = "AW_TEST_TARGET";
const FULL = { HOST: "h", PORT: "58122", USER: "root", KEY_B64: Buffer.from("-----BEGIN OPENSSH PRIVATE KEY-----x").toString("base64"), HOST_KEY_SHA256: "ab" };
function setEnv(vals: Partial<typeof FULL>) {
  for (const k of Object.keys(FULL)) delete process.env[`${P}_SSH_${k}`];
  for (const [k, v] of Object.entries(vals)) process.env[`${P}_SSH_${k}`] = v;
}
afterEach(() => { setEnv({}); vi.restoreAllMocks(); });

describe("readSshTargetFromEnv", () => {
  it("explicit: all five set → target with the given port/user", () => {
    setEnv(FULL);
    expect(readSshTargetFromEnv(P, { explicit: true })).toMatchObject({ host: "h", port: 58122, username: "root", hostKeyFingerprint: "ab" });
  });

  it.each(["PORT", "USER"] as const)("explicit: missing %s → null (no silent default)", (k) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { [k]: _omit, ...rest } = FULL;
    setEnv(rest);
    expect(readSshTargetFromEnv(P, { explicit: true })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${P}_SSH_${k}`));
  });

  it.each([
    ["PORT", "not-a-number"], ["PORT", "0"], ["PORT", "65536"], ["PORT", "22x"],
    ["USER", "root;id"], ["USER", "Root"],
  ] as const)("explicit: invalid %s=%s → null (no coercion to a default, codex r2)", (k, v) => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    setEnv({ ...FULL, [k]: v });
    expect(readSshTargetFromEnv(P, { explicit: true })).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(`${P}_SSH_${k}`));
  });

  it("default mode keeps the Auto-Repair defaults (port 22, root)", () => {
    const { PORT: _p, USER: _u, ...rest } = FULL;
    setEnv(rest);
    expect(readSshTargetFromEnv(P)).toMatchObject({ port: 22, username: "root" });
  });

  it("both modes: missing host-key fingerprint → null", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { HOST_KEY_SHA256: _h, ...rest } = FULL;
    setEnv(rest);
    expect(readSshTargetFromEnv(P)).toBeNull();
    expect(readSshTargetFromEnv(P, { explicit: true })).toBeNull();
  });
});
