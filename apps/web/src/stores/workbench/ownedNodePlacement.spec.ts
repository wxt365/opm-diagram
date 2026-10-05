import { describe, expect, it } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { nextFeaturePosition, nextStatePosition } from "./ownedNodePlacement";

function node(id: string, kind: OpdNode["kind"], x: number, y: number, ownerId?: string, width?: number, height?: number): OpdNode {
  return { id, occurrenceId: id, label: id, kind, x, y, ownerId, width, height,
    valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" };
}

describe("owned 节点创建位置", () => {
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
    expect(nextStatePosition(large, [large, ...states])).toEqual({ x: 136, y: 128 });
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
    const junctionX = (wide.x + wide.width / 2 + feature.x + 80) / 2;
    expect(junctionX - 12).toBeGreaterThan(wide.x + wide.width);
  });
});
