import type { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const ssrMocks = vi.hoisted(() => ({
  createBrowserClient: vi.fn(() => ({})),
  createServerClient: vi.fn(() => ({})),
}));

vi.mock("@supabase/ssr", () => ssrMocks);

import {
  createSupabaseBrowserClient,
  createSupabaseMiddlewareClient,
} from "@/lib/supabase/ssr";

describe("Supabase SSR auth-cookie transport security", () => {
  beforeEach(() => vi.clearAllMocks());

  it("forces Secure on cookies written by the browser sign-in client", () => {
    createSupabaseBrowserClient();

    expect(ssrMocks.createBrowserClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ cookieOptions: expect.objectContaining({ secure: true }) }),
    );
  });

  it("forces Secure on cookies refreshed by middleware", () => {
    createSupabaseMiddlewareClient({} as NextRequest);

    expect(ssrMocks.createServerClient).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.objectContaining({ cookieOptions: expect.objectContaining({ secure: true }) }),
    );
  });
});
