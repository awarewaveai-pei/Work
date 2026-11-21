// @vitest-environment jsdom
//
// Card R7: the site's intro styles are a multi-select -- two styles toggled one after the other are both saved, in the
// order chosen, and a second click while the first save is still on its way can not save over it with the old list.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ManagedSite } from "@/app/api/content/sites/route";
import { INTRO_STYLES } from "@/public/editor-shared/intro-styles.js";
import IntroStyleButtons from "../IntroStyleButtons";

const label = (id: string) => INTRO_STYLES.find((s) => s.id === id)!.label;
const button = (id: string) => screen.getByRole("button", { name: label(id) });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("IntroStyleButtons multi-select", () => {
  it("toggling two styles saves both, in order; a click during a save is not sent with the stale list", async () => {
    // the server: applies each PATCH to the stored site and answers it (as app/api/content/sites/[id] does), slowly
    let stored: ManagedSite = { id: "s1", name: "Shop", url: "https://shop.example.com", color: "#5855d0", active: true, tokenSet: true,
      usernameSet: true, note: null, source: "db", createdAt: "t", contentDefaults: {} };
    const sent: string[][] = [];
    let release: () => void = () => {};
    vi.stubGlobal("fetch", vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as { introStyles?: string[] };
      sent.push(body.introStyles ?? []);
      await new Promise<void>((r) => { release = r; });
      stored = { ...stored, contentDefaults: { ...stored.contentDefaults, introStyles: body.introStyles } };
      return new Response(JSON.stringify({ ok: true, site: stored }));
    }));
    // the parent as SiteManager.tsx: the site comes back from the save and replaces the props
    function Parent() {
      const [site, setSite] = useState(stored);
      return <IntroStyleButtons site={site} onSaved={setSite} />;
    }
    render(<Parent />);

    fireEvent.click(button("cover-opener"));
    fireEvent.click(button("title-card"));   // while the first save is on its way: the cards are disabled
    expect(sent).toEqual([["cover-opener"]]);
    await act(async () => { release(); });
    await waitFor(() => expect(button("cover-opener").getAttribute("aria-pressed")).toBe("true"));

    fireEvent.click(button("title-card"));
    await act(async () => { release(); });
    await waitFor(() => expect(button("title-card").getAttribute("aria-pressed")).toBe("true"));
    expect(sent).toEqual([["cover-opener"], ["cover-opener", "title-card"]]);
    expect(button("cover-opener").getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText(new RegExp(`依序輪流用：${label("cover-opener")} → ${label("title-card")}`))).toBeTruthy();
  });
});
