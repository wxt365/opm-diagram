import type { Graph } from "@antv/x6";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createCanvasViewport, fittedViewport } from "./canvas-viewport";

afterEach(() => vi.unstubAllGlobals());
describe("画布视口", () => {
  it("宽图按实际窄屏进入边距内，包含负坐标且缩放可小于 25%", () => {
    const content = { x: -300, y: 200, width: 2600, height: 600 }, area = { x: 0, y: 0, width: 390, height: 420 };
    const fit = fittedViewport(content, area)!;
    expect(fit.zoom).toBeLessThan(25);
    expect(content.x * fit.zoom / 100 + fit.tx).toBeGreaterThanOrEqual(32);
    expect((content.x + content.width) * fit.zoom / 100 + fit.tx).toBeLessThanOrEqual(358);
    expect(content.y * fit.zoom / 100 + fit.ty).toBeGreaterThanOrEqual(32);
    expect((content.y + content.height) * fit.zoom / 100 + fit.ty).toBeLessThanOrEqual(388);
    expect(fittedViewport({ ...content, width: 0 }, area)).toBeNull();
  });
  it("小图不超过 100%，桌面预览条保留顶部空间", () => {
    const content = { x: 50, y: 100, width: 100, height: 200 };
    const fit = fittedViewport(content, { x: 0, y: 0, width: 1000, height: 400 }, 88)!;
    expect(fit.zoom).toBe(100); expect(content.y + fit.ty).toBeGreaterThanOrEqual(88);
  });
  it("适应后 resize 更新，手动平移或缩放退出适应，缩放使用可见中心", () => {
    const { viewport, flush, graph, content, onZoom } = fixture();
    viewport.fitToView(); flush(); expect(onZoom).toHaveBeenLastCalledWith(12.53);
    expect(graph.getContentArea).toHaveBeenCalledWith({ useCellGeometry: false });
    content.width = 800; viewport.scheduleFit(); flush(); expect(onZoom).toHaveBeenLastCalledWith(40.75);
    // 显示百分比回传不会把适应模式关掉。
    viewport.setZoom(40.75); content.width = 1000; viewport.scheduleFit(); flush(); expect(onZoom).toHaveBeenLastCalledWith(32.6);
    viewport.viewportChanged(); content.width = 500; viewport.scheduleFit(); flush(); expect(onZoom).toHaveBeenLastCalledWith(32.6);
    viewport.fitToView(); flush(); viewport.setZoom(80); viewport.scheduleFit(); flush();
    expect(graph.zoomTo).toHaveBeenLastCalledWith(0.8, { center: { x: 195, y: 210 } });
  });
  it("预览取消还原比例、平移、滚动和适应状态，并取消排队的预览适应", () => {
    const { viewport, flush, graph, outer } = fixture();
    graph.scale(0.75); graph.translate(25, -90); outer.scrollLeft = 120; outer.scrollTop = 24;
    const saved = viewport.captureViewport()!;
    viewport.fitToView(); flush(); viewport.scheduleFit(); viewport.restoreViewport(saved); flush();
    expect(viewport.captureViewport()).toEqual(saved);
    expect(outer.scrollLeft).toBe(120); expect(outer.scrollTop).toBe(24);
    viewport.scheduleFit(); flush(); expect(viewport.captureViewport()).toEqual(saved);
  });
  it("空图适应恢复原点和 100%，恢复 100% 即使比例相同也退出适应", () => {
    const { viewport, flush, graph, content, onZoom } = fixture();
    content.width = 0; viewport.fitToView(); flush(); expect(onZoom).toHaveBeenLastCalledWith(100);
    expect(graph.translate).toHaveBeenLastCalledWith(0, 0);
    viewport.resetZoom(); content.width = 4000; viewport.scheduleFit(); flush(); expect(onZoom).toHaveBeenLastCalledWith(100);
  });
});

function fixture() {
  let scale = 1, tx = 0, ty = 0, nextFrame = 1;
  const callbacks = new Map<number, FrameRequestCallback>();
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { const id = nextFrame++; callbacks.set(id, callback); return id; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => callbacks.delete(id));
  const flush = () => { const entries = [...callbacks.values()]; callbacks.clear(); entries.forEach(callback => callback(0)); };
  const content = { x: -300, y: 200, width: 2600, height: 600 };
  const graph = { getContentArea: vi.fn(() => content),
    scale: vi.fn((value?: number) => { if (value !== undefined) scale = value; return { sx: scale, sy: scale }; }),
    translate: vi.fn((x?: number, y?: number) => { if (x !== undefined) { tx = x; ty = y!; } return { tx, ty }; }), zoomTo: vi.fn() };
  const outer = document.createElement("div"), host = document.createElement("div"), element = document.createElement("div");
  outer.append(host); host.append(element);
  outer.getBoundingClientRect = () => ({ left: 100, top: 200, width: 390, height: 420 }) as DOMRect;
  element.getBoundingClientRect = () => ({ left: 100, top: 200, width: 620, height: 420 }) as DOMRect;
  const onZoom = vi.fn();
  return { viewport: createCanvasViewport(() => graph as unknown as Graph, () => element, onZoom, () => 32), graph, content, outer, flush, onZoom };
}
