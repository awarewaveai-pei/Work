import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const routeMocks = vi.hoisted(() => ({
  createServerClient: vi.fn(() => ({})),
  cookies: vi.fn(async () => ({ getAll: vi.fn(() => []) })),
}));

vi.mock("@supabase/ssr", () => ({ createServerClient: routeMocks.createServerClient }));
vi.mock("next/headers", () => ({ cookies: routeMocks.cookies }));

describe("route-handler Supabase auth-cookie transport security", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.test");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-anon-key");
  });

  afterEach(() => vi.unstubAllEnvs());

  it("retains Secure if route handlers gain cookie refresh writes later", async () => {
    const { createSupabaseUserClient } = await import("@/lib/supabase/route-client");
    await createSupabaseUserClient();

    expect(routeMocks.createServerClient).toHaveBeenCalledWith(
      "https://supabase.example.test",
      "test-anon-key",
      expect.objectContaining({ cookieOptions: expect.objectContaining({ secure: true }) }),
    );
  });
});
