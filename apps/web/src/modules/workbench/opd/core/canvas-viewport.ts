import type { Graph } from "@antv/x6";

type Box = { x: number; y: number; width: number; height: number };
export type CanvasViewport = { zoom: number; tx: number; ty: number; fitted: boolean; paddingTop: number; scrollLeft: number; scrollTop: number };

export function fittedViewport(content: Box, viewport: Box, topPadding = 32) {
  if (!content.width || !content.height || viewport.width <= 64 || viewport.height <= topPadding + 32) return null;
  const ratio = Math.min(1, (viewport.width - 64) / content.width, (viewport.height - topPadding - 32) / content.height);
  // 向下取整，避免显示百分比回传后把内容放大到边界外。
  const zoom = Math.max(0.01, Math.floor(ratio * 10000 + 1e-9) / 100), scale = zoom / 100;
  return { zoom, tx: viewport.x + viewport.width / 2 - (content.x + content.width / 2) * scale,
    ty: viewport.y + topPadding + (viewport.height - topPadding - 32) / 2 - (content.y + content.height / 2) * scale };
}

export function createCanvasViewport(getGraph: () => Graph | undefined, getElement: () => HTMLElement | undefined,
  onZoom: (zoom: number) => void, topPadding: () => number) {
  let fitted = false, changing = false, frameId = 0, paddingTop = 32;
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
    if (result) change(result.zoom, result.tx, result.ty);
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
  function dispose() { cancelAnimationFrame(frameId); }
  return { fitToView, setZoom, resetZoom, captureViewport, restoreViewport, viewportChanged, scheduleFit, dispose };
}
