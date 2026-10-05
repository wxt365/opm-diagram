import type { Graph } from "@antv/x6";
import type { OpdNode } from "@/shared/types/modeling";
import { prepareSelectionMove, type NodeLayout } from "@/stores/workbench/layoutSelection";

export function createCanvasMovement(input: { graph: () => Graph | undefined; nodes: () => OpdNode[];
  visibleNodes: () => OpdNode[];
  selection: (id: string) => readonly string[]; syncFeatures: (nodes: OpdNode[]) => void }) {
  let frame = 0, pending: { id: string; x: number; y: number } | null = null;
  let activeId = "", calculate: ReturnType<typeof prepareSelectionMove> | undefined;
  let byOccurrence = new Map<string, OpdNode>();
  let byId = new Map<string, OpdNode>(), featureOwners = new Set<string>();
  function start(id: string) {
    cancel(); activeId = id; const nodes = input.nodes();
    byOccurrence = new Map(nodes.map(node => [node.occurrenceId, node]));
    byId = new Map(nodes.map(node => [node.id, node]));
    featureOwners = new Set(input.visibleNodes().filter(node => node.kind === "attribute" || node.kind === "operation").map(node => node.ownerId!));
    calculate = prepareSelectionMove(nodes, input.selection(id));
  }
  function preview(id: string, position: { x: number; y: number }): NodeLayout[] {
    if (activeId !== id || !calculate) start(id);
    const model = byId.get(id); if (!model) return [];
    const layouts = calculate!(position.x - model.x, position.y - model.y), graph = input.graph();
    const changed = new Map<string, NodeLayout["layout"]>();
    for (const item of layouts) {
      const node = byOccurrence.get(item.occurrence_id); if (!node) continue;
      changed.set(node.id, item.layout);
      const cell = graph?.getCellById(node.id);
      if (cell?.isNode()) { cell.position(item.layout.x, item.layout.y); cell.resize?.(item.layout.width, item.layout.height); }
      const outline = graph?.getCellById(`state.final-outline.${node.id}`);
      if (outline?.isNode()) outline.position(item.layout.x + 3, item.layout.y + 3);
    }
    // 特征所属图形只在几何变化时更新；普通对象拖动无需扫描全图。
    if (layouts.some(item => { const node = byOccurrence.get(item.occurrence_id); return node && (featureOwners.has(node.id) || node.kind === "attribute" || node.kind === "operation"); }))
      input.syncFeatures(input.visibleNodes().map(node => changed.has(node.id) ? { ...node, ...changed.get(node.id) } : node));
    return layouts;
  }
  function schedule(id: string, position: { x: number; y: number }) {
    pending = { id, ...position }; if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; const next = pending; pending = null; if (next) preview(next.id, next); });
  }
  function finish(id: string, position: { x: number; y: number }) { cancelAnimationFrame(frame); frame = 0; pending = null; return preview(id, position); }
  function cancel() { cancelAnimationFrame(frame); frame = 0; pending = null; activeId = ""; calculate = undefined; byOccurrence.clear(); byId.clear(); featureOwners.clear(); }
  return { start, schedule, finish, cancel };
}
