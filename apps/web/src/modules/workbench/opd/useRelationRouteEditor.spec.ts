import type { Edge, Graph } from "@antv/x6";
import { describe, expect, it, vi } from "vitest";
import type { createCanvasScene } from "./core/canvas-scene";
import { useRelationRouteEditor } from "./useRelationRouteEditor";
import type { ConsumptionRelation } from "@/shared/types/modeling";

describe("orthogonal segment editing", () => {
  function setup() {
    let vertices = [{ x: 200, y: 40 }, { x: 200, y: 240 }];
    let router: object | undefined = { name: "manhattan", args: {} };
    const relation = { id: "fact", occurrenceId: "occ.fact" } as ConsumptionRelation;
    const change = vi.fn();
    const edge = { id: "fact", isEdge: () => true, getData: () => ({ routeSegment: "main", routeEditable: "true" }),
      getSource: () => ({ cell: "a" }), getTarget: () => ({ cell: "b" }), setSource: vi.fn(), setTarget: vi.fn(),
      getVertices: () => vertices, setVertices: (points: typeof vertices) => { vertices = points; },
      getRouter: () => router, setRouter: (next: object) => { router = next; }, removeRouter: () => { router = undefined; },
      addTools: vi.fn(), removeTools: vi.fn() };
    const view = { isEdgeView: () => true, update: vi.fn(),
      sourcePoint: { x: 80, y: 40 }, targetPoint: { x: 400, y: 240 }, routePoints: vertices };
    const graph = { getCellById: () => edge, findViewByCell: () => view } as unknown as Graph;
    const scene = { relationForCell: () => relation, relationState: () => new Map([[relation.occurrenceId, { spec: {
      primaryCellId: edge.id, cells: [{ kind: "edge", id: edge.id, data: { routeEditable: "true" } }] } }]]) } as unknown as ReturnType<typeof createCanvasScene>;
    let editable = true;
    const editor = useRelationRouteEditor({ graph: () => graph, host: () => undefined, scene, relations: () => [relation], selectedId: () => relation.id,
      editable: () => editable, change, actions: vi.fn() });
    return { editor, edge, view, change, vertices, setReadonly: () => { editable = false; } };
  }
  it("selection adds segment handles without writing; release commits a sharp manual route; reset restores automatic routing", async () => {
    const f = setup(); f.editor.sync(); expect(f.change).not.toHaveBeenCalled();
    const tool = f.edge.addTools.mock.calls[0]![0][0];
    expect(tool.name).toBe("segments");
    expect(tool.args.anchor).toBeNull();
    expect(tool.args.attrs({ options: { index: 0 } })).toMatchObject({ opacity: 0, "pointer-events": "none" });
    f.edge.setVertices([{ x: 220, y: 40 }, { x: 220, y: 240 }]);
    tool.args.onChanged(); await Promise.resolve();
    expect(f.change).toHaveBeenCalledExactlyOnceWith("occ.fact", { segment: "main", style: "STRAIGHT", mode: "MANUAL", points: [{ x: 220, y: 40 }, { x: 220, y: 240 }] });
    f.editor.reset(); expect(f.change.mock.lastCall![1]).toEqual({ segment: "main", style: "STRAIGHT", mode: "AUTO", points: [] });
  });
  it("deselection restores the automatic router, and readonly never commits a gesture", () => {
    const f = setup(); f.editor.sync(); f.editor.restore();
    expect(f.edge.setSource).toHaveBeenLastCalledWith({ cell: "a" }); expect(f.edge.setTarget).toHaveBeenLastCalledWith({ cell: "b" });
    expect(f.edge.getVertices()).toEqual(f.vertices); expect(f.edge.getRouter()).toEqual({ name: "manhattan", args: {} });
    f.editor.sync(); f.setReadonly(); f.editor.commit(f.edge as unknown as Edge);
    expect(f.change).not.toHaveBeenCalled(); expect(f.edge.getRouter()).toEqual({ name: "manhattan", args: {} });
  });
  it("refreshes asynchronous X6 geometry before exposing segment handles after a node moves", () => {
    const f = setup();
    f.view.update.mockImplementationOnce(() => {
      f.view.sourcePoint = { x: 120, y: 80 };
      f.view.routePoints = [{ x: 220, y: 80 }, { x: 220, y: 240 }];
    });
    f.editor.sync();
    expect(f.edge.getVertices()[0]).toEqual({ x: 144, y: 80 });
    expect(f.view.update).toHaveBeenCalledTimes(2);
    expect(f.change).not.toHaveBeenCalled();
  });
  it("cancelling or switching diagrams invalidates a queued drag commit", async () => {
    const f = setup(); f.editor.sync();
    const tool = f.edge.addTools.mock.calls[0]![0][0];
    f.edge.setVertices([{ x: 250, y: 40 }, { x: 250, y: 240 }]);
    tool.args.onChanged(); f.editor.restore(); await Promise.resolve();
    expect(f.change).not.toHaveBeenCalled(); expect(f.edge.getVertices()).toEqual(f.vertices);
  });

});
