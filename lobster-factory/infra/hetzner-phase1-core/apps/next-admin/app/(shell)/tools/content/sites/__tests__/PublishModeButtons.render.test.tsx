// @vitest-environment jsdom
//
// The site's publish mode buttons (AUTO_CONTENT plan P4.8): human review is the default, auto publish asks once more,
// and the save sends only { publishMode } (never the defaults form).
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedSite } from "@/app/api/content/sites/route";
import PublishModeButtons from "../PublishModeButtons";

const site = (publishMode?: string): ManagedSite => ({
  id: "s1", name: "Shop", url: "https://shop.example.com", color: "#5855d0", active: true, tokenSet: true, usernameSet: true,
  note: null, source: "db", createdAt: "t", contentDefaults: publishMode ? { publishMode: publishMode as never } : {},
});
const pressed = (name: string) => screen.getByRole("button", { name }).getAttribute("aria-pressed");

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("PublishModeButtons", () => {
  it("a site with no mode stored shows human review", () => {
    render(<PublishModeButtons site={site()} onSaved={() => {}} />);
    expect(pressed("人工審核")).toBe("true");
    expect(pressed("AI 審核後自動發布")).toBe("false");
  });

  it("auto publish is saved only after the confirm, as its own field", async () => {
    const saved = site("ai_review_auto");
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => new Response(JSON.stringify({ ok: true, site: saved })));
    vi.stubGlobal("fetch", fetchMock);
    const onSaved = vi.fn();
    render(<PublishModeButtons site={site()} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole("button", { name: "AI 審核後自動發布" }));
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "確定自動發布" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(saved));
    expect(fetchMock.mock.calls[0][0]).toBe("/api/content/sites/s1");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ publishMode: "ai_review_auto" });
  });

  it("back to human review saves at once", async () => {
    const fetchMock = vi.fn(async (_u: string, _i: RequestInit) => new Response(JSON.stringify({ ok: true, site: site("human_review") })));
    vi.stubGlobal("fetch", fetchMock);
    render(<PublishModeButtons site={site("ai_review_auto")} onSaved={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "人工審核" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({ publishMode: "human_review" });
  });

  it("read-only (content door): shows the mode, no buttons", () => {
    render(<PublishModeButtons site={site("ai_review_auto")} onSaved={() => {}} readOnly />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText(/發布方式：AI 審核後自動發布/)).toBeTruthy();
  });
});
