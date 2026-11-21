// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ImageLightbox from "./ImageLightbox";

afterEach(cleanup);

describe("ImageLightbox (every image tool's 放大檢視)", () => {
  it("zooms in and back to fit; a click on the image keeps it open, the background or Esc closes it", () => {
    const close = vi.fn();
    render(<ImageLightbox src="data:image/png;base64,QQ==" alt="圖" onClose={close} />);
    const img = screen.getByAltText("圖");
    const scale = () => /scale\(([\d.]+)\)/.exec(img.style.transform)![1];
    expect(scale()).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    fireEvent.click(screen.getByRole("button", { name: "放大" }));
    expect(Number(scale())).toBeCloseTo(1.5625);
    fireEvent.wheel(screen.getByRole("dialog"), { deltaY: -1, clientX: 10, clientY: 10 });
    expect(Number(scale())).toBeGreaterThan(1.9);
    fireEvent.click(img);
    expect(close).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "符合畫面" }));
    expect(scale()).toBe("1");
    expect(img.style.transform).toContain("translate(0px, 0px)");
    fireEvent.click(screen.getByRole("dialog"));
    fireEvent.keyDown(window, { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(2);
  });
});
