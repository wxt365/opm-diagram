import type { Edge, Graph, Node } from "@antv/x6";
import type { OpdNode } from "@/shared/types/modeling";
import { nodeAppearance, nodeTextColors, type NodeColorPalette } from "@/shared/nodeAppearance";
import { constrainStatePosition, nodeDimensions, stateContainerTitleHeight } from "./node-geometry";
import { clearOrthogonalPath, orthogonalRouter, routeRelations, routingExclusions } from "./relation-routing";
import { relationTerminal } from "./x6-relation-adapter";
import type { RelationEdgeSpec } from "./relation-render-spec";
import { featureJunctionPoint } from "./feature-junction";
import { changedNodeGeometry, edgeIntersectsChanges } from "./routing-invalidation";

function classification(node: OpdNode) {
  if (node.kind === "state") return "";
  const label = node.domainTypeLabel?.replace(/<br\s*\/?\s*>/gi, "\n").replace(/<[^>]*>/g, "").trim();
  return label?.split(/\r?\n/)[0]?.trim() || { object: "对象", process: "过程", attribute: "属性", operation: "操作" }[node.kind];
}

function labelPosition(node: OpdNode, envelope: boolean, hasStates: boolean) {
  return envelope ? 40 : hasStates ? stateContainerTitleHeight(node) / 2 : classification(node) ? "36%" : "50%";
}

function labelWrap(node: OpdNode, envelope: boolean, hasStates: boolean) {
  const size = nodeDimensions(node);
  return { text: node.label, width: envelope ? Math.min(360, size.width * 0.35) : node.kind === "state" ? -24 : -32,
    height: envelope ? 28 : hasStates ? stateContainerTitleHeight(node) - 6 : node.kind === "state" ? -12 : Math.max(18, size.height - 34) };
}

