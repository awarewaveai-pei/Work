import { describe, it, expect } from "vitest";
import { deriveTheme, hexToHueSat, DEFAULT_SEED } from "@/lib/cs-widget/theme";

describe("hexToHueSat", () => {
  it("pure red → hue ~0, high saturation", () => {
    const { h, s } = hexToHueSat("#ff0000");
    expect(h).toBeCloseTo(0, 0);
    expect(s).toBeGreaterThan(0.9);
  });
  it("mid grey → ~zero saturation (neutral)", () => {
    const { s } = hexToHueSat("#808080");
    expect(s).toBeLessThan(0.05);
  });
  it("malformed hex → sage fallback, never throws", () => {
    expect(() => hexToHueSat("not-a-color")).not.toThrow();
    expect(hexToHueSat("not-a-color").h).toBe(150);
  });
});

describe("deriveTheme", () => {
  const keys = ["--bg", "--surface", "--primary", "--on-primary", "--ink", "--border", "--error"];

  it("light mode returns the full variable set", () => {
    const t = deriveTheme(DEFAULT_SEED, "light");
    for (const k of keys) expect(t[k]).toBeTruthy();
    expect(t["--ink"]).toBe("#2C2926");      // warm-dark text (locked)
    expect(t["--on-primary"]).toBe("#FBF8F4"); // cream on primary (AA-locked)
  });

  it("dark mode lifts surfaces + uses warm-off-white ink", () => {
    const t = deriveTheme(DEFAULT_SEED, "dark");
    for (const k of keys) expect(t[k]).toBeTruthy();
    expect(t["--ink"]).toBe("#F0EDE8");
    expect(t["--primary"]).toMatch(/^oklch\(0\.7 /); // primary lifted for dark-bg readability
  });

  it("primary lightness is locked regardless of seed (WCAG-AA guarantee)", () => {
    expect(deriveTheme("#ff0000", "light")["--primary"]).toMatch(/^oklch\(0\.54 /);
    expect(deriveTheme("#3D6E8C", "light")["--primary"]).toMatch(/^oklch\(0\.54 /);
  });

  it("near-grey seed → low-chroma primary (stays neutral, no vivid dump)", () => {
    const t = deriveTheme("#808080", "light");
    const chroma = Number(/^oklch\([\d.]+ ([\d.]+) /.exec(t["--primary"])![1]);
    expect(chroma).toBeLessThan(0.02);
  });
});
