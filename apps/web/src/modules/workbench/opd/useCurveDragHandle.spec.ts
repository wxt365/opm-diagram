import { afterEach, describe, expect, it, vi } from "vitest";
import type { Edge, Graph } from "@antv/x6";
import { useCurveDragHandle } from "./useCurveDragHandle";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));

function fixture() {
  let vertices: { x: number; y: number }[] = [], editable = true, tx = 100;
  const setVertices = vi.fn((points: typeof vertices) => { vertices = points; });
  const edge = { id: "fact", getVertices: () => vertices, getConnector: () => ({ name: "opm-bezier" }), setVertices } as unknown as Edge;
  const view = { isEdgeView: () => true, getPointAtRatio: () => ({ x: 300, y: 160 }) };
  const graph = { findViewByCell: () => view,
    localToClient: (p: { x: number; y: number }) => ({ x: p.x * 2 + tx, y: p.y * 2 + 40 }),
    clientToLocal: (x: number, y: number) => ({ x: (x - tx) / 2, y: (y - 40) / 2 }) } as unknown as Graph;
  const host = document.createElement("div"), button = document.createElement("button");
  host.getBoundingClientRect = () => ({ left: 100, top: 40 }) as DOMRect;
  button.setPointerCapture = vi.fn(); button.hasPointerCapture = () => true; button.releasePointerCapture = vi.fn();
  const commit = vi.fn();
  const editor = useCurveDragHandle({ graph: () => graph, host: () => host, edges: () => [edge], editable: () => editable, commit });
  button.addEventListener("pointerdown", event => editor.start("fact", event as PointerEvent));
  function pointer(type: string, x: number, y: number, id = 1) {
    const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: id });
    (type === "pointerdown" ? button : window).dispatchEvent(event);
  }
  editor.refresh();
  cleanups.push(editor.clear);
  return { ...editor, pointer, setVertices, commit, edge, button, setEditable: (value: boolean) => { editable = value; }, setTx: (value: number) => { tx = value; } };
}

describe("curve curvature handle", () => {
  it("shows the actual curve midpoint without changing geometry or recording an edit; follows viewport translation", () => {
    const f = fixture();
    expect(f.handles.value).toEqual([{ id: "fact", x: 600, y: 320 }]);
    expect(f.setVertices).not.toHaveBeenCalled(); expect(f.commit).not.toHaveBeenCalled();
    f.setTx(160); f.refresh();
    expect(f.handles.value[0]!.x).toBe(660);
    f.setEditable(false); f.refresh(); expect(f.handles.value).toEqual([]);
  });
  it("previews in graph coordinates at zoom 200%, ignores a second pointer and commits only once on release", () => {
    const f = fixture();
    f.pointer("pointerdown", 704, 360);
    f.pointer("pointermove", 744, 400, 2); expect(f.setVertices).not.toHaveBeenCalled();
    f.pointer("pointermove", 744, 400);
    expect(f.edge.getVertices()).toEqual([{ x: 320, y: 180 }]);
    expect(f.handles.value).toEqual([{ id: "fact", x: 640, y: 360 }]);
    expect(f.commit).not.toHaveBeenCalled(); expect(f.dragging.value).toBe(true);
    f.pointer("pointerup", 744, 400);
    expect(f.commit).toHaveBeenCalledExactlyOnceWith(f.edge);
    expect(f.dragging.value).toBe(false);
    f.pointer("pointerup", 744, 400); expect(f.commit).toHaveBeenCalledTimes(1);
    f.pointer("pointermove", 900, 600); expect(f.edge.getVertices()).toEqual([{ x: 320, y: 180 }]);
  });
  it("clicking the handle or releasing within the drag threshold does not create a manual route", () => {
    const f = fixture();
    f.pointer("pointerdown", 700, 360); f.pointer("pointerup", 701, 361);
    expect(f.commit).not.toHaveBeenCalled(); expect(f.setVertices).not.toHaveBeenCalled();
    expect(f.handles.value).toHaveLength(1);
  });
  it.each(["Escape", "pointercancel", "blur", "readonly", "clear"])("%s cancels the uncommitted preview and releases listeners", cancellation => {
    const f = fixture(); f.pointer("pointerdown", 700, 360); f.pointer("pointermove", 740, 400);
    if (cancellation === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    if (cancellation === "pointercancel") f.pointer("pointercancel", 740, 400);
    if (cancellation === "blur") window.dispatchEvent(new Event("blur"));
    if (cancellation === "readonly") { f.setEditable(false); f.pointer("pointerup", 740, 400); }
    if (cancellation === "clear") f.clear();
    expect(f.edge.getVertices()).toEqual([]); expect(f.commit).not.toHaveBeenCalled(); expect(f.dragging.value).toBe(false);
    f.pointer("pointerup", 740, 400); expect(f.commit).not.toHaveBeenCalled();
    expect(f.button.releasePointerCapture).toHaveBeenCalled();
  });
  it("leaves existing manual vertices to the standard path editor and clears without changing saved geometry", () => {
    const f = fixture(); f.edge.setVertices([{ x: 300, y: 280 }]); f.refresh();
    expect(f.handles.value).toEqual([]);
    f.pointer("pointerdown", 700, 600); f.pointer("pointermove", 740, 700); f.pointer("pointerup", 740, 700);
    f.clear(); expect(f.edge.getVertices()).toEqual([{ x: 300, y: 280 }]); expect(f.commit).not.toHaveBeenCalled();
  });
});
