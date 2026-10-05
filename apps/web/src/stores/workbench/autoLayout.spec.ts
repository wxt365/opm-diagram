import { describe, expect, it } from "vitest";
import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { autoLayout, type AutoLayoutDirection } from "./autoLayout";
function node(id: string, kind: OpdNode["kind"] = "object", extra: Partial<OpdNode> = {}): OpdNode {
  return { id, occurrenceId: `occ.${id}`, label: id, kind, x: 500, y: 400, width: 160, height: 72,
    occurrenceRole: "owned", valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品", ...extra };
}
function link(from: string, to: string, extra: Partial<ConsumptionRelation> = {}): ConsumptionRelation {
  return { id: from + to, occurrenceId: `occ.${from + to}`, sourceId: from, targetId: to, sourceOccurrenceId: `occ.${from}`,
    targetOccurrenceId: `occ.${to}`, symbolRef: "symbol.link.consumption", layoutRef: "layout.link", ...extra };
}
function placed(nodes: OpdNode[], links: ConsumptionRelation[], direction: AutoLayoutDirection = "right") {
  const result = autoLayout(nodes, links, direction); expect(result.reason).toBe("");
  return nodes.map(node => ({ ...node, ...result.layouts.find(item => item.occurrence_id === node.occurrenceId)?.layout }));
}
function noOverlap(nodes: OpdNode[]) {
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i]!, b = nodes[j]!;
    expect(a.x + a.width! <= b.x || b.x + b.width! <= a.x || a.y + a.height! <= b.y || b.y + b.height! <= a.y).toBe(true);
  }
}
describe("自动布局", () => {
  it.each(["right", "down"] as const)("%s 根据关系拓扑分层，保留尺寸，重复计算无变化", direction => {
    const nodes = [node("input", "object", { width: 200 }), node("process", "process", { height: 100 }), node("output")];
    const relations = [link("input", "process"), link("process", "output")], before = structuredClone(nodes);
    const result = placed(nodes, relations, direction), axis = direction === "right" ? "x" : "y", size = axis === "x" ? "width" : "height";
    expect(result[0]![axis] + result[0]![size]!).toBeLessThan(result[1]![axis]);
    expect(result[1]![axis] + result[1]![size]!).toBeLessThan(result[2]![axis]);
    result.forEach((value, index) => { expect(value.width).toBe(nodes[index]!.width); expect(value.height).toBe(nodes[index]!.height); });
    expect(autoLayout(result, relations, direction)).toEqual({ layouts: [], reason: "" });
    expect(nodes).toEqual(before); noOverlap(result);
  });
  it("循环、自调用、双向、无向、孤立节点终止且结果与输入顺序无关", () => {
    const nodes = [node("a"), node("b", "process", { width: 200, height: 136 }), node("c"), node("isolated")];
    const relations = [link("a", "b"), link("b", "a"), link("a", "a"), link("b", "c", { direction: "BIDIRECTIONAL" }), link("c", "a", { direction: "UNDIRECTED" })];
    const first = autoLayout(nodes, relations, "right"), reversed = autoLayout([...nodes].reverse(), [...relations].reverse(), "right");
    expect(reversed).toEqual(first); noOverlap(placed(nodes, relations));
  });
  it("分支与合流按最长前驱分层，重复边不改变布局", () => {
    const nodes = [node("a"), node("b"), node("c"), node("d")], links = [link("a", "b"), link("a", "c"), link("b", "d"), link("c", "d")];
    const result = placed(nodes, links);
    expect(result[1]!.x).toBe(result[2]!.x); expect(result[3]!.x).toBeGreaterThan(result[1]!.x);
    expect(autoLayout(nodes, [...links, links[0]!], "right")).toEqual(autoLayout(nodes, links, "right")); noOverlap(result);
  });
  it("所属状态及特征状态保持偏移；特征卫星不与相邻组重叠，状态端点参与组拓扑", () => {
    const owner = node("owner", "object", { height: 140 });
    const state = node("state", "state", { ownerId: "owner", x: 520, y: 438, width: 88, height: 28, stateRoles: ["FINAL"] });
    const feature = node("feature", "attribute", { ownerId: "owner", height: 100 });
    const operation = node("operation", "operation", { ownerId: "owner" });
    const featureState = node("fs", "state", { ownerId: "feature", x: 536, y: 438, width: 88, height: 28 });
    const process = node("process", "process");
    const nodes = [owner, state, feature, operation, featureState, process], result = placed(nodes, [link("state", "process")]);
    expect(result[1]!.x - result[0]!.x).toBe(20); expect(result[1]!.y - result[0]!.y).toBe(38);
    expect(result[4]!.x - result[2]!.x).toBe(36); expect(result[4]!.y - result[2]!.y).toBe(38);
    expect(result[1]!.stateRoles).toEqual(["FINAL"]); expect(result[0]!.height).toBe(140);
    noOverlap(result.filter(value => value.kind !== "state"));
    expect(result[5]!.x).toBeGreaterThan(result[2]!.x + result[2]!.width!);
  });
  it.each(["right", "down"] as const)("%s 不移动 reference 并避让整个固定区域", direction => {
    const reference = node("ref", "object", { occurrenceRole: "reference", x: 80, y: 80, width: 600, height: 200 });
    const nodes = [reference, node("owned")], result = autoLayout(nodes, [], direction);
    expect(result.layouts.some(item => item.occurrence_id === reference.occurrenceId)).toBe(false);
    const next = placed(nodes, [], direction); expect(next[0]).toEqual(reference); noOverlap(next);
  });
  it("多端点过程链与结构扇出使用全部端点，状态端点归入 owner", () => {
    const nodes = [node("input"), node("process", "process"), node("output")];
    const endpoints = nodes.map((node, ordinal) => ({ role: "endpoint", ordinal, targetKind: "ELEMENT" as const, targetId: node.id }));
    const process = placed(nodes, [link("input", "process", { capabilityId: "CAP-ISO-PROC-003", endpoints })]);
    expect(process[2]!.x).toBeGreaterThan(process[1]!.x);
    const fan = placed(nodes, [link("input", "process", { capabilityId: "CAP-ISO-STRUCT-005", endpoints })]);
    expect(fan[1]!.x).toBe(fan[2]!.x); noOverlap(fan);
  });
  it("空图、缺少 owner、循环所属关系、出界状态及无效几何拒绝整批", () => {
    expect(autoLayout([], [], "right").reason).toContain("没有");
    expect(autoLayout([node("state", "state")], [], "right").reason).toContain("所属");
    expect(autoLayout([node("a", "attribute", { ownerId: "b" }), node("b", "attribute", { ownerId: "a" })], [], "right").reason).toContain("所属");
    const outside = [node("owner"), node("s", "state", { ownerId: "owner", width: 88, height: 28 })];
    expect(autoLayout(outside, [], "right").reason).toContain("超出");
    expect(autoLayout([node("a", "object", { width: Infinity })], [], "right").reason).toContain("无效");
  });
});
