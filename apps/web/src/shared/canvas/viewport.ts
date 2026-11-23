type Box = { x: number; y: number; width: number; height: number };

export function fittedViewport(content: Box, viewport: Box, topPadding = 32) {
  if (!content.width || !content.height || viewport.width <= 64 || viewport.height <= topPadding + 32) return null;
  const ratio = Math.min(1, (viewport.width - 64) / content.width, (viewport.height - topPadding - 32) / content.height);
  // 向下取整，避免显示百分比回传后把内容放大到边界外。
  const zoom = Math.max(0.01, Math.floor(ratio * 10000 + 1e-9) / 100), scale = zoom / 100;
  return { zoom, tx: viewport.x + viewport.width / 2 - (content.x + content.width / 2) * scale,
    ty: viewport.y + topPadding + (viewport.height - topPadding - 32) / 2 - (content.y + content.height / 2) * scale };
}
