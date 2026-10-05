import type { Graph } from "@antv/x6";
import type { OpdNode } from "@/shared/types/modeling";
import { constrainStatePosition, nodeDimensions } from "./node-geometry";

/** 节点及 State 附属图形的渲染、同步和移动；Graph 由画布唯一持有。 */
export function createX6NodeLayer(props: {
  nodes: OpdNode[];
  selectedId: string;
  selectedIds?: readonly string[];
  highlightedTextNodeIds?: readonly string[];
  highlightedFindingNodeIds?: readonly string[];
  refinedElementIds?: readonly string[];
  featureOwnerIds: ReadonlySet<string>;
  collapsedFeatureOwnerIds: ReadonlySet<string>;
}, getGraph: () => Graph | undefined, updateNameEditorPosition: () => void) {
  function refinementPresentation(node: OpdNode) {
    const hasChild = (node.kind === "object" || node.kind === "process") && !!props.refinedElementIds?.includes(node.id);
    return {
      strokeWidth: hasChild || (node.kind === "state" && node.stateRoles?.includes("INITIAL")) ? 4 : 2,
      "data-opm-has-child-opd": hasChild ? "true" : "false",
      title: hasChild ? "已有子图，右键选择“展开子图”。" : "",
    };
  }
  const rendered = new Map<string, { shape: string; geometry: string; label: string; presentation: string; node: OpdNode }>();
  const ownerRelations = new Map<string, { signature: string; cellIds: string[] }>();
  let stateOwners = new Set<string>();
  function removeNode(id: string) {
    const graph = getGraph();
    for (const cellId of [id, `state.final-outline.${id}`, `state.default.${id}`]) graph?.getCellById(cellId)?.remove();
  }
  function addNode(node: OpdNode) {
    const graph = getGraph();
      const isState = node.kind === "state";
      const isFeature = node.kind === "attribute" || node.kind === "operation";
      const isFinal = node.stateRoles?.includes("FINAL");
      const hasOwnedFeatures = (node.kind === "object" || node.kind === "process") && props.featureOwnerIds.has(node.id);
      const size = nodeDimensions(node);
      const featureToggleX = size.width - 13;
      graph?.addNode({
        id: node.id,
        shape: node.kind === "process" || node.kind === "operation" ? "ellipse" : "rect",
        x: node.x,
        y: node.y,
        width: size.width,
        height: size.height,
        zIndex: isState ? 3 : 2,
        label: node.label,
        markup: hasOwnedFeatures ? [
          { tagName: node.kind === "process" ? "ellipse" : "rect", selector: "body" },
          { tagName: "text", selector: "label" },
          { tagName: "circle", selector: "featureToggle" },
          { tagName: "path", selector: "featureToggleGlyph" },
        ] : undefined,
        attrs: {
          body: {
            "data-opm-capture-cell-id": node.occurrenceId,
            "data-testid": `p03-occurrence-${node.occurrenceId}`,
            fill: props.highlightedFindingNodeIds?.includes(node.id) ? "#eaf3fc" : (props.highlightedTextNodeIds?.includes(node.id) || (props.selectedIds?.includes(node.id) ?? node.id === props.selectedId)) ? "#eaf3fc" : "#ffffff",
            stroke: props.highlightedFindingNodeIds?.includes(node.id) ? "#0b6bcb" : props.highlightedTextNodeIds?.includes(node.id) ? "#0b6bcb" : "#20242a",
            "data-opm-text-highlighted": props.highlightedTextNodeIds?.includes(node.id) ? "true" : "false",
            "data-opm-finding-highlighted": props.highlightedFindingNodeIds?.includes(node.id) ? "true" : "false",
            ...refinementPresentation(node),
            rx: isState ? 14 : isFeature ? 4 : 0,
            ry: isState ? 14 : isFeature ? 4 : 0,
          },
          label: {
            fill: "#171a1f",
            refY: stateOwners.has(node.id) ? 14 : "50%",
            fontSize: isState ? 11 : 13,
            fontWeight: 600,
          },
          ...(hasOwnedFeatures ? {
            featureToggle: {
              "data-testid": `p03-feature-toggle-${node.occurrenceId}`,
              "aria-label": props.collapsedFeatureOwnerIds.has(node.id) ? "展开所属特征 / Expand features" : "收起所属特征 / Collapse features",
              cx: featureToggleX,
              cy: 13,
              r: 8,
              cursor: "pointer",
              event: "node:toggle-features",
              fill: "#ffffff",
              stroke: "#6f7b87",
              strokeWidth: 1,
            },
            featureToggleGlyph: {
              d: props.collapsedFeatureOwnerIds.has(node.id)
                ? `M${featureToggleX - 3} 13H${featureToggleX + 3}M${featureToggleX} 10V16`
                : `M${featureToggleX - 3} 13H${featureToggleX + 3}`,
              fill: "none",
              pointerEvents: "none",
              stroke: "#344250",
              strokeLinecap: "round",
              strokeWidth: 1.5,
            },
          } : {}),
        },
      });
      if (isState && isFinal) {
        graph?.addNode({ id: `state.final-outline.${node.id}`, shape: "rect", x: node.x + 3, y: node.y + 3, width: size.width - 6, height: size.height - 6, zIndex: 4, attrs: { body: { pointerEvents: "none", fill: "transparent", stroke: "#20242a", strokeWidth: 1, rx: 11, ry: 11 }, label: { text: "" } } });
      }
      if (isState && node.stateRoles?.includes("DEFAULT") && node.ownerId) {
        graph?.addEdge({ id: `state.default.${node.id}`, source: node.ownerId, target: node.id, zIndex: 1, attrs: { line: { stroke: "#20242a", strokeWidth: 1.5, targetMarker: { name: "classic", width: 8, height: 6, fill: "#ffffff", stroke: "#20242a" } } } });
      }
  }
  function renderNodes() { syncGraphPresentation(); }
  function syncGraphPresentation() {
    const graph = getGraph();
    const ids = new Set(props.nodes.map(node => node.id));
    stateOwners = new Set(props.nodes.filter(node => node.kind === "state").map(node => node.ownerId!));
    for (const id of rendered.keys()) if (!ids.has(id)) { removeNode(id); rendered.delete(id); }
    const selected = new Set(props.selectedIds ?? [props.selectedId]);
    const text = new Set(props.highlightedTextNodeIds), findings = new Set(props.highlightedFindingNodeIds);
    for (const node of props.nodes) {
      const size = nodeDimensions(node);
      const shape = JSON.stringify([node.kind, node.occurrenceId, node.ownerId, props.featureOwnerIds.has(node.id),
        props.collapsedFeatureOwnerIds.has(node.id), node.stateRoles]);
      const geometry = JSON.stringify([node.x, node.y, size.width, size.height]);
      const presentation = JSON.stringify([selected.has(node.id), text.has(node.id), findings.has(node.id), refinementPresentation(node), stateOwners.has(node.id)]);
      const previous = rendered.get(node.id);
      if (!previous || previous.shape !== shape) {
        if (previous) removeNode(node.id);
        addNode(node);
      } else {
        const cell = graph?.getCellById(node.id);
        if (cell?.isNode()) {
          // 拒绝拖动时模型坐标可能未变，仍需恢复 X6 的临时几何。
          const position = previous.node !== node ? cell.getPosition?.() : undefined;
          const currentSize = previous.node !== node ? cell.getSize?.() : undefined;
          if (previous.geometry !== geometry || (position && (position.x !== node.x || position.y !== node.y)) || (currentSize && (currentSize.width !== size.width || currentSize.height !== size.height))) {
            cell.position(node.x, node.y); cell.resize?.(size.width, size.height); positionStateOutline(node.id, node.x, node.y);
            if (props.featureOwnerIds.has(node.id)) {
              const x = size.width - 13;
              cell.attr("featureToggle/cx", x);
              cell.attr("featureToggleGlyph/d", props.collapsedFeatureOwnerIds.has(node.id) ? `M${x - 3} 13H${x + 3}M${x} 10V16` : `M${x - 3} 13H${x + 3}`);
            }
            const outline = graph?.getCellById(`state.final-outline.${node.id}`);
            if (outline?.isNode()) outline.resize?.(size.width - 6, size.height - 6);
          }
          if (previous.label !== node.label) cell.attr("label/text", node.label);
          if (previous.presentation !== presentation) {
            cell.attr("body/fill", findings.has(node.id) || text.has(node.id) || selected.has(node.id) ? "#eaf3fc" : "#ffffff");
            cell.attr("body/stroke", findings.has(node.id) || text.has(node.id) ? "#0b6bcb" : "#20242a");
            cell.attr("body/data-opm-text-highlighted", text.has(node.id) ? "true" : "false");
            cell.attr("body/data-opm-finding-highlighted", findings.has(node.id) ? "true" : "false");
            cell.attr("label/refY", stateOwners.has(node.id) ? 14 : "50%");
            cell.attr("body", refinementPresentation(node));
          }
        }
      }
      rendered.set(node.id, { shape, geometry, label: node.label, presentation, node });
    }
    // 所属对象重建时，X6 会移除邻接边；状态本身未变化也需要恢复默认状态箭头。
    for (const node of props.nodes) if (node.kind === "state" && node.ownerId && node.stateRoles?.includes("DEFAULT") && !graph?.getCellById(`state.default.${node.id}`)) {
      graph?.addEdge({ id: `state.default.${node.id}`, source: node.ownerId, target: node.id, zIndex: 1, attrs: { line: { stroke: "#20242a", strokeWidth: 1.5, targetMarker: { name: "classic", width: 8, height: 6, fill: "#ffffff", stroke: "#20242a" } } } });
    }
    syncOwnedFeatureRelations(); updateNameEditorPosition();
  }
  function syncOwnedFeatureRelations(nodes: OpdNode[] = props.nodes) {
    const graph = getGraph(), byId = new Map(nodes.map(node => [node.id, node]));
    const groups = new Map<string, OpdNode[]>();
    for (const node of nodes) if ((node.kind === "attribute" || node.kind === "operation") && node.ownerId && byId.has(node.ownerId)) {
      const members = groups.get(node.ownerId) ?? []; members.push(node); groups.set(node.ownerId, members);
    }
    for (const [ownerId, previous] of ownerRelations) if (!groups.has(ownerId)) {
      previous.cellIds.forEach(id => graph?.getCellById(id)?.remove()); ownerRelations.delete(ownerId);
    }
    for (const [ownerId, members] of groups) {
      const owner = byId.get(ownerId)!;
      const signature = JSON.stringify([owner, members]);
      const previous = ownerRelations.get(ownerId);
      if (previous?.signature === signature && previous.cellIds.every(id => graph?.getCellById(id))) continue;
      previous?.cellIds.forEach(id => graph?.getCellById(id)?.remove());
      const cellIds: string[] = [];
      for (const kind of ["characterization", "composition"] as const) {
        const grouped = members.filter(feature => kind === "characterization" ? owner.kind === "object" && feature.kind === "attribute" : owner.kind === "process" && feature.kind === "operation");
        if (!grouped.length) continue;
        const id = `feature.owner-group.${owner.id}.${kind}`;
        cellIds.push(id, `${id}.junction`, ...grouped.map(feature => `${id}.member.${feature.id}`));
        if (kind === "characterization") cellIds.push(`${id}.junction.inner`);
      }
      for (const feature of members) if (!(owner.kind === "object" && feature.kind === "attribute") && !(owner.kind === "process" && feature.kind === "operation")) cellIds.push(`feature.owner.${feature.id}`);
      renderFeatureOwnerRelations(graph, [owner, ...members]);
      ownerRelations.set(ownerId, { signature, cellIds });
    }
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

  function reset() { rendered.clear(); ownerRelations.clear(); stateOwners.clear(); }
  return { renderNodes, reset, syncGraphPresentation, movePresentation, syncOwnedFeatureRelations };
}

type FeatureOwnerRelationKind = "characterization" | "composition";

function renderFeatureOwnerRelations(graph: Graph | undefined, nodes: readonly OpdNode[]) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const groups = new Map<string, { owner: OpdNode; features: OpdNode[]; relationKind: FeatureOwnerRelationKind }>();

  nodes.forEach((feature) => {
    if ((feature.kind !== "attribute" && feature.kind !== "operation") || !feature.ownerId) return;
    const owner = nodeById.get(feature.ownerId);
    if (!owner || (owner.kind !== "object" && owner.kind !== "process")) return;
    const relationKind = owner.kind === "object" && feature.kind === "attribute"
      ? "characterization"
      : owner.kind === "process" && feature.kind === "operation"
        ? "composition"
        : undefined;
    if (!relationKind) {
      renderNeutralOwnerRelation(graph, owner, feature);
      return;
    }
    const key = `${owner.id}:${relationKind}`;
    const group = groups.get(key) ?? { owner, features: [], relationKind };
    group.features.push(feature);
    groups.set(key, group);
  });

  groups.forEach((group) => renderFeatureOwnerFan(graph, group.owner, group.features, group.relationKind));
}

