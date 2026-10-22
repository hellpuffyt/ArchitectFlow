import { describe, expect, it } from "vitest";
import { contrastRatio, hexToRgb, hslToRgb, isHex, rgbToHex, rgbToHsl } from "./contrast";

describe("WCAG contrast (same values as the Python implementation)", () => {
  it("reference ratios", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.478, 3);
    expect(contrastRatio("#999999", "#ffffff")).toBeCloseTo(2.85, 2);
    expect(contrastRatio("#999999", "#f6f7f9")).toBeCloseTo(2.66, 2);
  });
  it("is symmetric", () => expect(contrastRatio("#3f5bf0", "#ffffff")).toBe(contrastRatio("#ffffff", "#3f5bf0")));
  it("rejects invalid colors", () => expect(() => contrastRatio("red", "#fff")).toThrow());
});

describe("color conversions", () => {
  it("round-trips hex ↔ rgb", () => {
    expect(hexToRgb("#3f5bf0")).toEqual([63, 91, 240]);
    expect(rgbToHex(63, 91, 240)).toBe("#3f5bf0");
    expect(rgbToHex(300, -5, 12.6)).toBe("#ff000d");
  });
  it("round-trips rgb ↔ hsl within rounding", () => {
    for (const hex of ["#3f5bf0", "#10b981", "#b4532a", "#0b0d12", "#ffffff"]) {
      const [r, g, b] = hexToRgb(hex);
      const back = hslToRgb(...rgbToHsl(r, g, b));
      back.forEach((v, i) => expect(Math.abs(v - [r, g, b][i])).toBeLessThanOrEqual(3));
    }
  });
  it("validates hex", () => { expect(isHex("#a1b2c3")).toBe(true); expect(isHex("#abc")).toBe(false); });
});
