import type { Graph } from "@antv/x6";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { createCanvasMovement } from "./canvas-movement";

afterEach(() => vi.unstubAllGlobals());

describe("画布移动预览", () => {
  it("连续事件合并一帧，结束冲刷最终位置，所属状态只移动一次", () => {
    const frames = new Map<number, FrameRequestCallback>();
    let sequence = 0;
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++sequence, callback); return sequence; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const nodes = [node("owner", "object", 80, 80), { ...node("state", "state", 96, 112), ownerId: "owner", stateRoles: ["FINAL"] as OpdNode["stateRoles"] }];
    const cells = new Map(["owner", "state", "state.final-outline.state"].map(id => [id, { isNode: () => true, position: vi.fn(), resize: vi.fn() }]));
    const syncFeatures = vi.fn();
    const movement = createCanvasMovement({ nodes: () => nodes, visibleNodes: () => nodes, selection: () => ["owner", "state"], syncFeatures,
      graph: () => ({ getCellById: (id: string) => cells.get(id) }) as Graph });
    movement.start("owner");
    for (let step = 1; step <= 20; step++) movement.schedule("owner", { x: 80 + step, y: 80 + step });
    expect(frames.size).toBe(1);
    const callback = [...frames.values()][0]; frames.clear(); callback(0);
    expect(cells.get("owner")!.position).toHaveBeenCalledExactlyOnceWith(100, 100);
    expect(cells.get("state")!.position).toHaveBeenCalledExactlyOnceWith(116, 132);
    expect(cells.get("state.final-outline.state")!.position).toHaveBeenCalledExactlyOnceWith(119, 135);
    movement.schedule("owner", { x: 110, y: 110 });
    const final = movement.finish("owner", { x: 112, y: 112 });
    expect(frames.size).toBe(0);
    expect(final).toEqual([
      { occurrence_id: "occurrence.owner", layout: { x: 112, y: 112, width: 160, height: 72 } },
      { occurrence_id: "occurrence.state", layout: { x: 128, y: 144, width: 88, height: 28 } },
    ]);
    expect(syncFeatures).not.toHaveBeenCalled();
  });

  it("切图或卸载取消未执行帧，特征移动同步最终所有者几何", () => {
    const frames = new Map<number, FrameRequestCallback>();
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(1, callback); return 1; });
    vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
    const nodes = [node("owner", "object", 80, 80), { ...node("feature", "attribute", 320, 80), ownerId: "owner" }];
    const syncFeatures = vi.fn();
    const movement = createCanvasMovement({ nodes: () => nodes, visibleNodes: () => nodes, selection: id => [id], syncFeatures, graph: () => undefined });
    movement.start("feature"); movement.schedule("feature", { x: 352, y: 112 }); movement.cancel();
    expect(frames.size).toBe(0); expect(syncFeatures).not.toHaveBeenCalled();
    movement.finish("feature", { x: 368, y: 128 });
    expect(syncFeatures).toHaveBeenCalledExactlyOnceWith([nodes[0], { ...nodes[1], x: 368, y: 128, width: 132, height: 44 }]);
  });

  it("拖动对象不会重新绘制已折叠特征的连接", () => {
    const nodes = [node("owner", "object", 80, 80), { ...node("feature", "attribute", 320, 80), ownerId: "owner" }];
    const syncFeatures = vi.fn();
    const movement = createCanvasMovement({ nodes: () => nodes, visibleNodes: () => [nodes[0]], selection: id => [id], syncFeatures, graph: () => undefined });
    movement.finish("owner", { x: 112, y: 112 });
    expect(syncFeatures).not.toHaveBeenCalled();
  });
});

function node(id: string, kind: OpdNode["kind"], x: number, y: number): OpdNode {
  return { id, occurrenceId: `occurrence.${id}`, kind, x, y, label: id, valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "任务", occurrenceRole: "owned" };
}
