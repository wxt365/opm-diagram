import type { OpdNode } from "@/shared/types/modeling";
import { nodeDimensions } from "@/modules/workbench/opd/core/node-geometry";

/** State bodies intentionally belong inside their owners; the refinement envelope surrounds the OPD. */
export function overlappingNodeIds(nodes: readonly OpdNode[], refineeId?: string): string[] {
  const bodies = nodes.filter(node => node.id !== refineeId && node.kind !== "state")
    .map(node => ({ ...node, ...nodeDimensions(node) })).sort((a, b) => a.x - b.x || a.id.localeCompare(b.id));
  const overlaps = new Set<string>(); let active: typeof bodies = [];
  for (const body of bodies) {
    active = active.filter(other => other.x + other.width > body.x + 1);
    for (const other of active) {
      if (body.occurrenceRole !== "owned" && other.occurrenceRole !== "owned") continue;
      if (Math.min(body.x + body.width, other.x + other.width) - Math.max(body.x, other.x) > 1
        && Math.min(body.y + body.height, other.y + other.height) - Math.max(body.y, other.y) > 1) {
        overlaps.add(body.id); overlaps.add(other.id);
      }
    }
    active.push(body);
  }
  return [...overlaps].sort();
}
