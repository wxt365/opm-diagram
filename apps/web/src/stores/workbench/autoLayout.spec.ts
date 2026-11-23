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
  it("长对象标题及多行状态分别预留空间，整理后状态仍在容器内", () => {
    const result = placed([node("owner", "object", { label: "长对象标题".repeat(12) }),
      node("s", "state", { ownerId: "owner", label: "长状态说明".repeat(20), width: 88, height: 28 }), node("neighbor")], []);
    expect(result[1]!.y).toBeGreaterThan(result[0]!.y + 28);
    expect(result[1]!.height).toBeGreaterThan(28);
    expect(result[1]!.y + result[1]!.height!).toBeLessThanOrEqual(result[0]!.y + result[0]!.height! - 8);
    noOverlap(result.filter(n => n.kind !== "state"));
  });
  it("通过结果对象衔接的过程按执行次序排列，共享状态不干扰主线", () => {
    const nodes = [node("p1", "process"), node("p2", "process"), node("p3", "process"), node("out1"), node("out2"),
      node("progress", "object", { height: 140 }), node("state", "state", { ownerId: "progress", width: 88, height: 28 })];
    const links = [link("p1", "out1", { capabilityId: "CAP-ISO-PROC-002" }), link("out1", "p2", { capabilityId: "CAP-ISO-PROC-005" }),
      link("p2", "out2", { capabilityId: "CAP-ISO-PROC-002" }), link("out2", "p3", { capabilityId: "CAP-ISO-PROC-005" }),
      link("p3", "progress", { capabilityId: "CAP-ISO-PROC-002" }), link("state", "p1", { capabilityId: "CAP-ISO-PROC-012" })];
    const result = placed(nodes, links);
    expect(result[1]!.x).toBeGreaterThan(result[0]!.x + result[0]!.width!);
    expect(result[2]!.x).toBeGreaterThan(result[1]!.x + result[1]!.width!);
    noOverlap(result.filter(n => n.kind !== "state"));
    expect(autoLayout(result, links, "right").layouts).toEqual([]);
  });
  it("辅助工具与结果的反向关系不把执行主线压成同一层", () => {
    const nodes = [node("p1", "process"), node("p2", "process"), node("tool")];
    const links = [link("p1", "p2", { symbolRef: "symbol.link.invocation" }), link("tool", "p1"), link("p2", "tool")];
    const result = placed(nodes, links);
    expect(result[1]!.x).toBeGreaterThan(result[0]!.x + result[0]!.width!);
    noOverlap(result);
  });
  it("长名称先计算尺寸再排布，避免正文放大后盖住相邻元素", () => {
    const nodes = [node("long", "object", { label: "需要完整展示且不会遮挡其他节点的非常长的业务对象名称".repeat(4) }), node("short")];
    const result = placed(nodes, [link("long", "short")]);
    expect(result[0]!.height).toBeGreaterThan(nodes[0]!.height!);
    noOverlap(result);
  });
  it.each(["right", "down"] as const)("%s 多层特征组预留完整子树空间，不重叠且重排稳定", direction => {
    const nodes = [node("owner"), node("f", "attribute", { ownerId: "owner" }), node("nested", "attribute", { ownerId: "f" }),
      node("sibling", "operation", { ownerId: "owner" }), node("next", "process")];
    const links = [link("nested", "next")];
    const result = placed(nodes, links, direction);
    noOverlap(result);
    expect(autoLayout(result, links, direction).layouts).toEqual([]);
    expect(autoLayout([...nodes].reverse(), [...links].reverse(), direction)).toEqual(autoLayout(nodes, links, direction));
  });
  it("明确整理重算手动路径，避免旧折点跨过新布局的正文", () => {
    const routes = [{ segment: "main", style: "STRAIGHT" as const, mode: "MANUAL" as const, points: [{ x: 500, y: 450 }] }];
    const nodes = [node("a", "object", { edgeRoutes: [{ ...routes[0]!, segment: "feature.characterization.junction" }] }), node("b")];
    const result = autoLayout(nodes, [link("a", "b", { edgeRoutes: routes })], "right");
    expect(result.layouts.find(item => item.occurrence_id === "occ.a")?.layout.edge_routes).toEqual([]);
    expect(result.layouts.find(item => item.occurrence_id === "occ.ab")?.layout.edge_routes).toEqual([]);
  });
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
    expect(result[0]!.y + result[0]!.height! / 2).toBe((result[1]!.y + result[2]!.y + result[2]!.height!) / 2);
    expect(result[3]!.y).toBe(result[0]!.y);
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
  it("历史散乱的七个属性靠近所属对象居中成组，重复整理不再改变位置", () => {
    const owner = node("owner");
    const features = Array.from({ length: 7 }, (_, i) => node(`feature.${i}`, "attribute", {
      ownerId: owner.id, x: i % 2 ? 120 : 700, y: 500 + i * 110, height: 72 + i * 8,
    }));
    const nodes = [owner, ...features], before = structuredClone(nodes);
    const result = placed(nodes, []), column = result.slice(1);
    expect(new Set(column.map(item => item.x)).size).toBe(1);
    expect(column[0]!.x).toBeGreaterThan(result[0]!.x + result[0]!.width!);
    for (let i = 1; i < column.length; i++) expect(column[i]!.y - column[i - 1]!.y - column[i - 1]!.height!).toBe(32);
    expect(result[0]!.y + result[0]!.height! / 2).toBe((column[0]!.y + column.at(-1)!.y + column.at(-1)!.height!) / 2);
    noOverlap(result);
    expect(autoLayout(result, [], "right")).toEqual({ layouts: [], reason: "" });
    expect(nodes).toEqual(before);
  });
  it("循环和孤立对象采用均衡分区，避免所有节点挤成长列", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => node(`n${i.toString().padStart(2, "0")}`));
    const links = nodes.map((value, i) => link(value.id, nodes[(i + 1) % nodes.length]!.id));
    const result = placed(nodes, links);
    const width = Math.max(...result.map(n => n.x + n.width!)) - Math.min(...result.map(n => n.x));
    const height = Math.max(...result.map(n => n.y + n.height!)) - Math.min(...result.map(n => n.y));
    expect(width / height).toBeGreaterThan(0.65); expect(width / height).toBeLessThan(2.5);
    noOverlap(result); expect(autoLayout(result, links, "right").layouts).toEqual([]);
  });
  it("多端点过程链与结构扇出使用全部端点，状态端点归入 owner", () => {
    const nodes = [node("input"), node("process", "process"), node("output")];
    const endpoints = nodes.map((node, ordinal) => ({ role: "endpoint", ordinal, targetKind: "ELEMENT" as const, targetId: node.id }));
    const process = placed(nodes, [link("input", "process", { capabilityId: "CAP-ISO-PROC-003", endpoints })]);
    expect(process[2]!.x).toBeGreaterThan(process[1]!.x);
    const fan = placed(nodes, [link("input", "process", { capabilityId: "CAP-ISO-STRUCT-005", endpoints })]);
    expect(fan[1]!.x).toBe(fan[2]!.x); noOverlap(fan);
  });
  it("拒绝空图、缺少 owner、循环所属及无效几何；出界状态可修复", () => {
    expect(autoLayout([], [], "right").reason).toContain("没有");
    expect(autoLayout([node("state", "state")], [], "right").reason).toContain("所属");
    expect(autoLayout([node("a", "attribute", { ownerId: "b" }), node("b", "attribute", { ownerId: "a" })], [], "right").reason).toContain("所属");
    const outside = [node("owner"), node("s", "state", { ownerId: "owner", width: 88, height: 28 })];
    const repaired = placed(outside, []);
    expect(repaired[1]!.x).toBeGreaterThanOrEqual(repaired[0]!.x + 8);
    expect(repaired[1]!.y).toBeGreaterThanOrEqual(repaired[0]!.y + 28);
    expect(autoLayout([node("a", "object", { width: Infinity })], [], "right").reason).toContain("无效");
  });
});
