import { describe, expect, it } from "vitest";
import { placeOrthogonalLabel } from "./orthogonal-labels";

describe("orthogonal labels", () => {
  it("moves text off the line onto a clear side without hiding a node", () => {
    const placed = placeOrthogonalLabel([{ x: 0, y: 100 }, { x: 400, y: 100 }], 100, 20, 0.5,
      [{ x: 140, y: 60, width: 120, height: 35 }])!;
    expect(placed.offset.y).toBe(15);
    expect(placed.box.y).toBeGreaterThan(100);
    expect(placed.distance).toBe(0.5);
  });
  it("places text beside a vertical branch and avoids previous labels", () => {
    const placed = placeOrthogonalLabel([{ x: 100, y: 0 }, { x: 100, y: 300 }], 80, 20, 0.5,
      [{ x: 0, y: 120, width: 95, height: 60 }])!;
    expect(placed.offset.x).toBe(45);
    expect(placed.box.x).toBeGreaterThan(100);
  });
  it("avoids other relation lines rather than covering a nearby parallel track", () => {
    const placed = placeOrthogonalLabel([{ x: 0, y: 100 }, { x: 400, y: 100 }], 100, 20, 0.5, [],
      [[{ x: 0, y: 84 }, { x: 400, y: 84 }]])!;
    expect(placed.offset.y).toBeGreaterThan(0);
    expect(placed.distance).toBe(0.5);
  });
});
