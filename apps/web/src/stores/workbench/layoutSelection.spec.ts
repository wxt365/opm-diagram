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
  it("独立状态夹取并收缩容器，完整快照包含尺寸", () => {
    const result = moveSelection([owner, child], ["child"], -500, -500);
    expect(result).toEqual([{ occurrence_id: "owner", layout: { x: 100, y: 100, width: 160, height: 72 } }]);
  });
  it("不移动非owned节点，零偏移不提交", () => {
    expect(moveSelection([{ ...other, occurrenceRole: "reference" }], ["other"], 32, 16)).toEqual([]);
    expect(moveSelection([owner, child], ["owner"], 0, 0)).toEqual([]);
  });
});
