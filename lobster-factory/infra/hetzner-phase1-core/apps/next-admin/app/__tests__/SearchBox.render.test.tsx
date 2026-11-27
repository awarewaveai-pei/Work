// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchBox } from "../SearchBox";
import type { SearchIndex } from "@/lib/portal/search";

const item = (key: string, name: string, href: string) => ({ group: "feature" as const, key, name, crumb: ["內容行銷", name], tasks: [], keywords: [], blurb: "", category: "內容", href });
const index: SearchIndex = { tasks: {}, items: [item("a", "文章生成", "https://c.test/a"), item("b", "文章人性化", "https://c.test/b")] };

afterEach(cleanup);

describe("SearchBox keys (U18)", () => {
  it("/ focuses, ↑↓ move, Enter opens the selected, Esc closes", () => {
    const open = vi.fn();
    render(<SearchBox index={index} open={open} />);
    const box = screen.getByRole("combobox");
    fireEvent.keyDown(window, { key: "/" });
    expect(document.activeElement).toBe(box);

    fireEvent.change(box, { target: { value: "文章" } });
    expect(screen.getAllByRole("option").map((o) => o.getAttribute("aria-selected"))).toEqual(["true", "false"]);
    fireEvent.keyDown(box, { key: "ArrowDown" });
    expect(screen.getAllByRole("option")[1].getAttribute("aria-selected")).toBe("true");
    fireEvent.keyDown(box, { key: "ArrowUp" });
    fireEvent.keyDown(box, { key: "ArrowDown" });
    fireEvent.keyDown(box, { key: "Enter" });
    expect(open).toHaveBeenCalledWith("https://c.test/b");

    fireEvent.focus(box);
    fireEvent.keyDown(box, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    expect((box as HTMLInputElement).value).toBe("");
  });

  it("/ typed inside another field is left alone", () => {
    render(<><input aria-label="other" /><SearchBox index={index} open={vi.fn()} /></>);
    const other = screen.getByLabelText("other");
    other.focus();
    fireEvent.keyDown(other, { key: "/" });
    expect(document.activeElement).toBe(other);
  });
});
