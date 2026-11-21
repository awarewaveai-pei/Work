// @vitest-environment jsdom
//
// The client block (R10): typing searches the server, a click picks that client.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OrgPicker } from "../OrgPicker";
import type { PickOrg } from "../nav-orgs";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }), usePathname: () => "/x", useSearchParams: () => new URLSearchParams() }));

const org = (slug: string, name: string): PickOrg => ({ id: `id-${slug}`, slug, name, color: "var(--accent)", brandColors: [] });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("OrgPicker", () => {
  it("typing asks the server, and the rows are its answer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true, orgs: [org("soulful", "Soulful Expression")] })));
    vi.stubGlobal("fetch", fetchMock);
    render(<OrgPicker searchPath="/api/ops/org-search" orgs={[org("aw", "AwareWave")]} total={120} selected={null} onPick={() => {}} />);
    fireEvent.change(screen.getByLabelText("搜尋客戶"), { target: { value: "soul" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Soulful Expression" })).toBeTruthy());
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("/api/ops/org-search?q=soul");
    expect(screen.queryByRole("button", { name: "AwareWave" })).toBeNull();
  });

  it("a click picks that client and marks it", () => {
    const onPick = vi.fn();
    const { rerender } = render(<OrgPicker searchPath="/api/ops/org-search" orgs={[org("aw", "AwareWave"), org("soulful", "Soulful Expression")]} total={2} selected={null} onPick={onPick} />);
    fireEvent.click(screen.getByRole("button", { name: "Soulful Expression" }));
    expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ slug: "soulful" }));
    rerender(<OrgPicker searchPath="/api/ops/org-search" orgs={[org("aw", "AwareWave"), org("soulful", "Soulful Expression")]} total={2} selected="soulful" onPick={onPick} />);
    expect(screen.getByRole("button", { name: "Soulful Expression" }).getAttribute("aria-pressed")).toBe("true");
  });
});
