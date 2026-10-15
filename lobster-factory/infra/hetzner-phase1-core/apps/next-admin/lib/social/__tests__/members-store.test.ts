// The member functions' refusals (0103) reach the owner as fixed words with the right status, never the database text.
import { describe, expect, it, vi } from "vitest";

let rpcError: { code?: string; message: string } | null = null;
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseWriteClient: () => ({ rpc: async () => ({ data: null, error: rpcError }) }),
}));
const { addMember, removeMember, setMemberRole, SocialStoreError } = await import("../store");

const A = "11111111-1111-4111-8111-111111111111";
const U = "22222222-2222-4222-8222-222222222222";

async function refusal(run: () => Promise<unknown>): Promise<InstanceType<typeof SocialStoreError>> {
  try { await run(); } catch (e) { if (e instanceof SocialStoreError) return e; throw e; }
  throw new Error("expected a refusal");
}

describe("member refusals", () => {
  it.each([
    [{ code: "SC404", message: "no account with this email" }, 404, /還沒有帳號/],
    [{ code: "SC409", message: "already a member of this brand" }, 409, /已經是/],
    [{ code: "22023", message: "this email matches more than one account" }, 409, /不只一個帳號/],
  ])("add: %j -> %s", async (err, status, words) => {
    rpcError = err;
    const e = await refusal(() => addMember(A, "ann@example.com", "editor", "ops:owner"));
    expect(e.status).toBe(status);
    expect(e.message).toMatch(words);
    expect(e.message).not.toMatch(/[a-z]{6,}/);   // no database English leaks through
  });

  it("the last owner stays, on a role change and on a removal", async () => {
    rpcError = { code: "SC409", message: "the last owner stays: make someone else owner first" };
    for (const run of [() => setMemberRole(A, U, "editor", "x"), () => removeMember(A, U, "x")]) {
      const e = await refusal(run);
      expect(e.status).toBe(409);
      expect(e.message).toMatch(/至少要留一位擁有者/);
    }
  });

  it("anything else stays a 500 with its context (an outage is not an owner's mistake)", async () => {
    rpcError = { code: "57014", message: "canceling statement due to statement timeout" };
    const e = await refusal(() => removeMember(A, U, "x"));
    expect(e.status).toBe(500);
  });
});
