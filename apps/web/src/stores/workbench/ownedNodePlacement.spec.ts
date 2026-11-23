import { describe, expect, it } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { nextElementPosition, nextFeaturePosition, nextStatePosition, placeExpandedGroup } from "./ownedNodePlacement";

function node(id: string, kind: OpdNode["kind"], x: number, y: number, ownerId?: string, width?: number, height?: number): OpdNode {
  return { id, occurrenceId: id, label: id, kind, x, y, ownerId, width, height,
    valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" };
}

describe("owned 节点创建位置", () => {
  it("状态容器扩容后所属组避开邻居，状态和属性保持相对位置", () => {
    const owner = node("owner", "object", 100, 100, undefined, 200, 180);
    const state = node("state", "state", 110, 200, owner.id, 88, 28);
    const feature = node("feature", "attribute", 400, 100, owner.id, 160, 72);
    const neighbor = node("neighbor", "object", 100, 250, undefined, 200, 72);
    const result = placeExpandedGroup([owner, state, feature, neighbor], owner.id);
    expect(result[0]!.x + 200 <= neighbor.x || result[0]!.x >= neighbor.x + 200 || result[0]!.y + 180 <= neighbor.y || result[0]!.y >= neighbor.y + 72).toBe(true);
    expect(result[1]!.x - result[0]!.x).toBe(10); expect(result[2]!.x - result[0]!.x).toBe(300);
    expect(result[3]).toEqual(neighbor);
  });
  it("新增元素寻找中心附近空位，忽略细化包络", () => {
    const envelope = node("parent", "process", -2000, -2000, undefined, 4000, 4000);
    const existing = node("existing", "object", 100, 100);
    const result = nextElementPosition([envelope, existing], { x: 100, y: 100 }, envelope.id);
    expect(result.x + 170 <= 100 || result.x >= 292 || result.y + 90 <= 100 || result.y >= 204).toBe(true);
    expect(Math.abs(result.x - 100) + Math.abs(result.y - 100)).toBeLessThan(300);
    expect(nextFeaturePosition(existing, [envelope, existing], envelope.id).x).toBeLessThan(1000);
  });
  const owner = node("owner", "object", 100, 100);
  it("已有状态拖到旧计数位置后，新状态仍保留间距", () => {
    const moved = node("s1", "state", 136, 166, owner.id);
    const position = nextStatePosition(owner, [owner, moved]);
    expect(position).not.toBeNull();
    expect(Math.abs(position!.y - moved.y)).toBeGreaterThanOrEqual(36);
  });
  it("优先填补容器空位，不按状态数量扩容", () => {
    const large = { ...owner, width: 240, height: 144 };
    const states = [node("s1", "state", 108, 164, owner.id), node("s2", "state", 108, 200, owner.id)];
    expect(nextStatePosition(large, [large, ...states])).toEqual({ x: 108, y: 128 });
  });
  it("容器扩张会覆盖邻近对象时拒绝创建，并且不修改输入", () => {
    const state = node("s1", "state", 136, 132, owner.id);
    const below = node("below", "object", 100, 176);
    const nodes = [owner, state, below];
    const before = structuredClone(nodes);
    expect(nextStatePosition(owner, nodes)).toBeNull();
    expect(nodes).toEqual(before);
  });
  it("属性与操作共同占位并跳过邻近对象", () => {
    const attribute = node("a", "attribute", 316, 196, owner.id, 160, 72);
    const neighbor = node("neighbor", "object", 316, 280, undefined, 160, 140);
    expect(nextFeaturePosition(owner, [owner, attribute, neighbor])).toEqual({ x: 316, y: 444 });
  });
  it("宽容器的特征接点留在边界外侧", () => {
    const wide = { ...owner, width: 600 };
    const feature = nextFeaturePosition(wide, [wide]);
    expect(feature.x - wide.x - wide.width).toBeGreaterThanOrEqual(56);
  });
  it("按已移动特征的实际底边追加，不覆盖高属性或回填旧计数位置", () => {
    const first = node("a", "attribute", 400, 500, owner.id, 200, 180);
    const last = node("b", "operation", 400, 800, owner.id, 160, 120);
    const nodes = [owner, last, first], before = structuredClone(nodes);
    expect(nextFeaturePosition(owner, nodes)).toEqual({ x: 400, y: 944 });
    expect(nodes).toEqual(before);
  });
  it("连续新增七个属性保持右侧同列和相同间距", () => {
    const nodes = [owner];
    for (let i = 0; i < 7; i++) {
      const position = nextFeaturePosition(owner, nodes);
      expect(position).toEqual({ x: 316, y: 196 + i * 96 });
      nodes.push(node(`a${i}`, "attribute", position.x, position.y, owner.id, 160, 72));
    }
  });
});
