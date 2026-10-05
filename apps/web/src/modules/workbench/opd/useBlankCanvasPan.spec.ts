import type { Graph } from "@antv/x6";
import { describe, expect, it, vi } from "vitest";
import { useBlankCanvasPan } from "./useBlankCanvasPan";

describe("选择模式空白平移", () => {
  it("超过阈值才平移，保留选择并在下次点击恢复取消选择", () => {
    const f = fixture(); f.pan.start(f.event()); f.pan.move(f.event({ clientX: 102, clientY: 201 }));
    expect(f.translate).toHaveBeenCalledTimes(1); expect(f.pan.dragging.value).toBe(false);
    f.pan.move(f.event({ clientX: 140, clientY: 230 }));
    expect(f.translate).toHaveBeenLastCalledWith(50, 50); expect(f.pan.dragging.value).toBe(true);
    f.pan.finish(f.event()); expect(f.pan.dragging.value).toBe(false); expect(f.pan.consumesClick()).toBe(true);
    expect(f.element.releasePointerCapture).toHaveBeenCalledWith(1);
    f.pan.start(f.event()); f.pan.finish(f.event()); expect(f.pan.consumesClick()).toBe(false);
  });
  it("节点、边、右键、触摸与工具禁用时不抢占手势", () => {
    const f = fixture(), cell = document.createElementNS("http://www.w3.org/2000/svg", "g");
    cell.classList.add("x6-cell"); const body = document.createElementNS(cell.namespaceURI, "rect"); cell.append(body);
    for (const fields of [{ target: body }, { button: 2 }, { pointerType: "touch" }]) f.pan.start(f.event(fields));
    f.setAllowed(false); f.pan.start(f.event());
    expect(f.element.setPointerCapture).not.toHaveBeenCalled();
    f.pan.move(f.event({ clientX: 150 })); expect(f.translate).not.toHaveBeenCalled();
  });
  it("取消、失焦、释放和工具变化结束捕获，后续移动不再平移", () => {
    const f = fixture();
    for (const finish of [() => f.pan.finish(f.event()), () => f.pan.stop()]) {
      f.pan.start(f.event()); f.pan.move(f.event({ clientX: 150 })); finish();
      const calls = f.translate.mock.calls.length; f.pan.move(f.event({ clientX: 180 }));
      expect(f.translate).toHaveBeenCalledTimes(calls); expect(f.pan.dragging.value).toBe(false);
    }
    f.pan.start(f.event()); f.setAllowed(false); f.pan.move(f.event({ clientX: 150 }));
    expect(f.pan.dragging.value).toBe(false); expect(f.element.releasePointerCapture).toHaveBeenCalledTimes(3);
  });
  it("其他指针不能移动或结束当前鼠标手势", () => {
    const f = fixture(); f.pan.start(f.event()); f.pan.move(f.event({ pointerId: 2, clientX: 160 }));
    f.pan.finish(f.event({ pointerId: 2 })); expect(f.element.releasePointerCapture).not.toHaveBeenCalled();
    f.pan.move(f.event({ clientX: 140 })); expect(f.translate).toHaveBeenLastCalledWith(50, 20); f.pan.stop();
  });
});

function fixture() {
  let allowed = true;
  const element = document.createElement("div");
  element.setPointerCapture = vi.fn(); element.releasePointerCapture = vi.fn(); element.hasPointerCapture = vi.fn(() => true);
  const translate = vi.fn(() => ({ tx: 10, ty: 20 }));
  const pan = useBlankCanvasPan(() => ({ translate }) as unknown as Graph, () => allowed);
  const event = (fields: Record<string, unknown> = {}) => ({ pointerId: 1, pointerType: "mouse", button: 0,
    clientX: 100, clientY: 200, target: element, currentTarget: element, preventDefault: vi.fn(), ...fields }) as unknown as PointerEvent;
  return { pan, element, translate, event, setAllowed: (value: boolean) => { allowed = value; } };
}
