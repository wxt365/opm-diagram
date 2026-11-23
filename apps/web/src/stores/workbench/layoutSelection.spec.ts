import { describe, expect, it } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { captureLayouts, moveSelection } from "./layoutSelection";
function node(id: string, kind: OpdNode["kind"], x: number, y: number, ownerId?: string): OpdNode {
  return { id, occurrenceId: id, label: id, kind, x, y, ownerId, width: kind === "state" ? 88 : 160, height: kind === "state" ? 28 : 108,
    valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" };
}
describe("多选布局", () => {
  const owner = node("owner", "object", 100, 100);
  const child = { ...node("child", "state", 108, 128, "owner"), stateRoles: ["FINAL" as const] };
  const other = node("other", "process", 400, 100);
  it("父与状态同时选择去重，未选择的所属状态也随父移动，输入不被修改", () => {
    const nodes = [owner, child, other], before = captureLayouts(nodes);
    expect(moveSelection(nodes, ["owner", "child", "other"], 32, 16)).toEqual([
      { occurrence_id: "owner", layout: { x: 132, y: 116, width: 160, height: 108 } },
      { occurrence_id: "child", layout: { x: 140, y: 144, width: 88, height: 28 } },
      { occurrence_id: "other", layout: { x: 432, y: 116, width: 160, height: 108 } },
    ]);
    expect(moveSelection(nodes, ["owner"], 32, 16)).toHaveLength(2);
    expect(captureLayouts(nodes)).toEqual(before);
  });
  it("独立状态限制在标题下且不意外缩小手工容器", () => {
    const result = moveSelection([owner, child], ["child"], -500, -500);
    expect(result).toEqual([]);
  });
  it("不移动非owned节点，零偏移不提交", () => {
    expect(moveSelection([{ ...other, occurrenceRole: "reference" }], ["other"], 32, 16)).toEqual([]);
    expect(moveSelection([owner, child], ["owner"], 0, 0)).toEqual([]);
  });
  it("对象携带特征及特征状态，混合多选只移动一次，引用特征不移动", () => {
    const feature = node("feature", "attribute", 316, 196, owner.id);
    const state = node("fs", "state", 324, 224, feature.id);
    const reference = { ...node("ref", "attribute", 316, 400, owner.id), occurrenceRole: "reference" as const };
    const nodes = [owner, child, feature, state, reference, other], before = structuredClone(nodes);
    const moved = moveSelection(nodes, [owner.id, feature.id, state.id], 40, 60);
    expect(moveSelection(nodes, [owner.id], 40, 60)).toEqual(moved);
    expect(moved.map(item => item.occurrence_id)).toEqual([owner.id, child.id, feature.id, state.id]);
    for (const item of moved) {
      const original = nodes.find(node => node.id === item.occurrence_id)!;
      expect(item.layout).toEqual({ x: original.x + 40, y: original.y + 60, width: original.width, height: original.height });
    }
    expect(moveSelection(nodes, [feature.id], 40, 60).map(item => item.occurrence_id)).toEqual([feature.id, state.id]);
    expect(nodes).toEqual(before);
  });
});
