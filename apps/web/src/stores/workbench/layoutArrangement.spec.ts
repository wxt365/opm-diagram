import { describe, expect, it } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { arrangeLayouts, arrangementSelection, type LayoutAction } from "./layoutArrangement";
function node(id: string, x: number, y: number, width: number, height: number, kind: OpdNode["kind"] = "object", ownerId?: string): OpdNode {
  return { id, occurrenceId: id, label: id, x, y, width, height, kind, ownerId, occurrenceRole: "owned",
    valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品" };
}
describe("元素排列", () => {
  const a = node("a", 100, 80, 160, 72), b = node("b", 300, 250, 100, 160, "process");
  it.each<[LayoutAction, number, number]>([
    ["left", 300, 80], ["center-x", 270, 80], ["right", 240, 80],
    ["top", 100, 250], ["center-y", 100, 294], ["bottom", 100, 338],
  ])("%s 根据最后选中元素和真实尺寸计算，基准及尺寸不变", (action, x, y) => {
    const before = structuredClone([a, b]);
    expect(arrangeLayouts([a, b], ["a", "b"], action)).toEqual({ reason: "", layouts: [{ occurrence_id: "a", layout: { x, y, width: 160, height: 72 } }] });
    expect([a, b]).toEqual(before);
  });
  it.each(["distribute-x", "distribute-y"] as const)("%s 固定端点并在不同尺寸间均分空白", action => {
    const nodes = [node("a", 0, 0, 100, 100), node("b", 200, 200, 60, 60), node("c", 450, 450, 140, 140)];
    const result = arrangeLayouts(nodes, ["c", "a", "b"], action);
    expect(result.reason).toBe("");
    expect(result.layouts).toEqual([{ occurrence_id: "b", layout: { x: action === "distribute-x" ? 245 : 200, y: action === "distribute-y" ? 245 : 200, width: 60, height: 60 } }]);
  });
  it("父节点按各自偏移带动状态，父状态同时选择去重", () => {
    const child = node("s", 108, 108, 88, 28, "state", "a");
    const selected = ["a", "s", "b"];
    expect(arrangementSelection([a, child, b], selected).targets.map(node => node.id)).toEqual(["a", "b"]);
    const result = arrangeLayouts([a, child, b], selected, "right");
    expect(result.layouts[1]!.layout).toEqual({ x: 248, y: 108, width: 88, height: 28 });
    expect(result.layouts).toHaveLength(2);
  });
  it("同 owner 状态可以对齐，不压缩 owner；越界整批拒绝", () => {
    const owner = node("owner", 100, 100, 320, 200);
    const wide = node("wide", 108, 128, 150, 28, "state", "owner"), small = node("small", 324, 180, 88, 28, "state", "owner");
    expect(arrangeLayouts([owner, wide, small], ["wide", "small"], "top").layouts).toEqual([{ occurrence_id: "wide", layout: { x: 108, y: 180, width: 150, height: 28 } }]);
    const rejected = arrangeLayouts([owner, wide, small], ["wide", "small"], "left");
    expect(rejected.reason).toContain("超出所属节点"); expect(rejected.layouts).toEqual([]);
  });
  it("独立状态与外部元素或不同 owner 混选、reference 元素均拒绝", () => {
    const owner = node("owner", 0, 0, 200, 200), state = node("s", 20, 40, 88, 28, "state", "owner");
    expect(arrangementSelection([owner, state, a], ["s", "a"]).reason).toContain("同一所属节点");
    expect(arrangementSelection([owner, state, { ...state, id: "s2", ownerId: "a" }, a], ["s", "s2"]).reason).toContain("同一所属节点");
    expect(arrangementSelection([{ ...a, occurrenceRole: "reference" }, b], ["a", "b"]).reason).toContain("可编辑");
  });
  it("少量选择、空间不足不提交；已对齐和等距时无变化", () => {
    expect(arrangeLayouts([a, b], ["a"], "left").reason).toContain("两个");
    expect(arrangeLayouts([a, b], ["a", "b"], "distribute-x").reason).toContain("三个");
    const overlap = [node("a", 0, 0, 100, 72), node("b", 20, 200, 100, 72), node("c", 40, 400, 100, 72)];
    expect(arrangeLayouts(overlap, ["a", "b", "c"], "distribute-x").reason).toContain("空间不足");
    expect(arrangeLayouts([a, { ...b, x: a.x }], ["a", "b"], "left").layouts).toEqual([]);
    expect(arrangeLayouts(overlap, ["a", "b", "c"], "distribute-y").layouts).toEqual([]);
  });
});
