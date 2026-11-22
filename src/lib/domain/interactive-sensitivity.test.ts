import { describe, expect, it } from "vitest";
import { createTask13Model } from "./task13";
import {
  buildInteractiveMutation,
  clampDeltaPct,
  interactiveAutoPreview,
  seedDeltaPct,
  targetsForKind,
} from "./interactive-sensitivity";

describe("interactive-sensitivity helpers", () => {
  it("clamps and rounds pct", () => {
    expect(clampDeltaPct(12.4)).toBe(12);
    expect(clampDeltaPct(12.6)).toBe(13);
    expect(clampDeltaPct(-99)).toBe(-50);
    expect(clampDeltaPct(99)).toBe(50);
  });

  it("seeds from defaults with Task-13 fallbacks", () => {
    expect(seedDeltaPct("resource_change", { resource_pct: 0.1 })).toBe(10);
    expect(seedDeltaPct("modernization", { modernization_pct: 0.1 })).toBe(-10);
    expect(seedDeltaPct("price_change", { price_pct: 0.15 })).toBe(15);
    expect(seedDeltaPct("resource_change", {})).toBe(10);
    expect(seedDeltaPct("modernization", {})).toBe(-10);
    expect(seedDeltaPct("price_change", {})).toBe(15);
  });

  it("targets depend on kind", () => {
    const m = createTask13Model();
    expect(targetsForKind(m, "resource_change")).toEqual(m.resources);
    expect(targetsForKind(m, "price_change")).toEqual(m.products);
  });

  it("auto-preview only for lp/ipm", () => {
    expect(interactiveAutoPreview("lp")).toBe(true);
    expect(interactiveAutoPreview("ipm")).toBe(true);
    expect(interactiveAutoPreview("ga")).toBe(false);
    expect(interactiveAutoPreview("dln")).toBe(false);
  });

  it("builds labeled mutation from pct", () => {
    const m = createTask13Model();
    const mut = buildInteractiveMutation("resource_change", "Труд", 10, m);
    expect(mut.delta).toBe(0.1);
    expect(mut.label).toContain("Труд");
  });
});