/** 节点及 State 附属图形的渲染、同步和移动；Graph 由画布唯一持有。 */
export function createX6NodeLayer(props: {
  nodes: OpdNode[];
  nodeColors?: NodeColorPalette;
  selectedId: string;
  selectedIds?: readonly string[];
  highlightedTextNodeIds?: readonly string[];
  highlightedFindingNodeIds?: readonly string[];
  refinedElementIds?: readonly string[];
  refineeId?: string;
  featureOwnerIds: ReadonlySet<string>;
  collapsedFeatureOwnerIds: ReadonlySet<string>;
  selectedFeatureRouteId?: string;
}, getGraph: () => Graph | undefined, updateNameEditorPosition: () => void) {
  function nodeStroke(node: OpdNode) { return nodeAppearance(node, props.nodeColors).stroke; }
  function nodeFill(node: OpdNode) { return nodeAppearance(node, props.nodeColors).fill; }
  function hasCustomFill(node: OpdNode) { return !!(node.appearance?.fill ?? props.nodeColors?.[node.kind]?.fill); }
  function fill(node: OpdNode) {
    if (node.id === props.refineeId && !hasCustomFill(node)) return "transparent";
    if (props.highlightedFindingNodeIds?.includes(node.id) || props.highlightedTextNodeIds?.includes(node.id)) return "#eaf3fc";
    const selected = props.selectedIds?.includes(node.id) ?? node.id === props.selectedId;
    return selected && !hasCustomFill(node) ? "#eaf3fc" : nodeFill(node);
  }
  function textColors(node: OpdNode) { return nodeTextColors(fill(node) === "transparent" ? "#ffffff" : fill(node)); }
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
  let featureSelection = new WeakMap<object, boolean>();
  let featureGeometry = new Map<string, OpdNode>();
  let stateOwners = new Set<string>();
  function removeNode(id: string) {
    const graph = getGraph();
    for (const cellId of [id, `state.final-outline.${id}`, `state.default.${id}`]) {
      const cell = graph?.getCellById(cellId); if (!cell) continue;
      const adjacent = cell.isNode() ? graph?.getConnectedEdges?.(cell) ?? [] : [];
      const views = [cell, ...adjacent].map(item => graph?.findViewByCell?.(item));
      cell.remove();
      // The model removal is immediate; detach its obsolete hit targets too.
      // X6 still owns listener/tool cleanup in its queued view:unmounted pass.
      views.forEach(view => view?.unmount());
    }
  }
  function addNode(node: OpdNode) {
    const graph = getGraph();
      const isState = node.kind === "state";
      const isEnvelope = node.id === props.refineeId;
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
        zIndex: isEnvelope ? 0 : isState ? 3 : 2,
        label: node.label,
        markup: [
          { tagName: node.kind === "process" || node.kind === "operation" ? "ellipse" : "rect", selector: "body" },
          ...(node.kind === "object" && !isEnvelope ? [{ tagName: "rect", selector: "captionHitArea" }] : []),
          { tagName: "text", selector: "label" },
          { tagName: "text", selector: "classification" },
          ...(!isState ? [{ tagName: "circle", selector: "featureToggle" }, { tagName: "path", selector: "featureToggleGlyph" }] : []),
        ],
        attrs: {
          captionHitArea: {
            x: 0, y: stateOwners.has(node.id) ? -20 : 0, width: size.width,
            height: stateOwners.has(node.id) ? 20 : 0,
            fill: "transparent", stroke: "none", pointerEvents: "all",
          },
          body: {
            "data-opm-capture-cell-id": node.occurrenceId,
            "data-testid": `p03-occurrence-${node.occurrenceId}`,
            fill: fill(node),
            stroke: props.highlightedFindingNodeIds?.includes(node.id) ? "#0b6bcb" : props.highlightedTextNodeIds?.includes(node.id) ? "#0b6bcb" : nodeStroke(node),
            "data-opm-text-highlighted": props.highlightedTextNodeIds?.includes(node.id) ? "true" : "false",
            "data-opm-finding-highlighted": props.highlightedFindingNodeIds?.includes(node.id) ? "true" : "false",
            ...refinementPresentation(node),
            ...(isEnvelope ? { pointerEvents: "stroke", strokeWidth: 2 } : {}),
            rx: isState ? 14 : isFeature ? 4 : 0,
            ry: isState ? 14 : isFeature ? 4 : 0,
          },
          label: {
            fill: textColors(node).label,
            refY: labelPosition(node, isEnvelope, stateOwners.has(node.id)),
            fontSize: isState ? 11 : 13,
            fontWeight: 600,
            lineHeight: isState ? 16 : 18,
            textWrap: labelWrap(node, isEnvelope, stateOwners.has(node.id)),
          },
          classification: {
            text: classification(node),
            "data-testid": `p03-classification-${node.occurrenceId}`,
            refX: "50%", refY: isEnvelope ? 66 : stateOwners.has(node.id) ? -10 : "76%",
            textAnchor: "middle", textVerticalAnchor: "middle", fontSize: 10,
            fill: textColors(node).classification, pointerEvents: "none",
            title: node.domainTypeLabel || classification(node),
            textWrap: { width: -28, height: 14, ellipsis: true },
          },
          ...(!isState ? {
            featureToggle: {
              display: hasOwnedFeatures ? "" : "none",
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
              display: hasOwnedFeatures ? "" : "none",
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
        graph?.addNode({ id: `state.final-outline.${node.id}`, shape: "rect", x: node.x + 3, y: node.y + 3, width: size.width - 6, height: size.height - 6, zIndex: 4, attrs: { body: { pointerEvents: "none", fill: "transparent", stroke: nodeStroke(node), strokeWidth: 1, rx: 11, ry: 11 }, label: { text: "" } } }, { async: false });
      }
      if (isState && node.stateRoles?.includes("DEFAULT") && node.ownerId) {
        graph?.addEdge({ id: `state.default.${node.id}`, source: node.ownerId, target: node.id, zIndex: 1, router: orthogonalRouter([node.ownerId]), connector: { name: "normal" }, attrs: { line: { stroke: "#8793a1", strokeWidth: 1.35, targetMarker: { name: "classic", width: 8, height: 6, fill: "#ffffff", stroke: "#8793a1" } } } }, { async: false });
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
      const shape = JSON.stringify([node.kind, node.occurrenceId, node.ownerId,
        node.stateRoles, node.id === props.refineeId, node.domainTypeLabel]);
      const geometry = JSON.stringify([node.x, node.y, size.width, size.height]);
      const presentation = JSON.stringify([selected.has(node.id), text.has(node.id), findings.has(node.id), refinementPresentation(node), stateOwners.has(node.id), props.featureOwnerIds.has(node.id), props.collapsedFeatureOwnerIds.has(node.id), nodeAppearance(node, props.nodeColors), hasCustomFill(node)]);
      const previous = rendered.get(node.id);
      if (!previous || previous.shape !== shape) {
        if (previous) removeNode(node.id);
        addNode(node);
      } else {
        const cell = graph?.getCellById(node.id);
        if (cell?.isNode()) {
          const attributes: Record<string, Record<string, unknown>> = {};
          const paint = (path: string, value: unknown) => {
            const [selector, key] = path.split("/");
            const target = attributes[selector!] ??= {};
            if (key) target[key] = value; else Object.assign(target, value);
          };
          // 拒绝拖动时模型坐标可能未变，仍需恢复 X6 的临时几何。
          const position = previous.node !== node ? cell.getPosition?.() : undefined;
          const currentSize = previous.node !== node ? cell.getSize?.() : undefined;
          if (previous.geometry !== geometry || (position && (position.x !== node.x || position.y !== node.y)) || (currentSize && (currentSize.width !== size.width || currentSize.height !== size.height))) {
            cell.position(node.x, node.y); cell.resize?.(size.width, size.height); positionStateOutline(node.id, node.x, node.y);
            if (props.featureOwnerIds.has(node.id)) {
              const x = size.width - 13;
              paint("featureToggle/cx", x);
              paint("featureToggleGlyph/d", props.collapsedFeatureOwnerIds.has(node.id) ? `M${x - 3} 13H${x + 3}M${x} 10V16` : `M${x - 3} 13H${x + 3}`);
            }
            const outline = graph?.getCellById(`state.final-outline.${node.id}`);
            if (outline?.isNode()) outline.resize?.(size.width - 6, size.height - 6);
          }
          if (previous.label !== node.label) paint("label/text", node.label);
          if (previous.geometry !== geometry || previous.label !== node.label || previous.presentation !== presentation) {
            if (node.kind === "object" && node.id !== props.refineeId) paint("captionHitArea", {
              y: stateOwners.has(node.id) ? -20 : 0, width: size.width, height: stateOwners.has(node.id) ? 20 : 0,
            });
            paint("label/textWrap", labelWrap(node, node.id === props.refineeId, stateOwners.has(node.id)));
            paint("label/refY", labelPosition(node, node.id === props.refineeId, stateOwners.has(node.id)));
          }
          if (previous.presentation !== presentation) {
            if (node.kind !== "state") {
              // Adding the first feature must not replace its owner and delete
              // newly added adjacent State/default edges in X6's async queue.
              const display = props.featureOwnerIds.has(node.id) ? "" : "none";
              paint("featureToggle/display", display); paint("featureToggleGlyph/display", display);
            }
            if (props.featureOwnerIds.has(node.id)) {
              const x = size.width - 13, collapsed = props.collapsedFeatureOwnerIds.has(node.id);
              paint("featureToggle/aria-label", collapsed ? "展开所属特征 / Expand features" : "收起所属特征 / Collapse features");
              paint("featureToggleGlyph/d", collapsed ? `M${x - 3} 13H${x + 3}M${x} 10V16` : `M${x - 3} 13H${x + 3}`);
            }
            paint("body/fill", fill(node));
            paint("body/stroke", findings.has(node.id) || text.has(node.id) ? "#0b6bcb" : nodeStroke(node));
            paint("label/fill", textColors(node).label);
            paint("classification/fill", textColors(node).classification);
            graph?.getCellById(`state.final-outline.${node.id}`)?.attr("body/stroke", nodeStroke(node));
            paint("body/data-opm-text-highlighted", text.has(node.id) ? "true" : "false");
            paint("body/data-opm-finding-highlighted", findings.has(node.id) ? "true" : "false");
            paint("label/refY", labelPosition(node, node.id === props.refineeId, stateOwners.has(node.id)));
            paint("classification/refY", node.id === props.refineeId ? 66 : stateOwners.has(node.id) ? -10 : "76%");
            paint("body", refinementPresentation(node));
          }
          // One update per changed node, rather than one queued paint per
          // attribute competing with thousands of pending edge views.
          if (Object.keys(attributes).length) cell.attr(attributes as NonNullable<Node.Metadata["attrs"]>, { async: false });
        }
      }
      rendered.set(node.id, { shape, geometry, label: node.label, presentation, node });
    }
    // 所属对象重建时，X6 会移除邻接边；状态本身未变化也需要恢复默认状态箭头。
    for (const node of props.nodes) if (node.kind === "state" && node.ownerId && node.stateRoles?.includes("DEFAULT") && !graph?.getCellById(`state.default.${node.id}`)) {
      graph?.addEdge({ id: `state.default.${node.id}`, source: node.ownerId, target: node.id, zIndex: 1, router: orthogonalRouter([node.ownerId]), connector: { name: "normal" }, attrs: { line: { stroke: "#8793a1", strokeWidth: 1.35, targetMarker: { name: "classic", width: 8, height: 6, fill: "#ffffff", stroke: "#8793a1" } } } }, { async: false });
    }
    syncOwnedFeatureRelations(); updateNameEditorPosition();
  }
  function syncOwnedFeatureRelations(nodes: OpdNode[] = props.nodes) {
    const graph = getGraph(), byId = new Map(nodes.map(node => [node.id, node]));
    const changes = changedNodeGeometry(featureGeometry, nodes);
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
      const obstacleChanged = previous?.cellIds.some(id => edgeIntersectsChanges(graph, id, changes, [ownerId, ...(props.refineeId ? [props.refineeId] : [])]));
      if (previous?.signature === signature && previous.cellIds.every(id => graph?.getCellById(id)) && !obstacleChanged) continue;
      const cellIds: string[] = [];
      for (const kind of ["characterization", "composition"] as const) {
        const grouped = members.filter(feature => kind === "characterization" ? owner.kind === "object" && feature.kind === "attribute" : owner.kind === "process" && feature.kind === "operation");
        if (!grouped.length) continue;
        const id = `feature.owner-group.${owner.id}.${kind}`;
        cellIds.push(id, `${id}.junction`, ...grouped.map(feature => `${id}.member.${feature.id}`));
        if (kind === "characterization") cellIds.push(`${id}.junction.inner`);
      }
      for (const feature of members) if (!(owner.kind === "object" && feature.kind === "attribute") && !(owner.kind === "process" && feature.kind === "operation")) cellIds.push(`feature.owner.${feature.id}`);
      previous?.cellIds.filter(id => !cellIds.includes(id)).forEach(id => graph?.getCellById(id)?.remove());
      renderFeatureOwnerRelations(graph, [owner, ...members], nodes, props.refineeId);
      ownerRelations.set(ownerId, { signature, cellIds });
      if (obstacleChanged) for (const id of cellIds) {
        const edge = graph?.getCellById(id);
        if (!edge || edge.isNode()) continue;
        const view = graph?.findViewByCell?.(edge); if (view?.isEdgeView()) view.update();
      }
    }
    for (const group of ownerRelations.values()) for (const id of group.cellIds) {
      const edge = graph?.getCellById(id);
      if (!edge || edge.isNode()) continue;
      const selected = id === props.selectedFeatureRouteId;
      if (featureSelection.get(edge) === selected) continue;
      edge.attr({ line: { stroke: selected ? "#0b6bcb" : "#8793a1", strokeWidth: selected ? 2.15 : 1.35,
        "data-opm-selected": selected ? "true" : "false" } });
      featureSelection.set(edge, selected);
    }
    featureGeometry = byId;
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

  function reset() { rendered.clear(); ownerRelations.clear(); stateOwners.clear(); featureGeometry.clear(); featureSelection = new WeakMap(); }
  return { renderNodes, reset, syncGraphPresentation, movePresentation, syncOwnedFeatureRelations };
}

type FeatureOwnerRelationKind = "characterization" | "composition";

function renderFeatureOwnerRelations(graph: Graph | undefined, nodes: readonly OpdNode[], allNodes: readonly OpdNode[], refineeId?: string) {
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
      renderNeutralOwnerRelation(graph, owner, feature, allNodes, refineeId);
      return;
    }
    const key = `${owner.id}:${relationKind}`;
    const group = groups.get(key) ?? { owner, features: [], relationKind };
    group.features.push(feature);
    groups.set(key, group);
  });

  groups.forEach((group) => renderFeatureOwnerFan(graph, group.owner, group.features, group.relationKind, allNodes, refineeId));
}

