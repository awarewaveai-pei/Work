import { describe, expect, it, vi } from "vitest";
import fs from "fs";
import path from "path";

// Like Next's Data Cache: a resolved value is kept, a thrown read is not.
vi.mock("next/cache", () => ({
  unstable_cache: <T,>(fn: () => Promise<T>) => {
    let hit: { v: T } | null = null;
    return async () => (hit ??= { v: await fn() }).v;
  },
  revalidateTag: () => {},
}));

let reply: () => unknown = () => ({ data: null });
vi.mock("@/lib/supabase-server", () => ({
  getSupabaseServerClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => reply() }) }) }),
  }),
}));

describe("theme config read", () => {
  it("a failed read falls back to defaults but is not cached; the next read gets the saved theme", async () => {
    const { getThemeConfig } = await import("../store");
    reply = () => ({ data: null, error: { message: "boom" } });
    expect(await getThemeConfig()).toEqual({ tokens: {}, layout: null });
    reply = () => ({ data: { tokens: { "--accent": "#00663f" }, layout: null } });
    expect((await getThemeConfig()).tokens).toEqual({ "--accent": "#00663f" });
  });

  it("the root layout renders per request, so no prerendered page ships without the theme", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../../app/layout.tsx"), "utf8");
    expect(src).toMatch(/export const dynamic = "force-dynamic"/);
  });
});
