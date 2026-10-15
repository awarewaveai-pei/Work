// The one store rule that is not a query: which Postiz integration a new-channel attempt produced (ADR 016 §4).
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase-server", () => ({ getSupabaseWriteClient: () => null }));
const { pickFreshIntegration } = await import("../store");

const int = (id: string, identifier = "facebook") => ({ id, name: id, identifier, picture: null, disabled: false, profile: "" });

describe("pickFreshIntegration", () => {
  it("only a new integration of the platform that no brand owns yet", () => {
    const live = [int("known"), int("owned"), int("other", "x"), int("new")];
    expect(pickFreshIntegration(live, ["known"], new Set(["owned"]), "facebook")?.id).toBe("new");
  });

  // review 2026-10-15 C1: another brand's page connected meanwhile was attached to this brand
  it("never one that already belongs to a brand, and never a guess between two", () => {
    expect(pickFreshIntegration([int("b-page")], [], new Set(["b-page"]), "facebook")).toBeNull();
    expect(pickFreshIntegration([int("one"), int("two")], [], new Set(), "facebook")).toBeNull();
  });
});
