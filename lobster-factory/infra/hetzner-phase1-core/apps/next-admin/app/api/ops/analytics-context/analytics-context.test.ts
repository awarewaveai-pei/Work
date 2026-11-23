import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("analytics-context", () => {
  it("returns the customer's organization id from the middleware header, nothing else personal", async () => {
    const res = await GET(new Request("http://x/api/ops/analytics-context", { headers: { "x-ops-org-id": "org-1", "x-ops-user-kind": "client" } }));
    const j = await res.json();
    expect(j.org).toBe("org-1");
    expect(Object.keys(j).sort()).toEqual(["org", "role", "source"]);
  });
  it("staff have no org", async () => {
    const j = await (await GET(new Request("http://x/api/ops/analytics-context"))).json();
    expect(j.org).toBeNull();
  });
});
