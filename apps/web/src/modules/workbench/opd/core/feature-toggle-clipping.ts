import type { Graph } from "@antv/x6";
import { circleUnionPath } from "./circle-union";

/** Keep raised State links visible inside owners without intercepting their controls. */
export function createFeatureToggleClipping(getGraph: () => Graph | undefined, owners: () => ReadonlySet<string>) {
  let path: SVGPathElement | undefined;
  let signature = "";
  const clipped = new WeakSet<object>();
  return () => {
    const graph = getGraph();
    if (!graph?.view?.defs) return;
    if (!path && !owners().size) return;
    const id = `feature-toggle-clip-${graph.view.cid}`;
    if (!path?.isConnected) {
      const clip = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
      clip.id = id; clip.setAttribute("clipPathUnits", "userSpaceOnUse");
      path = document.createElementNS(clip.namespaceURI, "path") as SVGPathElement;
      path.setAttribute("clip-rule", "evenodd"); clip.append(path); graph.view.defs.append(clip);
      signature = "";
    }
    const centers: { x: number; y: number }[] = [];
    let lowestControlLayer = Infinity;
    for (const owner of owners()) {
      const cell = graph.getCellById(owner);
      if (!cell?.isNode()) continue;
      const position = cell.getPosition(), size = cell.getSize();
      lowestControlLayer = Math.min(lowestControlLayer, cell.getZIndex() ?? 0);
      const x = position.x + size.width - 13, y = position.y + 13;
      centers.push({ x, y });
    }
    const next = JSON.stringify(centers);
    if (next !== signature || !path.hasAttribute("d")) {
      path.setAttribute("d", `M-10000000,-10000000H10000000V10000000H-10000000Z${circleUnionPath(centers, 8)}`);
      signature = next;
    }
    for (const edge of graph.getEdges()) {
      // Ordinary links already sit below the controls. Avoid repainting them
      // with a complex clip whenever an unrelated feature is introduced.
      if ((edge.getZIndex() ?? 0) < lowestControlLayer) continue;
      if (clipped.has(edge)) continue;
      edge.attr({ wrap: { clipPath: `url(#${id})` }, line: { clipPath: `url(#${id})` } });
      clipped.add(edge);
    }
  };
}
