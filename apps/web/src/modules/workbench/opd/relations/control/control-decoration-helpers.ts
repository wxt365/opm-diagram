import type { ConsumptionRelation } from "@/shared/types/modeling";

import { OpdRelationRenderError } from "../../core/relation-definition-registry";
import type { OpdControlDecoratorDefinition, RelationRenderSpec } from "../../core/relation-render-spec";

export function createControlDecorator(controlCapabilityId: string, definitionId: string, annotation: "e" | "c"): OpdControlDecoratorDefinition {
  return {
    definitionId,
    controlCapabilityId,
    decorate(base: RelationRenderSpec, relation: ConsumptionRelation): RelationRenderSpec {
      if (base.family !== "PROCEDURAL" || relation.controlSegment !== "PROCESS_INPUT") {
        throw new OpdRelationRenderError("OPD_CONTROL_DECORATION_INVALID", `Control ${controlCapabilityId} 缺少可装饰的 PROCESS_INPUT segment`);
      }
      let decorated = false;
      const cells = base.cells.map((cell) => {
        if (cell.kind !== "edge" || cell.role !== "PROCESS_INPUT") return cell;
        decorated = true;
        return { ...cell, labels: [...cell.labels, { position: 0.88, text: annotation, fontSize: 13, fontWeight: 700 }] };
      });
      if (!decorated) throw new OpdRelationRenderError("OPD_CONTROL_DECORATION_INVALID", `Control ${controlCapabilityId} 没有 PROCESS_INPUT segment`);
      return { ...base, cells };
    },
  };
}
