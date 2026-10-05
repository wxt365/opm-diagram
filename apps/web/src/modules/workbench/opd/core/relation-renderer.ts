import type { ConsumptionRelation } from "@/shared/types/modeling";

import { ControlDecoratorRegistry } from "./control-decorator-registry";
import { RelationDefinitionRegistry, OpdRelationRenderError } from "./relation-definition-registry";
import type { RelationRenderContext, RelationRenderSpec } from "./relation-render-spec";

export function buildRelationRenderSpec(
  relation: ConsumptionRelation,
  context: RelationRenderContext,
  definitions: RelationDefinitionRegistry,
  decorators: ControlDecoratorRegistry,
): RelationRenderSpec {
  if (!relation.capabilityId) throw new OpdRelationRenderError("OPD_RELATION_DEFINITION_MISSING", `关系 ${relation.id} 缺少 capability_id`);
  const base = definitions.require(relation.capabilityId).buildRenderSpec(relation, context);
  validateBaseSpec(base, relation);
  if (!relation.controlCapability) return base;
  const decorated = decorators.require(relation.controlCapability).decorate(base, relation, context);
  validateDecoration(base, decorated);
  return decorated;
}

function validateBaseSpec(spec: RelationRenderSpec, relation: ConsumptionRelation) {
  const primary = spec.cells.find((cell) => cell.id === spec.primaryCellId);
  if (spec.relationId !== relation.id || spec.occurrenceId !== relation.occurrenceId || !primary || primary.kind !== "edge") {
    throw new OpdRelationRenderError("OPD_RELATION_RENDER_SPEC_INVALID", `关系 RenderSpec 非法：${relation.id}`);
  }
  const captureCells = spec.cells.filter((cell) => cell.kind === "edge" && cell.line.captureAnchor === relation.occurrenceId);
  if (captureCells.length !== 1 || captureCells[0]?.id !== spec.primaryCellId) {
    throw new OpdRelationRenderError("OPD_RELATION_RENDER_SPEC_INVALID", `关系 capture anchor 非法：${relation.id}`);
  }
}

function validateDecoration(base: RelationRenderSpec, decorated: RelationRenderSpec) {
  if (base.family !== "PROCEDURAL"
    || base.relationId !== decorated.relationId
    || base.occurrenceId !== decorated.occurrenceId
    || base.family !== decorated.family
    || base.symbolId !== decorated.symbolId
    || base.primaryCellId !== decorated.primaryCellId
    || base.cells.length !== decorated.cells.length) {
    throw new OpdRelationRenderError("OPD_CONTROL_DECORATION_INVALID", "Control Decorator 改变了基础关系 identity");
  }
  const captures = decorated.cells.filter((cell) => cell.kind === "edge" && cell.line.captureAnchor === decorated.occurrenceId);
  if (captures.length !== 1 || captures[0]?.id !== decorated.primaryCellId) {
    throw new OpdRelationRenderError("OPD_CONTROL_DECORATION_INVALID", "Control Decorator 改变了 capture anchor");
  }
}
