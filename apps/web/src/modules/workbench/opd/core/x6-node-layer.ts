import type { Graph } from "@antv/x6";
import type { OpdNode } from "@/shared/types/modeling";
import { constrainStatePosition, nodeDimensions } from "./node-geometry";

/** 节点及 State 附属图形的渲染、同步和移动；Graph 由画布唯一持有。 */
export function createX6NodeLayer(props: { nodes: OpdNode[]; selectedId: string; zoom: number }, getGraph: () => Graph | undefined, updateNameEditorPosition: () => void) {
  function renderNodes() {
    const graph = getGraph();
    props.nodes.forEach((node) => {
      const isState = node.kind === "state";
      const isFeature = node.kind === "attribute" || node.kind === "operation";
      const isInitial = node.stateRoles?.includes("INITIAL");
      const isFinal = node.stateRoles?.includes("FINAL");
      const size = nodeDimensions(node);
      graph?.addNode({
        id: node.id,
        shape: node.kind === "process" || node.kind === "operation" ? "ellipse" : "rect",
        x: node.x,
        y: node.y,
        width: size.width,
        height: size.height,
        zIndex: isState ? 3 : 2,
        label: node.label,
        attrs: {
          body: {
            "data-opm-capture-cell-id": node.occurrenceId,
            "data-testid": `p03-occurrence-${node.occurrenceId}`,
            fill: node.id === props.selectedId ? "#eaf3fc" : "#ffffff",
            stroke: "#20242a",
            strokeWidth: isInitial ? 4 : 2,
            rx: isState ? 14 : isFeature ? 4 : 0,
            ry: isState ? 14 : isFeature ? 4 : 0,
          },
          label: {
            fill: "#171a1f",
            refY: props.nodes.some((child) => child.kind === "state" && child.ownerId === node.id) ? 14 : "50%",
            fontSize: isState ? 11 : 13,
            fontWeight: 600,
          },
        },
      });
      if (isState && isFinal) {
        graph?.addNode({ id: `state.final-outline.${node.id}`, shape: "rect", x: node.x + 3, y: node.y + 3, width: size.width - 6, height: size.height - 6, zIndex: 4, attrs: { body: { pointerEvents: "none", fill: "transparent", stroke: "#20242a", strokeWidth: 1, rx: 11, ry: 11 }, label: { text: "" } } });
      }
      if (isState && node.stateRoles?.includes("DEFAULT") && node.ownerId) {
        graph?.addEdge({ id: `state.default.${node.id}`, source: node.ownerId, target: node.id, zIndex: 1, attrs: { line: { stroke: "#20242a", strokeWidth: 1.5, targetMarker: { name: "classic", width: 8, height: 6, fill: "#ffffff", stroke: "#20242a" } } } });
      }
    });
  }

  function graphNodeStructure() {
    return JSON.stringify({
      nodes: props.nodes.map((node) => ({
        id: node.id,
        occurrenceId: node.occurrenceId,
        label: node.label,
        kind: node.kind,
        ownerId: node.ownerId,
        stateRoles: node.stateRoles,
        width: node.width,
        height: node.height,
      })),
    });
  }

  function syncGraphPresentation() {
    const graph = getGraph();
    props.nodes.forEach((node) => {
      const cell = graph?.getCellById(node.id);
      if (!cell?.isNode()) return;
      cell.position(node.x, node.y);
      positionStateOutline(node.id, node.x, node.y);
      cell.attr("body/fill", node.id === props.selectedId ? "#eaf3fc" : "#ffffff");
    });
    graph?.zoomTo(props.zoom / 100);
    updateNameEditorPosition();
  }

  function positionStateOutline(id: string, x: number, y: number) {
    const graph = getGraph();
    const outline = graph?.getCellById(`state.final-outline.${id}`);
    if (outline?.isNode()) outline.position(x + 3, y + 3);
  }

  function movePresentation(model: OpdNode, position: { x: number; y: number }) {
    const graph = getGraph();
    const constrained = constrainStatePosition(model, props.nodes, position);
    const cell = graph?.getCellById(model.id);
    if (cell?.isNode()) cell.position(constrained.x, constrained.y);
    positionStateOutline(model.id, constrained.x, constrained.y);
    if (model.kind !== "state") props.nodes.forEach((child) => {
      if (child.kind !== "state" || child.ownerId !== model.id || child.occurrenceRole !== "owned") return;
      const x = child.x + constrained.x - model.x, y = child.y + constrained.y - model.y;
      const childCell = graph?.getCellById(child.id);
      if (childCell?.isNode()) childCell.position(x, y);
      positionStateOutline(child.id, x, y);
    });
    return constrained;
  }

  return { renderNodes, graphNodeStructure, syncGraphPresentation, movePresentation };
}
