// @vitest-environment jsdom
//
// Operator 2026-11-14: 已刪除貼文 needs row ticks, a tick-all and one 永久刪除 for the ticked ones, confirmed in a dialog
// that says how many and that it cannot be undone. A post that went out stays as the record (assertCanPurge).
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import Trash from "../Trash";
import type { Post } from "../model";

const post = (id: string, body: string, published_at: string | null = null) => ({
  id, state: "deleted", body, scheduled_at: null, list_id: null, list_position: null, first_comment: null, link_url: null,
  link_utm: false, notes: null, source_url: null, published_at, deleted_at: "2026-11-13T10:00:00Z", version: 3, repeat: null,
  repeat_of: null, origin_slot: null, auto_mode: "brand", created_at: "2026-11-01T02:05:00Z", targets: [], media: [], comments: [], tags: [],
}) as unknown as Post;

const posts = [post("a", "第一則"), post("b", "第二則"), post("c", "發出去過", "2026-11-02T00:00:00Z")];
const view = (onPurge = vi.fn(), canWrite = true) => {
  render(<Trash posts={posts} deletions={{}} accounts={[]} tz="Asia/Taipei" canWrite={canWrite} onRestore={vi.fn()} onPurge={onPurge} onBack={vi.fn()} />);
  return onPurge;
};
const bulk = () => screen.getByRole("button", { name: /永久刪除所選/ });

afterEach(() => cleanup());

describe("已刪除貼文 -- bulk 永久刪除", () => {
  it("nothing ticked: the bulk button is off; a published post cannot be ticked", () => {
    view();
    expect((bulk() as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("選取「發出去過」") as HTMLInputElement).disabled).toBe(true);
  });

  it("tick-all ticks only the erasable posts; the dialog names the count and that it cannot be undone", () => {
    const onPurge = view();
    fireEvent.click(screen.getByLabelText("全選"));
    expect(bulk().textContent).toContain("（2）");
    fireEvent.click(bulk());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("永久刪除 2 則貼文，無法還原")).toBeTruthy();
    expect(onPurge).not.toHaveBeenCalled();   // nothing goes before the confirm
    fireEvent.click(within(dialog).getByRole("button", { name: "永久刪除 2 則" }));
    expect(onPurge).toHaveBeenCalledTimes(1);
    expect(onPurge.mock.calls[0][0].map((p: Post) => p.id)).toEqual(["a", "b"]);
  });

  it("only the ticked rows go; 取消 sends nothing", () => {
    const onPurge = view();
    fireEvent.click(screen.getByLabelText("選取「第二則」"));
    fireEvent.click(bulk());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "取消" }));
    expect(onPurge).not.toHaveBeenCalled();
    fireEvent.click(bulk());
    fireEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "永久刪除 1 則" }));
    expect(onPurge.mock.calls[0][0].map((p: Post) => p.id)).toEqual(["b"]);
  });

  it("a ticked post that leaves the bin and comes back is not ticked any more", () => {
    const props = { deletions: {}, accounts: [], tz: "Asia/Taipei", canWrite: true, onRestore: vi.fn(), onPurge: vi.fn(), onBack: vi.fn() };
    const { rerender } = render(<Trash posts={posts} {...props} />);
    fireEvent.click(screen.getByLabelText("選取「第一則」"));
    rerender(<Trash posts={posts.slice(1)} {...props} />);   // 還原: it left the bin
    rerender(<Trash posts={posts} {...props} />);            // deleted again by someone else
    expect((screen.getByLabelText("選取「第一則」") as HTMLInputElement).checked).toBe(false);
    expect((bulk() as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows when each post was made, in the brand's zone", () => {
    view();
    expect(screen.getAllByText("11/1 10:05").length).toBeGreaterThan(0);   // 02:05Z = 10:05 Asia/Taipei
  });

  it("a reader sees no ticks and no bulk button", () => {
    view(vi.fn(), false);
    expect(screen.queryByLabelText("全選")).toBeNull();
    expect(screen.queryByRole("button", { name: /永久刪除所選/ })).toBeNull();
  });
});
