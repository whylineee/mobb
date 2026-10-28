import { expect, it } from "vitest";
import { createMascotGeometry } from "./mascot-geometry";

it("builds a bounded colored mascot mesh with valid geometry for instancing", () => {
  const geometry = createMascotGeometry();
  try {
    const positions = geometry.getAttribute("position");
    expect(geometry.getAttribute("color").count).toBe(positions.count);
    expect(geometry.getAttribute("normal").count).toBe(positions.count);
    for (const name of ["position", "color", "normal"]) {
      expect(
        Array.from(geometry.getAttribute(name).array).every(Number.isFinite),
      ).toBe(true);
    }
    expect(geometry.boundingBox!.min.y).toBeGreaterThan(-0.05);
    expect(geometry.boundingBox!.max.y).toBeLessThan(2.8);
    expect(geometry.boundingBox!.max.z).toBeGreaterThan(0.5);
    expect(geometry.index!.count / 3).toBeLessThan(4500);
    expect(geometry.groups).toHaveLength(0);
  } finally {
    geometry.dispose();
  }
});
