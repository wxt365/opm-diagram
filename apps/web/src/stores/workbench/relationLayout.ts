import type { ConsumptionRelation, EdgeRoute, OpdNode } from "@/shared/types/modeling";
import type { NodeLayout } from "./layoutSelection";
import { moveManualRoutes } from "@/modules/workbench/opd/core/relation-routing";

export function captureRelationLayouts(relations: readonly ConsumptionRelation[]): NodeLayout[] {
  return relations.map(relation => ({ occurrence_id: relation.occurrenceId, layout: {
    x: relation.layout?.x ?? 0, y: relation.layout?.y ?? 0, width: relation.layout?.width ?? 2, height: relation.layout?.height ?? 2,
    edge_routes: relation.edgeRoutes ?? [],
  } }));
}

export function translatedRelationLayouts(relations: readonly ConsumptionRelation[], before: readonly OpdNode[], after: readonly OpdNode[]) {
  const old = new Map(before.map(node => [node.id, node])), next = new Map(after.map(node => [node.id, node]));
  const delta = (id: string) => ({ x: (next.get(id)?.x ?? 0) - (old.get(id)?.x ?? 0), y: (next.get(id)?.y ?? 0) - (old.get(id)?.y ?? 0) });
  return captureRelationLayouts(relations).flatMap((layout, index) => {
    const relation = relations[index]!;
    const endpoints = relation.endpoints?.slice().sort((a, b) => a.ordinal - b.ordinal);
    const routes = relation.edgeRoutes?.map(route => {
      // A fan junction depends on every member: moving just two members must not shift all bends.
      if (route.segment === "root" || route.segment.startsWith("part.")) {
        const deltas = endpoints?.map(endpoint => delta(endpoint.targetId)) ?? [];
        const first = deltas[0];
        return first && deltas.every(value => value.x === first.x && value.y === first.y)
          ? moveManualRoutes([route], first, first)![0]! : route;
      }
      const source = route.segment === "output" ? endpoints?.[1]?.targetId ?? relation.sourceId : relation.sourceId;
      const target = route.segment === "output" ? endpoints?.[2]?.targetId ?? relation.targetId : relation.targetId;
      return moveManualRoutes([route], delta(source), delta(target))![0]!;
    });
    return JSON.stringify(routes ?? []) === JSON.stringify(relation.edgeRoutes ?? []) ? [] : [{ ...layout, layout: { ...layout.layout, edge_routes: routes } }];
  });
}

export function replaceSegmentRoute(relation: { edgeRoutes?: EdgeRoute[] }, route: EdgeRoute) {
  return [...(relation.edgeRoutes ?? []).filter(item => item.segment !== route.segment), route];
}
