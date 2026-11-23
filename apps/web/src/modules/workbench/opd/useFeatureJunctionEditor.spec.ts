import type { Graph } from "@antv/x6";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OpdNode } from "@/shared/types/modeling";
import { useFeatureJunctionEditor } from "./useFeatureJunctionEditor";

const cleanups: (() => void)[] = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));
function fixture() {
  const owner = { id: "owner", occurrenceId: "occ.owner", kind: "object", x: 80, y: 80, width: 160, height: 72, occurrenceRole: "owned" } as OpdNode;
  let editable = true;
  const graph = { getCellById: () => ({}), localToClient: (p: { x: number; y: number }) => ({ x: p.x * 2 + 100, y: p.y * 2 + 40 }),
    clientToLocal: (x: number, y: number) => ({ x: (x - 100) / 2, y: (y - 40) / 2 }) } as unknown as Graph;
  const host = document.createElement("div"), button = document.createElement("button");
  host.getBoundingClientRect = () => ({ left: 100, top: 40 }) as DOMRect;
  button.setPointerCapture = vi.fn(); button.hasPointerCapture = () => true; button.releasePointerCapture = vi.fn();
  const change = vi.fn(), preview = vi.fn(), select = vi.fn();
  const editor = useFeatureJunctionEditor({ graph: () => graph, host: () => host, nodes: () => [owner], editable: () => editable, change, preview, select });
  button.addEventListener("pointerdown", event => editor.start(owner.id, event as PointerEvent));
  function pointer(type: string, x: number, y: number, id = 1) {
    const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true, cancelable: true });
    Object.defineProperty(event, "pointerId", { value: id });
    (type === "pointerdown" ? button : window).dispatchEvent(event);
  }
  editor.refresh(); cleanups.push(editor.clear);
  return { ...editor, pointer, change, preview, select, owner, setEditable: (value: boolean) => { editable = value; } };
}
describe("feature junction dragging", () => {
  it("selects without editing and keeps graph coordinates correct under zoom", () => {
    const f = fixture(); expect(f.handles.value[0]).toMatchObject({ x: 536, y: 232 });
    f.pointer("pointerdown", 636, 272); f.pointer("pointerup", 636, 272);
    expect(f.select).toHaveBeenCalledTimes(1); expect(f.change).not.toHaveBeenCalled();
    f.pointer("pointerdown", 636, 272); f.pointer("pointermove", 716, 332, 2); expect(f.preview).not.toHaveBeenCalled();
    f.pointer("pointermove", 716, 332); expect(f.change).not.toHaveBeenCalled();
    expect(f.preview.mock.lastCall?.[0][0].edgeRoutes[0].points).toEqual([{ x: 308, y: 146 }]);
    f.pointer("pointerup", 716, 332); f.pointer("pointerup", 716, 332);
    expect(f.change).toHaveBeenCalledExactlyOnceWith("occ.owner", { segment: "feature.characterization.junction", style: "STRAIGHT", mode: "MANUAL", points: [{ x: 308, y: 146 }] });
    expect(f.owner.edgeRoutes).toBeUndefined();
    f.reset(); expect(f.change.mock.lastCall?.[1]).toMatchObject({ mode: "AUTO", points: [] });
  });
  it.each(["Escape", "pointercancel", "blur", "readonly", "clear"])("%s restores the preview and does not commit", cancellation => {
    const f = fixture(); f.pointer("pointerdown", 636, 272); f.pointer("pointermove", 716, 332);
    if (cancellation === "Escape") window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    if (cancellation === "pointercancel") f.pointer("pointercancel", 716, 332);
    if (cancellation === "blur") window.dispatchEvent(new Event("blur"));
    if (cancellation === "readonly") { f.setEditable(false); f.pointer("pointerup", 716, 332); }
    if (cancellation === "clear") f.clear();
    f.pointer("pointerup", 716, 332);
    expect(f.preview.mock.lastCall?.[0]).toEqual([f.owner]); expect(f.change).not.toHaveBeenCalled(); expect(f.dragging.value).toBe(false);
  });
});