function renderNeutralOwnerRelation(graph: Graph | undefined, owner: OpdNode, feature: OpdNode) {
  graph?.addEdge({
    id: `feature.owner.${feature.id}`,
    source: owner.id,
    target: feature.id,
    zIndex: 1,
    attrs: decorativeEdgeAttrs("#6f7b87", 1.5, "4 4"),
  });
}

function renderFeatureOwnerFan(graph: Graph | undefined, owner: OpdNode, features: readonly OpdNode[], relationKind: FeatureOwnerRelationKind) {
  const relationId = `feature.owner-group.${owner.id}.${relationKind}`;

  const ownerSize = nodeDimensions(owner);
  const ownerCenter = { x: owner.x + ownerSize.width / 2, y: owner.y + ownerSize.height / 2 };
  const memberCenter = features.reduce((center, feature) => {
    const size = nodeDimensions(feature);
    return { x: center.x + feature.x + size.width / 2, y: center.y + feature.y + size.height / 2 };
  }, { x: 0, y: 0 });
  memberCenter.x /= features.length;
  memberCenter.y /= features.length;
  const horizontal = Math.abs(memberCenter.x - ownerCenter.x) >= Math.abs(memberCenter.y - ownerCenter.y);
  const junction = horizontal
    ? { x: (ownerCenter.x + memberCenter.x) / 2, y: ownerCenter.y }
    : { x: ownerCenter.x, y: (ownerCenter.y + memberCenter.y) / 2 };
  const angle = Math.atan2(ownerCenter.y - junction.y, ownerCenter.x - junction.x) * 180 / Math.PI + 90;
  const junctionId = `${relationId}.junction`;

  graph?.addNode({
    id: junctionId,
    shape: "polygon",
    x: junction.x - 12,
    y: junction.y - 12,
    width: 24,
    height: 24,
    zIndex: 3,
    angle,
    attrs: {
      body: {
        refPoints: "0,24 12,0 24,24",
        fill: relationKind === "composition" ? "#20242a" : "#ffffff",
        stroke: "#20242a",
        strokeWidth: 1.5,
        pointerEvents: "none",
      },
      label: { text: "", pointerEvents: "none" },
    },
  });
  if (relationKind === "characterization") {
    graph?.addNode({
      id: `${junctionId}.inner`,
      shape: "polygon",
      x: junction.x - 6,
      y: junction.y - 6,
      width: 12,
      height: 12,
      zIndex: 4,
      angle,
      attrs: {
        body: { refPoints: "0,12 6,0 12,12", fill: "#20242a", stroke: "#20242a", strokeWidth: 1, pointerEvents: "none" },
        label: { text: "", pointerEvents: "none" },
      },
    });
  }
  graph?.addEdge({ id: relationId, source: owner.id, target: junctionId, zIndex: 1, attrs: decorativeEdgeAttrs("#20242a", 2) });
  features.forEach((feature) => {
    const size = nodeDimensions(feature);
    const featureCenter = { x: feature.x + size.width / 2, y: feature.y + size.height / 2 };
    graph?.addEdge({
      id: `${relationId}.member.${feature.id}`,
      source: junctionId,
      target: feature.id,
      vertices: [horizontal ? { x: junction.x, y: featureCenter.y } : { x: featureCenter.x, y: junction.y }],
      zIndex: 1,
      attrs: decorativeEdgeAttrs("#20242a", 2),
    });
  });
}

function decorativeEdgeAttrs(stroke: string, strokeWidth: number, strokeDasharray?: string) {
  return {
    wrap: { pointerEvents: "none" },
    line: { pointerEvents: "none", stroke, strokeDasharray, strokeWidth, sourceMarker: null, targetMarker: null },
  };
}
