import type { OpdNode } from "@/shared/types/modeling";
import { captureLayouts } from "./layoutSelection";
import { moveManualRoutes } from "@/modules/workbench/opd/core/relation-routing";

/** Root bends follow the owner; branch bends follow only when both ends move together. */
export function translatedFeatureLayouts(before: readonly OpdNode[], after: readonly OpdNode[]) {
  const old = new Map(before.map(node => [node.id, node]));
  const next = new Map(after.map(node => [node.id, node]));
  const byOccurrence = new Map(after.map(node => [node.occurrenceId, node]));
  const delta = (id: string) => ({ x: (next.get(id)?.x ?? 0) - (old.get(id)?.x ?? 0), y: (next.get(id)?.y ?? 0) - (old.get(id)?.y ?? 0) });
  return captureLayouts(after).flatMap(layout => {
    const node = byOccurrence.get(layout.occurrence_id)!;
    const routes = node.edgeRoutes?.map(route => {
      if (["feature.characterization", "feature.composition", "feature.characterization.junction", "feature.composition.junction"].includes(route.segment))
        return moveManualRoutes([route], delta(node.id), delta(node.id))![0]!;
      if (route.segment === "feature.owner" && node.ownerId && old.has(node.ownerId) && next.has(node.ownerId))
        return moveManualRoutes([route], delta(node.ownerId), delta(node.id))![0]!;
      return route;
    });
    return JSON.stringify(routes) === JSON.stringify(node.edgeRoutes) ? [] : [{ ...layout, layout: { ...layout.layout, edge_routes: routes } }];
  });
}
