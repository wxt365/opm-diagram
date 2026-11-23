import type { ConsumptionRelation, EdgeRoute, OpdNode } from "@/shared/types/modeling";
import type { RelationEdgeSpec, RelationRenderSpec } from "./relation-render-spec";
import { nodeDimensions } from "./node-geometry";
import { center, facingSide, spreadAttachments, type Attachment, type Box, type Point, type Side } from "./bezier-geometry";
import { orthogonalFallback } from "./orthogonal-detour";
import { orthogonalLanes, type OrthogonalLane } from "./orthogonal-lanes";

/** Segment keys are independent of semantic IDs and survive package remapping. */
export function routeSegment(relationId: string, cellId: string, index = 0) {
  const suffix = cellId.slice(relationId.length + 1);
  return cellId === relationId ? "main" : ["input", "output", "root"].includes(suffix) ? suffix : `part.${index}`;
}

export function isEditableRoute(_spec: RelationRenderSpec, cell: RelationEdgeSpec) {
  return cell.data.routeEditable !== "false";
}

export function routingExclusions(nodes: readonly OpdNode[], endpoints: readonly string[], refineeId?: string) {
  return prepareRoutingExclusions(nodes, refineeId)(endpoints);
}

function prepareRoutingExclusions(nodes: readonly OpdNode[], refineeId?: string) {
  const byId = new Map(nodes.map(node => [node.id, node]));
  const common = new Set<string>(refineeId ? [refineeId] : []);
  const featureOwners = new Set(nodes.filter(node => node.kind === "attribute" || node.kind === "operation").map(node => node.ownerId));
  for (const node of nodes) {
    if (node.kind === "state" && node.stateRoles?.includes("FINAL")) common.add(`state.final-outline.${node.id}`);
    if (!featureOwners.has(node.id)) continue;
    for (const kind of ["characterization", "composition"]) {
      common.add(`feature.owner-group.${node.id}.${kind}.junction`);
      common.add(`feature.owner-group.${node.id}.${kind}.junction.inner`);
    }
  }
  return (endpoints: readonly string[]) => {
    const excluded = new Set(common);
    for (const id of endpoints) {
      let node = byId.get(id);
      const visited = new Set<string>();
      while (node?.ownerId && !visited.has(node.ownerId)) {
        visited.add(node.ownerId);
        const owner = byId.get(node.ownerId);
        if (!owner) break;
        const size = nodeDimensions(node), outer = nodeDimensions(owner);
        // Ownership alone does not make an external feature's owner transparent.
        if (node.kind === "state" || (node.x >= owner.x && node.y >= owner.y
          && node.x + size.width <= owner.x + outer.width && node.y + size.height <= owner.y + outer.height)) excluded.add(owner.id);
        node = owner;
      }
    }
    return [...excluded].sort();
  };
}

export function orthogonalRouter(excludeNodes: readonly string[], start?: Side, end?: Side) {
  // Tight feature fans can exhaust a fine grid without finding a valid first
  // step. Bound that search and use the existing body-margin detour instead.
  return { name: "manhattan", args: { padding: 16, step: 8, maxLoopCount: 512, precision: 2, snapToGrid: false,
    perpendicular: false, excludeNodes: [...excludeNodes], fallbackRouter: orthogonalFallback,
    ...(start ? { startDirections: [start] } : {}), ...(end ? { endDirections: [end] } : {}) } };
}

/** A common trunk must be clear across the entire fan, not merely at its junction. */
export function clearTrunkCoordinate(preferred: number, horizontalFan: boolean, range: readonly [number, number], obstacles: readonly Box[], clearance = 64) {
  const blockers = obstacles.filter(box => horizontalFan ? box.y - 20 < range[1] && box.y + box.height + 20 > range[0]
    : box.x - 20 < range[1] && box.x + box.width + 20 > range[0]);
  const candidates = [preferred, ...blockers.flatMap(box => horizontalFan ? [box.x - clearance, box.x + box.width + clearance]
    : [box.y - clearance, box.y + box.height + clearance])];
  return candidates.filter(value => blockers.every(box => horizontalFan ? value <= box.x - clearance || value >= box.x + box.width + clearance
    : value <= box.y - clearance || value >= box.y + box.height + clearance))
    .sort((a, b) => Math.abs(a - preferred) - Math.abs(b - preferred))[0] ?? preferred;
}