function renderNeutralOwnerRelation(graph: Graph | undefined, owner: OpdNode, feature: OpdNode, nodes: readonly OpdNode[], refineeId?: string) {
  syncOwnerEdge(graph, {
    id: `feature.owner.${feature.id}`,
    source: owner.id,
    target: feature.id,
    zIndex: 1,
    attrs: decorativeEdgeAttrs("#6f7b87", 1.5, "4 4"),
  }, feature, "feature.owner", nodes, refineeId);
}

function renderFeatureOwnerFan(graph: Graph | undefined, owner: OpdNode, features: readonly OpdNode[], relationKind: FeatureOwnerRelationKind, nodes: readonly OpdNode[], refineeId?: string) {
  const relationId = `feature.owner-group.${owner.id}.${relationKind}`;

  const junction = featureJunctionPoint(owner);
  const angle = 270;
  const junctionId = `${relationId}.junction`;

  syncDecorativeNode(graph, {
    id: junctionId,
    shape: "polygon",
    x: junction.x - 8,
    y: junction.y - 8,
    width: 16,
    height: 16,
    zIndex: 3,
    angle,
    attrs: {
      body: {
        refPoints: "0,24 12,0 24,24",
        fill: relationKind === "composition" ? "#8793a1" : "#ffffff",
        stroke: "#8793a1",
        strokeWidth: 1.5,
        pointerEvents: "none",
      },
      label: { text: "", pointerEvents: "none" },
    },
  });
  if (relationKind === "characterization") {
    syncDecorativeNode(graph, {
      id: `${junctionId}.inner`,
      shape: "polygon",
      x: junction.x - 4,
      y: junction.y - 4,
      width: 8,
      height: 8,
      zIndex: 4,
      angle,
      attrs: {
        body: { refPoints: "0,12 6,0 12,12", fill: "#8793a1", stroke: "#8793a1", strokeWidth: 1, pointerEvents: "none" },
        label: { text: "", pointerEvents: "none" },
      },
    });
  }
  const routingNodes = [...nodes, { ...owner, id: junctionId, kind: "object" as const, ownerId: undefined, x: junction.x - 8, y: junction.y - 8, width: 16, height: 16 }];
  syncOwnerEdge(graph, { id: relationId, source: owner.id, target: junctionId, zIndex: 1, attrs: decorativeEdgeAttrs("#20242a", 2),
    data: { routeTargetSide: "left" } }, owner, `feature.${relationKind}`, routingNodes, refineeId);
  const lane = Math.max(junction.x + 12, Math.min(junction.x + 28, ...features.map(node => node.x - 12)));
  features.forEach((feature) => {
    const size = nodeDimensions(feature);
    const featureCenter = { x: feature.x + size.width / 2, y: feature.y + size.height / 2 };
    syncOwnerEdge(graph, {
      id: `${relationId}.member.${feature.id}`,
      source: junctionId,
      target: feature.id,
      vertices: [{ x: lane, y: junction.y }, { x: lane, y: featureCenter.y }],
      data: { routeSourceSide: "right", routeTargetSide: "left" },
      zIndex: 1,
      attrs: decorativeEdgeAttrs("#20242a", 2),
    }, feature, "feature.owner", routingNodes, refineeId);
  });
}

