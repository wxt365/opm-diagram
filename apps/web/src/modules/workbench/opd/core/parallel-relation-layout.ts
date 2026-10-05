import type { RelationRenderSpec } from "./relation-render-spec";

interface Point {
  readonly x: number;
  readonly y: number;
}

interface ParallelCandidate {
  readonly spec: RelationRenderSpec;
  readonly source: string;
  readonly target: string;
  readonly sourceCenter: Point;
  readonly targetCenter: Point;
}

export const PARALLEL_RELATION_LANE_GAP = 24;

export function layoutParallelBinaryRelations(
  specs: readonly RelationRenderSpec[],
  nodeCenter: (nodeId: string) => Point | undefined,
): RelationRenderSpec[] {
  const groups = new Map<string, ParallelCandidate[]>();
  const replacements = new Map<string, RelationRenderSpec>();

  specs.forEach((spec) => {
    const primary = spec.cells.find((cell) => cell.id === spec.primaryCellId);
    if (spec.cells.length !== 1 || primary?.kind !== "edge" || primary.vertices?.length || primary.router || primary.source === primary.target) return;
    const sourceCenter = nodeCenter(primary.source);
    const targetCenter = nodeCenter(primary.target);
    if (!sourceCenter || !targetCenter) return;
    const key = [primary.source, primary.target].sort().join("\u0000");
    const group = groups.get(key) ?? [];
    group.push({ spec, source: primary.source, target: primary.target, sourceCenter, targetCenter });
    groups.set(key, group);
  });

  groups.forEach((group) => {
    if (group.length < 2) return;
    const ordered = [...group].sort((left, right) => left.spec.relationId.localeCompare(right.spec.relationId)
      || left.spec.occurrenceId.localeCompare(right.spec.occurrenceId));
    const first = ordered[0]!;
    const [canonicalSource] = [first.source, first.target].sort();
    const start = first.source === canonicalSource ? first.sourceCenter : first.targetCenter;
    const end = first.source === canonicalSource ? first.targetCenter : first.sourceCenter;
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const length = Math.hypot(dx, dy);
    if (length === 0) return;
    const normal = { x: -dy / length, y: dx / length };
    const midpoint = { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };

    ordered.forEach((candidate, index) => {
      const offset = (index - (ordered.length - 1) / 2) * PARALLEL_RELATION_LANE_GAP;
      const cells = candidate.spec.cells.map((cell) => cell.id === candidate.spec.primaryCellId && cell.kind === "edge"
        ? { ...cell, vertices: [{ x: midpoint.x + normal.x * offset, y: midpoint.y + normal.y * offset }] }
        : cell);
      replacements.set(candidate.spec.occurrenceId, { ...candidate.spec, cells });
    });
  });

  return specs.map((spec) => replacements.get(spec.occurrenceId) ?? spec);
}
