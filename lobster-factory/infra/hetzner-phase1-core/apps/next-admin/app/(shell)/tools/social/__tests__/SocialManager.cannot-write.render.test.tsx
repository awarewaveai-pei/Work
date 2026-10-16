// @vitest-environment jsdom
//
// A person who may not write (an invited account with no brand role = 唯讀, or 審核人) opened the page and met the
// new-post editor, which ignored typing without a word (operator 2026-10-16). The panel says why instead; writers keep the editor.
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

let role = "client";
vi.mock("../api", async (orig) => {
  const real = await orig<typeof import("../api")>();
  const api = new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => k === "brands"
      ? async () => ({ brands: [{ id: "b1", slug: "b", name: "品牌", default_timezone: "Asia/Taipei", role }] })
      : async () => ({ posts: [], wordpress: [], undatedTruncated: false, accounts: [], media: [], lists: [] }),
  });
  return { ...real, api };
});
const { default: SocialManager } = await import("../SocialManager");

afterEach(() => cleanup());

describe("social manager -- who may write", () => {
  it.each([["client", /只能在這裡閱讀/], ["reviewer", /核准或退回/]])("%s: a notice where the editor was, no post box", async (r, words) => {
    role = r;
    render(<SocialManager />);
    await waitFor(() => expect(screen.getByText(words)).toBeTruthy());
    expect(screen.getByText(/設定 → 成員/)).toBeTruthy();
    expect(screen.queryByLabelText("貼文內容")).toBeNull();
  });

  it.each(["owner", "editor"])("%s: the new-post editor", async (r) => {
    role = r;
    render(<SocialManager />);
    await waitFor(() => expect(screen.getByLabelText("貼文內容")).toBeTruthy());
    expect(screen.queryByText(/設定 → 成員/)).toBeNull();
  });
});