// X6 异步渲染中同帧删除再添加相同 ID 会覆盖删除任务；连续扩容应就地更新装饰几何。
function syncDecorativeNode(graph: Graph | undefined, metadata: Node.Metadata) {
  const cell = metadata.id ? graph?.getCellById(metadata.id) : undefined;
  if (cell?.isNode()) {
    const position = cell.getPosition?.(), size = cell.getSize?.();
    if (position?.x !== metadata.x || position?.y !== metadata.y) cell.position(metadata.x!, metadata.y!);
    if (size?.width !== metadata.width || size?.height !== metadata.height) cell.resize?.(metadata.width!, metadata.height!);
    if (cell.getAngle?.() !== (metadata.angle ?? 0)) cell.rotate?.(metadata.angle ?? 0);
  } else graph?.addNode(metadata);
}

const ownerEdgeMetadata = new WeakMap<Edge, Edge.Metadata>();

function syncOwnerEdge(graph: Graph | undefined, metadata: Edge.Metadata, node: OpdNode, segment: string, nodes: readonly OpdNode[], refineeId?: string) {
  const route = node.edgeRoutes?.find(item => item.segment === segment);
  const id = metadata.id!, source = metadata.source as string, target = metadata.target as string;
  const spec = routeRelations([{ relationId: id, occurrenceId: node.occurrenceId, family: "STRUCTURAL", symbolId: "feature.owner", primaryCellId: id,
    cells: [{ kind: "edge", id, source, target, data: metadata.data ?? {}, labels: [], line: { stroke: "#8793a1", strokeWidth: 1.35 },
      vertices: metadata.vertices as { x: number; y: number }[] }] }],
    [{ occurrenceId: node.occurrenceId, edgeRoutes: route ? [{ ...route, segment: "main" }] : [] }], nodes, refineeId)[0]!.cells[0] as RelationEdgeSpec;
  const nodeIds = new Set(nodes.map(node => node.id));
  const decorations = graph?.getNodes?.().filter(cell => !nodeIds.has(cell.id)).map(cell => cell.id) ?? [];
  const excluded = routingExclusions(nodes, [source, target], refineeId);
  const excludedIds = new Set(excluded);
  const sourceNode = nodes.find(node => node.id === source)!, targetNode = nodes.find(node => node.id === target)!;
  const boundary = (node: OpdNode, anchor: RelationEdgeSpec["sourceAnchor"]) => ({ x: node.x + nodeDimensions(node).width / 2 + (anchor?.dx ?? 0),
    y: node.y + nodeDimensions(node).height / 2 + (anchor?.dy ?? 0) });
  // Tight attribute fans have less than two Manhattan padding widths between the
  // symbol and the attribute. Keep an already clear orthogonal trunk verbatim.
  const direct = route?.mode !== "MANUAL"
    && clearOrthogonalPath([boundary(sourceNode, spec.sourceAnchor), ...(metadata.vertices as { x: number; y: number }[] ?? []), boundary(targetNode, spec.targetAnchor)],
      nodes.filter(node => node.id !== source && node.id !== target && !excludedIds.has(node.id)).map(node => ({ ...node, ...nodeDimensions(node) })));
  metadata = { ...metadata,
    source: relationTerminal(source, spec.sourceAnchor), target: relationTerminal(target, spec.targetAnchor),
    vertices: direct ? metadata.vertices : spec.vertices ? [...spec.vertices] : [], connector: spec.connector,
    router: direct ? { name: "normal", args: {} } : { ...spec.router!, args: { ...spec.router!.args, excludeNodes: [...excluded, ...decorations] } },
    data: { routeOccurrenceId: node.occurrenceId, routeSegment: segment, routeEditable: node.occurrenceRole === "owned" ? "true" : "false" },
    attrs: { ...metadata.attrs, wrap: { pointerEvents: "stroke" }, line: { ...metadata.attrs?.line, pointerEvents: "stroke", strokeLinecap: "butt", strokeLinejoin: "miter" } },
  };
  const cell = metadata.id ? graph?.getCellById(metadata.id) : undefined;
  if (cell && !cell.isNode()) {
    const edge = cell as Edge;
    const previous = ownerEdgeMetadata.get(edge);
    const changed = (a: unknown, b: unknown) => JSON.stringify(a) !== JSON.stringify(b);
    if (changed(edge.getSource?.() ?? previous?.source, metadata.source)) edge.setSource?.(relationTerminal(source, spec.sourceAnchor));
    if (changed(edge.getTarget?.() ?? previous?.target, metadata.target)) edge.setTarget?.(relationTerminal(target, spec.targetAnchor));
    if (changed(edge.getRouter?.() ?? previous?.router, metadata.router)) edge.setRouter?.(metadata.router!);
    if (changed(edge.getVertices?.() ?? previous?.vertices ?? [], metadata.vertices ?? [])) edge.setVertices?.(metadata.vertices ?? []);
    if (changed(edge.getConnector?.() ?? previous?.connector, metadata.connector)) edge.setConnector?.(metadata.connector!);
    if (changed(previous?.data, metadata.data)) edge.setData?.(metadata.data);
    if (changed(previous?.attrs, metadata.attrs)) edge.attr(metadata.attrs!);
    ownerEdgeMetadata.set(edge, metadata);
  }
  else {
    const edge = graph?.addEdge(metadata);
    if (edge) ownerEdgeMetadata.set(edge, metadata);
  }
}

function decorativeEdgeAttrs(stroke: string, strokeWidth: number, strokeDasharray?: string) {
  return {
    wrap: { pointerEvents: "none" },
    line: { pointerEvents: "none", stroke: stroke === "#20242a" ? "#8793a1" : stroke, strokeDasharray, strokeWidth: Math.min(strokeWidth, 1.35), sourceMarker: null, targetMarker: null },
  };
}
