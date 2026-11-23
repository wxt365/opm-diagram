import type { Graph } from "@antv/x6";

type Box = { x: number; y: number; width: number; height: number };
export type CanvasViewport = { zoom: number; tx: number; ty: number; fitted: boolean; paddingTop: number; scrollLeft: number; scrollTop: number };

export { fittedViewport } from "@/shared/canvas/viewport";
import { fittedViewport } from "@/shared/canvas/viewport";

export function createCanvasViewport(getGraph: () => Graph | undefined, getElement: () => HTMLElement | undefined,
  onZoom: (zoom: number) => void, topPadding: () => number) {
  let fitted = false, changing = false, frameId = 0, paddingTop = 32;
  let presentationObserver: MutationObserver | undefined;
  const frame = () => getElement()?.parentElement?.parentElement;
  function visibleArea(): Box {
    const element = getElement()?.getBoundingClientRect(), outer = frame()?.getBoundingClientRect();
    if (!element || !outer) return { x: 0, y: 0, width: 0, height: 0 };
    return { x: Math.max(0, outer.left - element.left), y: Math.max(0, outer.top - element.top),
      width: Math.min(outer.width, element.width), height: Math.min(outer.height, element.height) };
  }
  function change(zoom: number, tx: number, ty: number) {
    const graph = getGraph(); if (!graph) return;
    changing = true;
    try { graph.scale(zoom / 100); graph.translate(tx, ty); onZoom(zoom); }
    finally { changing = false; }
  }
  function fitNow() {
    const graph = getGraph(), outer = frame(); if (!graph || !fitted) return;
    if (outer) { outer.scrollLeft = 0; outer.scrollTop = 0; }
    // 使用实际 SVG 边界，包含文字和关系装饰；模型几何框不包含这些内容。
    const content = graph.getContentArea({ useCellGeometry: false });
    if (!content.width || !content.height) { change(100, 0, 0); return; }
    const result = fittedViewport(content, visibleArea(), paddingTop);
    if (result && (Math.abs(graph.scale().sx * 100 - result.zoom) > 1e-7
      || Math.abs(graph.translate().tx - result.tx) > 1e-7 || Math.abs(graph.translate().ty - result.ty) > 1e-7))
      change(result.zoom, result.tx, result.ty);
  }
  function scheduleFit() {
    if (!fitted || frameId) return;
    frameId = requestAnimationFrame(() => { frameId = 0; fitNow(); });
  }
  function fitToView() { fitted = true; paddingTop = topPadding(); scheduleFit(); }
  function setZoom(zoom: number) {
    const graph = getGraph(); if (!graph || Math.abs(graph.scale().sx * 100 - zoom) < 0.00001) return;
    fitted = false;
    const area = visibleArea();
    graph.zoomTo(zoom / 100, { center: { x: area.x + area.width / 2, y: area.y + area.height / 2 } });
  }
  function resetZoom() { fitted = false; setZoom(100); onZoom(100); }
  function getElementPosition() {
    const graph = getGraph(), area = visibleArea();
    if (!graph || !area.width || !area.height) return;
    const { sx, sy } = graph.scale(), { tx, ty } = graph.translate();
    if (sx <= 0 || sy <= 0) return;
    fitted = false;
    cancelAnimationFrame(frameId); frameId = 0;
    return { x: (area.x + area.width / 2 - tx) / sx - 80,
      y: (area.y + area.height / 2 - ty) / sy - 36 };
  }
  function captureViewport(): CanvasViewport | undefined {
    const graph = getGraph(), outer = frame(); if (!graph) return;
    return { zoom: graph.scale().sx * 100, ...graph.translate(), fitted, paddingTop,
      scrollLeft: outer?.scrollLeft ?? 0, scrollTop: outer?.scrollTop ?? 0 };
  }
  function restoreViewport(viewport: CanvasViewport) {
    cancelAnimationFrame(frameId); frameId = 0;
    fitted = viewport.fitted;
    paddingTop = viewport.paddingTop;
    const outer = frame(); if (outer) { outer.scrollLeft = viewport.scrollLeft; outer.scrollTop = viewport.scrollTop; }
    change(viewport.zoom, viewport.tx, viewport.ty);
  }
  function viewportChanged() { if (!changing) fitted = false; }
  function observePresentation() {
    presentationObserver?.disconnect();
    const stage = getElement()?.querySelector('.x6-graph-svg-stage');
    if (!stage || typeof MutationObserver === 'undefined') return;
    // X6 incremental resize/translation does not emit render:done. Fit after the
    // SVG updates too; ignore the viewport's own stage transform to avoid a loop.
    presentationObserver = new MutationObserver(records => {
      if (records.some(record => record.target !== stage || record.type !== 'attributes' || record.attributeName !== 'transform')) scheduleFit();
    });
    presentationObserver.observe(stage, { childList: true, subtree: true, attributes: true, characterData: true });
  }
  function dispose() { cancelAnimationFrame(frameId); presentationObserver?.disconnect(); }
  return { fitToView, setZoom, resetZoom, getElementPosition, captureViewport, restoreViewport, viewportChanged, scheduleFit, observePresentation, dispose };
}
