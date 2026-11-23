import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { organizationGroupId } from "@/lib/analytics-group";

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";
const get = (url: string, headers: Record<string, string> = {}) =>
  GET(new Request(`http://x/api/ops/analytics-context${url}`, { headers })).then((r) => r.json());

describe("organizationGroupId", () => {
  it("is stable: 16 hex characters, same input same output, different input different output", () => {
    expect(organizationGroupId(A)).toMatch(/^[0-9a-f]{16}$/);
    expect(organizationGroupId(A)).toBe(organizationGroupId(A));
    expect(organizationGroupId(A)).not.toBe(organizationGroupId(B));
  });
});

describe("analytics-context", () => {
  it("a customer gets the hash of its own organization; the raw id is nowhere in the response", async () => {
    const j = await get("", { "x-ops-org-id": A, "x-ops-user-kind": "client" });
    expect(j.group).toBe(organizationGroupId(A));
    expect(Object.keys(j).sort()).toEqual(["group", "role", "source"]);
    expect(JSON.stringify(j)).not.toContain(A);
  });
  it("a customer cannot ask for another organization's hash", async () => {
    expect((await get(`?org=${B}`, { "x-ops-org-id": A, "x-ops-user-kind": "client" })).group).toBe(organizationGroupId(A));
  });
  it("staff: no group without ?org, the hash of the picked client with it, nothing for a non-uuid", async () => {
    expect((await get("")).group).toBeNull();
    expect((await get(`?org=${B}`)).group).toBe(organizationGroupId(B));
    expect((await get("?org=not-a-uuid")).group).toBeNull();
  });
});
