import { describe, expect, it } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { overlappingNodeIds } from "./layoutOverlap";

const node = (id: string, x: number, y: number, extra: Partial<OpdNode> = {}) => ({ id, x, y, width: 160, height: 72,
  kind: "object", occurrenceRole: "owned", ...extra }) as OpdNode;
describe("布局重叠提示", () => {
  it("检测独立正文和外置特征重叠，忽略状态及细化外框", () => {
    const nodes = [node("parent", 0, 0, { width: 1000, height: 1000 }), node("owner", 80, 80),
      node("feature", 200, 100, { kind: "attribute", ownerId: "owner" }), node("state", 100, 120, { kind: "state", ownerId: "owner" })];
    expect(overlappingNodeIds(nodes, "parent")).toEqual(["feature", "owner"]);
    expect(overlappingNodeIds(nodes.filter(n => n.id !== "feature"), "parent")).toEqual([]);
  });
  it("边界贴合、已分开和只读引用之间的重叠不提示整理", () => {
    expect(overlappingNodeIds([node("a", 0, 0), node("b", 160, 0)])).toEqual([]);
    expect(overlappingNodeIds([node("a", 0, 0), node("b", 0, 100)])).toEqual([]);
    expect(overlappingNodeIds([node("a", 0, 0, { occurrenceRole: "reference" }), node("b", 0, 0, { occurrenceRole: "reference" })])).toEqual([]);
  });
});
