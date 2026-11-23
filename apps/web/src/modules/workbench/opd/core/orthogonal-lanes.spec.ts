import { describe, expect, it } from "vitest";
import { orthogonalLanes, type OrthogonalLane } from "./orthogonal-lanes";

const lane = (id = "a"): OrthogonalLane => ({ id, source: { x: 0, y: 0, width: 160, height: 72 },
  target: { x: 600, y: 0, width: 160, height: 72 }, start: { x: 160, y: 36 }, end: { x: 600, y: 36 },
  startSide: "right", endSide: "left", obstacles: [] });

describe("自动正交通道", () => {
  it("有阻挡时绕开正文及间距，所有线段保持水平或垂直", () => {
    const input = { ...lane(), obstacles: [{ x: 290, y: 0, width: 160, height: 72 }] };
    const points = [input.start, ...orthogonalLanes([input]).get(input.id)!, input.end];
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1]!, b = points[i]!;
      expect(a.x === b.x || a.y === b.y).toBe(true);
      expect(Math.max(a.x, b.x) <= 274 || Math.min(a.x, b.x) >= 466 || Math.max(a.y, b.y) <= -16 || Math.min(a.y, b.y) >= 88).toBe(true);
    }
  });
  it("无清晰通道时交回已有 Manhattan 避障，不生成穿过对象的候选", () => {
    const input = { ...lane(), obstacles: [{ x: 170, y: -40, width: 120, height: 160 }] };
    expect(orthogonalLanes([input]).has(input.id)).toBe(false);
  });
  it("自动路径不修改输入，节点移动后重算且排序稳定", () => {
    const inputs = [lane("b"), { ...lane("a"), start: { x: 160, y: 52 }, end: { x: 600, y: 52 } }], before = structuredClone(inputs);
    const first = orthogonalLanes(inputs);
    expect(orthogonalLanes([...inputs].reverse())).toEqual(first); expect(inputs).toEqual(before);
    expect(orthogonalLanes([{ ...lane(), end: { x: 600, y: 240 }, target: { x: 600, y: 204, width: 160, height: 72 } }]).get("a")!.length).toBeGreaterThan(0);
  });
});
