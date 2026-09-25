// @vitest-environment jsdom
//
// First DOM tests for this project (TASKS.md:641): next-admin had no DOM test environment, so the
// "which site is selected" wiring layer was only reachable through `pick-initial-site.ts`'s own
// pure-function tests -- which stayed green even when a Codex review found the REAL component had
// regressed to bypassing that function entirely (mount-only effect / `if (sites.length)` skip /
// `?? wpSites[0]` silent fallback). This file mounts the real component (react-dom via
// @testing-library/react, per-file `jsdom` environment -- global stays "node") to close that
// gap: it proves the wiring, not just the pure function `pick-initial-site.test.ts` already covers.
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ManagedSite } from "@/app/api/content/sites/route";
import ContentStudio from "../ContentStudio";

// next/navigation's useSearchParams: a real URLSearchParams the test controls, reassigned between
// renders to simulate the App Router updating the query string WITHOUT remounting the page (the
// same-route query change that exposed bug ① -- see ContentStudio.tsx:825-827's own comment).
let mockSearchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => mockSearchParams,
}));

function site(id: string, name: string): ManagedSite {
  return {
    id, name, url: `https://${name.toLowerCase()}.example.com`, color: "#4caf50",
    active: true, tokenSet: true, usernameSet: true, note: null, source: "db",
  };
}

const SITE_A = site("11111111-1111-4111-8111-111111111111", "客戶A");
const SITE_B = site("22222222-2222-4222-8222-222222222222", "客戶B");

/** Only `/api/content/sites` is unconditional on mount; every other endpoint here is
 * gated behind a truthy `selectedSiteId`, which starts empty -- a benign catch-all is enough. */
function mockFetch(sites: ManagedSite[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.startsWith("/api/content/sites")) {
        return { ok: true, json: async () => ({ ok: true, sites }) } as Response;
      }
      return { ok: true, json: async () => ({ ok: true }) } as Response;
    }),
  );
}

// Two <select>s can show the site list at once: a header shortcut ("發布到：", no blank option,
// only rendered when wpSites.length > 1) and the "📍 目標客戶" block's own select (the one with the
// "— 請選擇目標客戶 —" placeholder, which is the one that actually reflects an unresolved/empty
// selection -- the header one has no blank option to fall back to). Scope to the latter.
function targetClientSelect(): HTMLSelectElement {
  const label = screen.getByText("📍 目標客戶");
  const container = label.closest("div");
  if (!container) throw new Error("📍 目標客戶 label has no parent container");
  return within(container).getByRole("combobox") as HTMLSelectElement;
}

beforeEach(() => {
  mockSearchParams = new URLSearchParams();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ContentStudio -- target-site wiring (TASKS.md:641 bug ①: URL change after mount)", () => {
  it("re-derives the selected site when the URL's ?siteId= changes on the SAME mounted instance (no remount)", async () => {
    mockSearchParams = new URLSearchParams({ siteId: SITE_A.id });
    mockFetch([SITE_A, SITE_B]);

    const { rerender } = render(<ContentStudio />);
    await waitFor(() => expect(targetClientSelect().value).toBe(SITE_A.id));

    // Same-route query change: App Router does NOT remount the page component for this.
    mockSearchParams = new URLSearchParams({ siteId: SITE_B.id });
    rerender(<ContentStudio />);

    await waitFor(() => expect(targetClientSelect().value).toBe(SITE_B.id));
  });
});

describe("ContentStudio -- target-site wiring (TASKS.md:641 bug ②: `if (sites.length)` skip)", () => {
  it("still shows the unresolved-site warning when the list comes back empty (filtered to nothing), instead of silently skipping the decision", async () => {
    mockSearchParams = new URLSearchParams({ siteId: "some-now-inactive-site" });
    mockFetch([]); // active/tenant filtering left nothing -- NOT "still loading"

    render(<ContentStudio />);

    await waitFor(() =>
      expect(screen.getByText(/不在你可用的清單裡/)).toBeTruthy(),
    );
    expect(screen.getByText("some-now-inactive-site")).toBeTruthy();
  });
});

describe("ContentStudio -- target-site wiring (TASKS.md:641 bug ③: `?? wpSites[0]` silent fallback)", () => {
  it("selects NOTHING (not the first site in the list) when the requested id isn't found, and surfaces the warning", async () => {
    mockSearchParams = new URLSearchParams({ siteId: "zzzzzzzz-not-in-the-list" });
    mockFetch([SITE_A, SITE_B]);

    render(<ContentStudio />);

    await waitFor(() => expect(screen.getByText(/不在你可用的清單裡/)).toBeTruthy());
    // The core assertion: must NOT have silently fallen back to SITE_A (the list's first entry).
    expect(targetClientSelect().value).toBe("");
  });

  it("when nothing is specified in the URL, an empty list IS a legal default (no warning) -- contrast case for bug ③", async () => {
    mockSearchParams = new URLSearchParams(); // no ?siteId= at all
    mockFetch([SITE_A, SITE_B]);

    render(<ContentStudio />);

    await waitFor(() => expect(targetClientSelect().value).toBe(SITE_A.id));
    expect(screen.queryByText(/不在你可用的清單裡/)).toBeNull();
  });
});
