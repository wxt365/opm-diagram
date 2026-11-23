import { describe, expect, it } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";
import { statesOverlap } from "@/modules/workbench/opd/core/state-layout";
import { fitStateContainers, repairStateContainers } from "./stateLayout";
import { nextStatePosition } from "./ownedNodePlacement";
import { moveSelection } from "./layoutSelection";
import { autoLayout } from "./autoLayout";
import { arrangeLayouts } from "./layoutArrangement";

function node(id: string, kind: OpdNode["kind"], extra: Partial<OpdNode> = {}): OpdNode {
  return { id, occurrenceId: id, label: id, kind, x: 100, y: 100, width: kind === "state" ? 88 : 224,
    height: kind === "state" ? 28 : 72, occurrenceRole: "owned", valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品", ...extra };
}
function assertContained(nodes: OpdNode[], id: string) {
  const owner = nodes.find(node => node.id === id)!, bounds = nodeDimensions(owner);
  const states = nodes.filter(node => node.kind === "state" && node.ownerId === id);
  for (const state of states) {
    const size = nodeDimensions(state);
    expect(state.x).toBeGreaterThanOrEqual(owner.x + 8); expect(state.y).toBeGreaterThanOrEqual(owner.y + 28);
    expect(state.x + size.width + 8).toBeLessThanOrEqual(owner.x + bounds.width);
    expect(state.y + size.height + 8).toBeLessThanOrEqual(owner.y + bounds.height);
    for (const other of states.filter(item => item.id !== state.id))
      expect(statesOverlap({ ...state, ...size }, { ...other, ...nodeDimensions(other) }, 8)).toBe(false);
  }
}

describe("对象内部状态自适应", () => {
  it("已导入状态的旧相对坐标回到各自 owner 内，不把远端坐标变成巨大容器", () => {
    const owner = node("owner", "object", { x: 84, y: 334, width: 280, height: 96 });
    const other = node("other", "object", { x: 84, y: 642, width: 280, height: 96 });
    const a = node("a", "state", { x: 12, y: 50, width: 116, ownerId: owner.id });
    const b = node("b", "state", { x: 140, y: 50, width: 116, ownerId: owner.id });
    const c = node("c", "state", { x: 12, y: 5000, width: 116, ownerId: other.id });
    const unrelated = node("p", "process", { x: 550, y: 200 });
    const original = [owner, other, a, b, c, unrelated], before = structuredClone(original);
    const result = repairStateContainers(original);
    assertContained(result, owner.id); assertContained(result, other.id);
    expect(result[0]).toEqual(owner); expect(result[1]).toEqual(other);
    expect(result[5]).toEqual(unrelated); expect(original).toEqual(before);
    expect(repairStateContainers(result)).toEqual(result);
  });

  it("加载修正优先保留合法手工状态位置，并不推断缺少 owner 的状态", () => {
    const owner = node("owner", "object", { height: 160 });
    const valid = node("z", "state", { x: 108, y: 128, ownerId: owner.id });
    const invalid = node("a", "state", { x: 12, y: 50, ownerId: owner.id });
    const orphan = node("orphan", "state", { ownerId: "missing", x: 5000, y: 5000 });
    const result = repairStateContainers([owner, valid, invalid, orphan]);
    expect(result[1]).toEqual(valid); expect(result[3]).toEqual(orphan);
    assertContained(result, owner.id);
  });

  it("十二个状态先横排后换行，随内容扩容且不修改输入", () => {
    let nodes = [node("owner", "object")];
    for (let index = 0; index < 12; index++) {
      const originalNodes = nodes, original = structuredClone(nodes), owner = nodes[0]!;
      const position = nextStatePosition(owner, nodes)!;
      nodes = fitStateContainers([...nodes, node(`s${index.toString().padStart(2, "0")}`, "state", { ...position, ownerId: owner.id })]);
      expect(originalNodes).toEqual(original);
      assertContained(nodes, owner.id);
    }
    expect(nodes[1]!.y).toBe(nodes[2]!.y);
    expect(nodes[3]!.y).toBeGreaterThan(nodes[2]!.y);
    expect(nodes[0]!.width).toBe(224); expect(nodes[0]!.height).toBe(244);
    expect(fitStateContainers(nodes)).toEqual(nodes);
  });

  it("修复截图中三个相互覆盖的状态，长中文换行撑高并保留角色与关系标识", () => {
    const owner = node("coffee", "object", { label: "咖啡豆" });
    const states = [1, 2, 3].map(index => node(`s${index}`, "state", { x: 108, y: 128, ownerId: owner.id,
      label: index === 3 ? "已经完成烘焙并且检验合格等待出库的咖啡豆" : `State ${index}`, stateRoles: index === 3 ? ["FINAL"] : [] }));
    const original = [owner, ...states], before = structuredClone(original), result = fitStateContainers(original);
    assertContained(result, owner.id);
    expect(result[3]!.height).toBeGreaterThan(28);
    expect(result[3]!.width).toBeLessThanOrEqual(owner.width! - 16);
    expect(result[3]!.stateRoles).toEqual(["FINAL"]); expect(result[3]!.occurrenceId).toBe("s3");
    expect(original).toEqual(before);
    const automatic = autoLayout(original, [], "right");
    expect(automatic.reason).toBe("");
    const placed = original.map(node => ({ ...node, ...automatic.layouts.find(layout => layout.occurrence_id === node.occurrenceId)?.layout }));
    assertContained(placed, owner.id); expect(autoLayout(placed, [], "right").layouts).toEqual([]);
    expect(autoLayout([...original].reverse(), [], "right")).toEqual(automatic);
  });

  it("拖到另一个状态上时避让，向下拖可扩容；属性、折叠属性状态及终态一同移动", () => {
    const owner = node("owner", "object", { width: 160 });
    const a = node("a", "state", { x: 108, y: 128, ownerId: owner.id });
    const b = node("b", "state", { x: 108, y: 164, ownerId: owner.id, stateRoles: ["FINAL"] });
    const feature = node("f", "attribute", { x: 316, y: 200, width: 160, height: 72, ownerId: owner.id });
    const fs = node("fs", "state", { x: 324, y: 228, ownerId: feature.id });
    const nodes = [{ ...owner, height: 100 }, a, b, feature, fs];
    const collision = moveSelection(nodes, [b.id], 0, -36);
    const collided = nodes.map(node => ({ ...node, ...collision.find(item => item.occurrence_id === node.occurrenceId)?.layout }));
    assertContained(collided, owner.id);
    expect(collided[1]).toEqual(a);
    const layouts = moveSelection(nodes, [b.id], 0, 100);
    const next = nodes.map(node => ({ ...node, ...layouts.find(item => item.occurrence_id === node.occurrenceId)?.layout }));
    assertContained(next, owner.id); assertContained(next, feature.id);
    expect(next[0]!.height).toBe(200); expect(next[3]!.y - feature.y).toBe(100); expect(next[4]!.y - fs.y).toBe(100);
  });

  it("服务端新增已经撑高 owner 后，仍按编辑前尺寸给外部属性让位", () => {
    const owner = node("o", "object", { width: 160 });
    const feature = node("f", "attribute", { ownerId: owner.id, x: 316, y: 196 });
    const before = [owner, feature];
    const current = [{ ...owner, height: 100 }, feature, node("s", "state", { ownerId: owner.id, x: 108, y: 164 })];
    const next = fitStateContainers(current, new Set([owner.id]), new Set(), before);
    expect(next[1]!.y).toBe(224); assertContained(next, owner.id);
  });

  it("宽英文字符和显式换行均计入状态高度，避免长名称被截断", () => {
    const owner = node("owner", "object");
    const state = node("s", "state", { label: "WWWWWWWWWWWWWWWWWWWW\n等待检验", x: 108, y: 128, ownerId: owner.id });
    const next = fitStateContainers([owner, state]);
    expect(next[1]!.height).toBeGreaterThanOrEqual(60);
    assertContained(next, owner.id);
  });

  it("对齐不能覆盖未选择的状态；只读状态不会被自动移动或改变尺寸", () => {
    const owner = node("o", "object", { width: 320, height: 160 });
    const a = node("a", "state", { ownerId: owner.id, x: 108, y: 128 });
    const b = node("b", "state", { ownerId: owner.id, x: 108, y: 200 });
    const nodes = [owner, a, b];
    expect(arrangeLayouts(nodes, [a.id, b.id], "top")).toMatchObject({ layouts: [], reason: expect.stringContaining("重叠") });
    const readonly = [owner, { ...a, occurrenceRole: "reference" as const }, b];
    expect(fitStateContainers(readonly)).toEqual(readonly);
    expect(autoLayout(readonly, [], "right").reason).toContain("只读");
  });
});