/** Move a waypoint newly covered by a body to a free margin before routing. */
export function clearWaypoints(points: readonly Point[], obstacles: readonly Box[]): Point[] {
  return points.map(point => {
    let result = { ...point };
    const visited = new Set<string>();
    for (let pass = 0; pass <= obstacles.length; pass++) {
      const box = obstacles.find(box => result.x > box.x - 16 && result.x < box.x + box.width + 16
        && result.y > box.y - 16 && result.y < box.y + box.height + 16);
      if (!box) break;
      visited.add(`${result.x},${result.y}`);
      const candidates = [{ x: box.x - 17, y: result.y }, { x: box.x + box.width + 17, y: result.y },
        { x: result.x, y: box.y - 17 }, { x: result.x, y: box.y + box.height + 17 }]
        .filter(p => !visited.has(`${p.x},${p.y}`))
        .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y));
      if (!candidates.length) break;
      result = candidates[0]!;
    }
    return result;
  });
}

export function clearOrthogonalPath(points: readonly Point[], obstacles: readonly Box[], padding = 8) {
  return points.slice(1).every((b, i) => {
    const a = points[i]!;
    if (Math.abs(a.x - b.x) > 0.01 && Math.abs(a.y - b.y) > 0.01) return false;
    return obstacles.every(box => Math.max(a.x, b.x) <= box.x - padding || Math.min(a.x, b.x) >= box.x + box.width + padding
      || Math.max(a.y, b.y) <= box.y - padding || Math.min(a.y, b.y) >= box.y + box.height + padding);
  });
}

