// canTopUp = aware-wave.com's seller_sites row is active; a missing client, missing row or failed read = false.
import { beforeEach, describe, expect, it, vi } from "vitest";

const find = vi.hoisted(() => vi.fn());
const db = vi.hoisted(() => ({ client: {} as object | null }));
vi.mock("@/lib/payments/sites", () => ({ AWARE_WAVE_KEY_ID: "aware-wave-com", findSiteByKeyId: find }));
vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => db.client }));

import { canTopUp } from "../can-top-up";

describe("canTopUp", () => {
  beforeEach(() => { find.mockReset(); db.client = {}; });
  it("true only for an active row of aware-wave-com", async () => {
    find.mockResolvedValue({ status: "active" });
    expect(await canTopUp()).toBe(true);
    expect(find).toHaveBeenCalledWith(db.client, "aware-wave-com");
  });
  it("disabled, pending, no row, no client, read failure: false", async () => {
    for (const row of [{ status: "disabled" }, { status: "pending" }, null]) { find.mockResolvedValue(row); expect(await canTopUp()).toBe(false); }
    find.mockRejectedValue(new Error("db down")); expect(await canTopUp()).toBe(false);
    db.client = null; expect(await canTopUp()).toBe(false);
  });
});
