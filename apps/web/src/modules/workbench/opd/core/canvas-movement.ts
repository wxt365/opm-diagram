import type { Graph } from "@antv/x6";
import type { OpdNode } from "@/shared/types/modeling";
import { prepareSelectionMove, type NodeLayout } from "@/stores/workbench/layoutSelection";
import { nodeDimensions } from "./node-geometry";
import { translatedFeatureLayouts } from "@/stores/workbench/featureOwnerLayout";

export function createCanvasMovement(input: { graph: () => Graph | undefined; nodes: () => OpdNode[];
  visibleNodes: () => OpdNode[];
  selection: (id: string) => readonly string[]; syncFeatures: (nodes: OpdNode[]) => void;
  syncRoutes?: (nodes: OpdNode[]) => void }) {
  let frame = 0, pending: { id: string; x: number; y: number } | null = null;
  let activeId = "", calculate: ReturnType<typeof prepareSelectionMove> | undefined;
  let byOccurrence = new Map<string, OpdNode>();
  let byId = new Map<string, OpdNode>(), featureOwners = new Set<string>();
  let previewed = new Set<string>();
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
    const current = new Set(layouts.map(item => item.occurrence_id));
    // 指针回到原位或被避让时，也要恢复上一帧扩容及 X6 已自行移动的节点。
    const restored = [...new Set([...previewed, model.occurrenceId])].filter(id => !current.has(id)).flatMap(id => {
      const node = byOccurrence.get(id);
      return node ? [{ occurrence_id: id, layout: { x: node.x, y: node.y, ...nodeDimensions(node) } }] : [];
    });
    const updates = [...restored, ...layouts];
    for (const item of updates) {
      const node = byOccurrence.get(item.occurrence_id); if (!node) continue;
      changed.set(node.id, item.layout);
      const cell = graph?.getCellById(node.id);
      if (cell?.isNode()) { cell.position(item.layout.x, item.layout.y); cell.resize?.(item.layout.width, item.layout.height); }
      const outline = graph?.getCellById(`state.final-outline.${node.id}`);
      if (outline?.isNode()) { outline.position(item.layout.x + 3, item.layout.y + 3); outline.resize?.(item.layout.width - 6, item.layout.height - 6); }
    }
    // A moved unrelated object can become a new obstacle for an expanded feature fan.
    if (featureOwners.size && updates.length) {
      const nodes = input.visibleNodes(), preview = nodes.map(node => changed.has(node.id) ? { ...node, ...changed.get(node.id) } : node);
      const routes = new Map(translatedFeatureLayouts(nodes, preview).map(item => [item.occurrence_id, item.layout.edge_routes]));
      input.syncFeatures(preview.map(node => routes.has(node.occurrenceId) ? { ...node, edgeRoutes: routes.get(node.occurrenceId) } : node));
    }
    if (input.syncRoutes) {
      const nodes = input.visibleNodes();
      input.syncRoutes(nodes.map(node => changed.has(node.id) ? { ...node, ...changed.get(node.id) } : node));
    }
    previewed = current;
    return layouts;
  }
  function schedule(id: string, position: { x: number; y: number }) {
    pending = { id, ...position }; if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; const next = pending; pending = null; if (next) preview(next.id, next); });
  }
  function finish(id: string, position: { x: number; y: number }) { cancelAnimationFrame(frame); frame = 0; pending = null; return preview(id, position); }
  function cancel() { cancelAnimationFrame(frame); frame = 0; pending = null; activeId = ""; calculate = undefined; byOccurrence.clear(); byId.clear(); featureOwners.clear(); previewed.clear(); }
  return { start, schedule, finish, cancel };
}
