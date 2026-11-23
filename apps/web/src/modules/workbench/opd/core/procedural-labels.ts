import type { RelationRenderSpec } from "./relation-render-spec";
import { graphRelationName } from "../../graphAnalysisModel";

export function withProceduralName(spec: RelationRenderSpec, capabilityId: string | undefined, visible: boolean): RelationRenderSpec {
  if (!visible || spec.family !== "PROCEDURAL" || !capabilityId) return spec;
  return { ...spec, cells: spec.cells.map(cell => cell.kind === "edge" && cell.id === spec.primaryCellId
    ? { ...cell, labels: [...cell.labels, { position: 0.5, text: graphRelationName(capabilityId), fontSize: 11, fontWeight: 600 }] } : cell) };
}