export function routeRelations(specs: readonly RelationRenderSpec[], relations: readonly Pick<ConsumptionRelation, "occurrenceId" | "edgeRoutes">[], nodes: readonly OpdNode[], refineeId?: string, changedRelations?: ReadonlySet<string>): RelationRenderSpec[] {
  const byOccurrence = new Map(relations.map(relation => [relation.occurrenceId, relation]));
  const exclusions = prepareRoutingExclusions(nodes, refineeId);
  const boxes = new Map<string, Box>(nodes.map(node => [node.id, { ...node, ...nodeDimensions(node), ellipse: node.kind === "process" || node.kind === "operation" }]));
  const symbolIds: string[] = [];
  for (const spec of specs) for (const cell of spec.cells) if (cell.kind === "node") {
    boxes.set(cell.id, { ...cell, ellipse: cell.shape === "ellipse" }); symbolIds.push(cell.id);
  }
  const ports = new Map<string, Attachment>(), sides = new Map<string, Side>();
  const groups = new Map<string, { box: Box; side: Side; peers: { key: string; toward: Point }[] }>();
  for (const spec of specs) for (const [index, cell] of spec.cells.entries()) {
    if (cell.kind !== "edge" || !isEditableRoute(spec, cell)) continue;
    const route = byOccurrence.get(spec.occurrenceId)?.edgeRoutes?.find(item => item.segment === routeSegment(spec.relationId, cell.id, index));
    for (const end of ["source", "target"] as const) {
      const box = boxes.get(cell[end]), other = boxes.get(cell[end === "source" ? "target" : "source"]);
      if (!box || !other) continue;
      const manual = route?.mode === "MANUAL" ? (end === "source" ? route.points[0] : route.points.at(-1)) : undefined;
      const toward = manual ?? center(other);
      const fixed = cell.data[end === "source" ? "routeSourceSide" : "routeTargetSide"] as Side | undefined;
      const side = fixed ?? (cell.source === cell.target ? end === "source" ? "top" : "right" : facingSide(box, toward));
      const key = `${cell.id}:${end}`;
      sides.set(key, side);
      // Branches share the symbol's base. Ordinary nodes have distributed ports.
      if (symbolIds.includes(cell[end])) {
        ports.set(key, spreadAttachments(box, side, [{ key, toward: center(box) }], box.ellipse).get(key)!);
      } else {
        const groupKey = `${cell[end]}:${side}`, group = groups.get(groupKey) ?? { box, side, peers: [] };
        group.peers.push({ key, toward: fixed ? center(box) : toward }); groups.set(groupKey, group);
      }
    }
  }
  groups.forEach(group => spreadAttachments(group.box, group.side, group.peers, group.box.ellipse).forEach((port, key) => ports.set(key, port)));
  const lanes: OrthogonalLane[] = [];
  const reservedPaths: Point[][] = [];
  const routed = specs.map(spec => ({ ...spec, cells: spec.cells.map((cell, index) => {
    if (cell.kind !== "edge" || !isEditableRoute(spec, cell)) return cell;
    if (changedRelations && !changedRelations.has(spec.relationId)) {
      const source = boxes.get(cell.source), target = boxes.get(cell.target);
      if (source && target && cell.router?.name === "normal") reservedPaths.push([
        { x: source.x + source.width / 2 + (cell.sourceAnchor?.dx ?? 0), y: source.y + source.height / 2 + (cell.sourceAnchor?.dy ?? 0) },
        ...cell.vertices ?? [],
        { x: target.x + target.width / 2 + (cell.targetAnchor?.dx ?? 0), y: target.y + target.height / 2 + (cell.targetAnchor?.dy ?? 0) },
      ]);
      return cell;
    }
    const segment = routeSegment(spec.relationId, cell.id, index);
    const route = byOccurrence.get(spec.occurrenceId)?.edgeRoutes?.find(item => item.segment === segment);
    const source = ports.get(`${cell.id}:source`), target = ports.get(`${cell.id}:target`);
    const excluded = exclusions([cell.source, cell.target]), excludedSet = new Set(excluded);
    const obstacles = nodes.filter(node => !excludedSet.has(node.id)).map(node => boxes.get(node.id)!);
    const self = cell.source === cell.target ? boxes.get(cell.source) : undefined;
    const invocation = spec.symbolId.toLowerCase().includes("invocation");
    const auto = self ? [{ x: self.x + self.width / 2, y: self.y - 40 }, { x: self.x + self.width + 40, y: self.y - 40 },
      { x: self.x + self.width + 40, y: self.y + self.height / 2 }] : cell.vertices ?? [];
    const sourceBox = boxes.get(cell.source), targetBox = boxes.get(cell.target);
    if (source && target && sourceBox && targetBox && !self && !auto.length && route?.mode !== "MANUAL"
      && !spec.cells.some(part => part.kind === "node") && spec.symbolId !== "feature.owner") {
      lanes.push({ id: cell.id, source: sourceBox, target: targetBox, start: source.point, end: target.point,
        startSide: sides.get(`${cell.id}:source`)!, endSide: sides.get(`${cell.id}:target`)!,
        obstacles: [...obstacles.filter(box => box !== sourceBox && box !== targetBox), ...symbolIds.map(id => boxes.get(id)!)] });
    }
    return { ...cell, data: { ...cell.data, routeSegment: segment, routeEditable: "true" },
      labels: invocation && !cell.labels.some(label => label.text === "ϟ") ? [...cell.labels, { position: 0.5, text: "ϟ", fontSize: 18 }] : cell.labels,
      sourceAnchor: source ? { dx: source.offset.x, dy: source.offset.y } : undefined,
      targetAnchor: target ? { dx: target.offset.x, dy: target.offset.y } : undefined,
      vertices: clearWaypoints(route?.mode === "MANUAL" ? route.points : invocation && !self ? [] : auto, obstacles),
      connector: { name: "normal", args: {} },
      router: orthogonalRouter([...excluded, ...symbolIds], sides.get(`${cell.id}:source`), sides.get(`${cell.id}:target`)) };
  }) }));
  const tracks = orthogonalLanes(lanes, reservedPaths);
  return routed.map(spec => ({ ...spec, cells: spec.cells.map(cell => cell.kind === "edge" && tracks.has(cell.id)
    // These lanes have already passed body-clearance and track checks. Sending
    // them through Manhattan again rebuilds its obstacle map for every edge.
    ? { ...cell, vertices: tracks.get(cell.id)!, router: { name: "normal", args: cell.router?.args ?? {} } } : cell) }));
}

/** Moving both endpoints translates a manual path; a single endpoint leaves its interior in place. */
export function moveManualRoutes(routes: readonly EdgeRoute[] | undefined, sourceDelta: { x: number; y: number }, targetDelta: { x: number; y: number }) {
  if (sourceDelta.x !== targetDelta.x || sourceDelta.y !== targetDelta.y || (!sourceDelta.x && !sourceDelta.y)) return routes;
  return routes?.map(route => route.mode !== "MANUAL" ? route : { ...route, points: route.points.map(point => ({ x: point.x + sourceDelta.x, y: point.y + sourceDelta.y })) });
}
