import { ControlDecoratorRegistry } from "../core/control-decorator-registry";
import { RelationDefinitionRegistry } from "../core/relation-definition-registry";
import { enablingConditionDecorator } from "./control/enabling-condition.decorator";
import { enablingEventDecorator } from "./control/enabling-event.decorator";
import { stateSpecifiedEnablingConditionDecorator } from "./control/state-specified-enabling-condition.decorator";
import { stateSpecifiedEnablingEventDecorator } from "./control/state-specified-enabling-event.decorator";
import { stateSpecifiedTransformingConditionDecorator } from "./control/state-specified-transforming-condition.decorator";
import { stateSpecifiedTransformingEventDecorator } from "./control/state-specified-transforming-event.decorator";
import { transformingConditionDecorator } from "./control/transforming-condition.decorator";
import { transformingEventDecorator } from "./control/transforming-event.decorator";
import { agentDefinition } from "./procedural/agent.definition";
import { consumptionDefinition } from "./procedural/consumption.definition";
import { effectDefinition } from "./procedural/effect.definition";
import { inputOutputSpecifiedEffectDefinition } from "./procedural/input-output-specified-effect.definition";
import { inputSpecifiedEffectDefinition } from "./procedural/input-specified-effect.definition";
import { instrumentDefinition } from "./procedural/instrument.definition";
import { invocationDefinition } from "./procedural/invocation.definition";
import { overtimeExceptionDefinition } from "./procedural/overtime-exception.definition";
import { outputSpecifiedEffectDefinition } from "./procedural/output-specified-effect.definition";
import { resultDefinition } from "./procedural/result.definition";
import { selfInvocationDefinition } from "./procedural/self-invocation.definition";
import { stateSpecifiedAgentDefinition } from "./procedural/state-specified-agent.definition";
import { stateSpecifiedConsumptionDefinition } from "./procedural/state-specified-consumption.definition";
import { stateSpecifiedInstrumentDefinition } from "./procedural/state-specified-instrument.definition";
import { stateSpecifiedResultDefinition } from "./procedural/state-specified-result.definition";
import { undertimeExceptionDefinition } from "./procedural/undertime-exception.definition";
import { aggregationParticipationDefinition } from "./structural/aggregation-participation.definition";
import { bidirectionalTaggedDefinition } from "./structural/bidirectional-tagged.definition";
import { classificationInstantiationDefinition } from "./structural/classification-instantiation.definition";
import { exhibitionCharacterizationDefinition } from "./structural/exhibition-characterization.definition";
import { generalizationSpecializationDefinition } from "./structural/generalization-specialization.definition";
import { reciprocalTaggedDefinition } from "./structural/reciprocal-tagged.definition";
import { stateSpecifiedCharacterizationDefinition } from "./structural/state-specified-characterization.definition";
import { stateSpecifiedTaggedDefinition } from "./structural/state-specified-tagged.definition";
import { unidirectionalNullTaggedDefinition } from "./structural/unidirectional-null-tagged.definition";
import { unidirectionalTaggedDefinition } from "./structural/unidirectional-tagged.definition";

export const proceduralCapabilityIds = [
  "CAP-ISO-PROC-001", "CAP-ISO-PROC-002", "CAP-ISO-PROC-003", "CAP-ISO-PROC-004",
  "CAP-ISO-PROC-005", "CAP-ISO-PROC-006", "CAP-ISO-PROC-007", "CAP-ISO-PROC-008",
  "CAP-ISO-PROC-009", "CAP-ISO-PROC-010", "CAP-ISO-PROC-011", "CAP-ISO-PROC-012",
  "CAP-ISO-PROC-013", "CAP-ISO-PROC-014", "CAP-ISO-PROC-015", "CAP-ISO-PROC-016",
] as const;

export const structuralCapabilityIds = [
  "CAP-ISO-STRUCT-001", "CAP-ISO-STRUCT-002", "CAP-ISO-STRUCT-003", "CAP-ISO-STRUCT-004", "CAP-ISO-STRUCT-005",
  "CAP-ISO-STRUCT-006", "CAP-ISO-STRUCT-007", "CAP-ISO-STRUCT-008", "CAP-ISO-STRUCT-009", "CAP-ISO-STRUCT-010",
] as const;

export const controlCapabilityIds = [
  "CAP-ISO-CTRL-001", "CAP-ISO-CTRL-002", "CAP-ISO-CTRL-003", "CAP-ISO-CTRL-004",
  "CAP-ISO-CTRL-005", "CAP-ISO-CTRL-006", "CAP-ISO-CTRL-007", "CAP-ISO-CTRL-008",
] as const;

export function createBuiltInRelationRegistry() {
  const registry = new RelationDefinitionRegistry();
  [
    consumptionDefinition, resultDefinition, effectDefinition, agentDefinition, instrumentDefinition, stateSpecifiedConsumptionDefinition,
    stateSpecifiedResultDefinition, inputOutputSpecifiedEffectDefinition, inputSpecifiedEffectDefinition, outputSpecifiedEffectDefinition,
    stateSpecifiedAgentDefinition, stateSpecifiedInstrumentDefinition, invocationDefinition, selfInvocationDefinition, overtimeExceptionDefinition,
    undertimeExceptionDefinition, unidirectionalTaggedDefinition, unidirectionalNullTaggedDefinition, bidirectionalTaggedDefinition,
    reciprocalTaggedDefinition, aggregationParticipationDefinition, exhibitionCharacterizationDefinition, generalizationSpecializationDefinition,
    classificationInstantiationDefinition, stateSpecifiedCharacterizationDefinition, stateSpecifiedTaggedDefinition,
  ].forEach((definition) => registry.register(definition));
  registry.verifyComplete([...proceduralCapabilityIds, ...structuralCapabilityIds]);
  return registry;
}

export function createBuiltInControlDecoratorRegistry() {
  const registry = new ControlDecoratorRegistry();
  [
    transformingEventDecorator, enablingEventDecorator, stateSpecifiedTransformingEventDecorator, stateSpecifiedEnablingEventDecorator,
    transformingConditionDecorator, enablingConditionDecorator, stateSpecifiedTransformingConditionDecorator, stateSpecifiedEnablingConditionDecorator,
  ].forEach((definition) => registry.register(definition));
  registry.verifyComplete(controlCapabilityIds);
  return registry;
}
