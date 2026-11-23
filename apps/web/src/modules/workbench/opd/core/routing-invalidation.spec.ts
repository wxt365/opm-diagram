import { describe, expect, it, vi } from "vitest";
import type { Graph } from "@antv/x6";
import type { OpdNode } from "@/shared/types/modeling";
import { changedNodeGeometry, edgeIntersectsChanges } from "./routing-invalidation";

const node = (id: string, x: number, y: number) => ({ id, kind: "object", x, y, width: 100, height: 60 }) as OpdNode;

describe("拖动障碍的路径失效", () => {
  it("异步连线视图尚未计算路径时交给首次挂载绘制，不读取未初始化坐标", () => {
    const { graph, view } = setup();
    Object.assign(view, { sourcePoint: undefined, routePoints: undefined, targetPoint: undefined });
    expect(edgeIntersectsChanges(graph, "edge", [{ id: "obstacle", boxes: [{ x: 250, y: 80, width: 100, height: 60 }] }])).toBe(false);
  });
  it("检测覆盖路径及离开原路径的障碍，远处路径不失效", () => {
    const { graph } = setup();
    const before = node("obstacle", 900, 900), after = node("obstacle", 250, 80);
    const changes = changedNodeGeometry(new Map([[before.id, before]]), [after]);
    expect(edgeIntersectsChanges(graph, "edge", changes)).toBe(true);
    expect(edgeIntersectsChanges(graph, "edge", changedNodeGeometry(new Map([[after.id, after]]), [before]))).toBe(true);
    expect(edgeIntersectsChanges(graph, "edge", changedNodeGeometry(new Map([[before.id, before]]), [{ ...before, x: 1000 }]))).toBe(false);
  });
  it("允许穿越的所属外框、细化外框和本线端点不会触发额外刷新", () => {
    const { graph } = setup(["owner"]);
    for (const id of ["owner", "source", "envelope"]) {
      const before = node(id, 900, 900), after = node(id, 250, 80);
      expect(edgeIntersectsChanges(graph, "edge", changedNodeGeometry(new Map([[id, before]]), [after]), ["envelope"])).toBe(false);
    }
  });
  it("节点尺寸变化及回到起点会失效，几何未变不失效", () => {
    const before = node("obstacle", 250, 140), expanded = { ...before, y: 90, height: 100 };
    const { graph } = setup();
    expect(changedNodeGeometry(new Map([[before.id, before]]), [{ ...before }])).toEqual([]);
    expect(edgeIntersectsChanges(graph, "edge", changedNodeGeometry(new Map([[before.id, before]]), [expanded]))).toBe(true);
    expect(edgeIntersectsChanges(graph, "edge", changedNodeGeometry(new Map([[expanded.id, expanded]]), [before]))).toBe(true);
  });
});

function setup(excludeNodes: string[] = []) {
  const view = { isEdgeView: () => true, sourcePoint: { x: 100, y: 100 }, routePoints: [], targetPoint: { x: 600, y: 100 }, update: vi.fn() };
  const edge = { isNode: () => false, getSourceCellId: () => "source", getTargetCellId: () => "target", getRouter: () => ({ name: "manhattan", args: { excludeNodes } }) };
  return { view, graph: { getCellById: () => edge, findViewByCell: () => view } as unknown as Graph };
}
