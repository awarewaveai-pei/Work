// @vitest-environment jsdom
//
// A 423 from wp-update (system mode blocks the change) is shown as the shared readable message and the
// buttons are released -- not an "Error:" dump and not a stuck spinner.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { blockedChangeMessage } from "@/lib/system-modes/blocked-change";
import { WpUpdateButtons } from "../WpUpdateButtons";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("WpUpdateButtons -- blocked by the system mode", () => {
  it("423: logs the shared message with the mode and re-enables the buttons", async () => {
    const fetchMock = vi.fn(async (_url: string) => new Response(JSON.stringify({ mode: "maintenance" }), { status: 423 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<WpUpdateButtons slug="acme" waves={{ wave1: ["woocommerce"] }} />);

    fireEvent.click(screen.getByRole("button", { name: /Wave 1/ }));

    await waitFor(() => expect(screen.getByText(`⛔ ${blockedChangeMessage("maintenance")}`)).toBeTruthy());
    expect(fetchMock.mock.calls[0][0]).toBe("/api/ops/clients/acme/wp-update?wave=wave1");
    expect((screen.getByRole("button", { name: /Wave 1/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
