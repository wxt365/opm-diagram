import type { OpdControlDecoratorDefinition } from "./relation-render-spec";
import { OpdRelationRenderError } from "./relation-definition-registry";

export class ControlDecoratorRegistry {
  private readonly definitions = new Map<string, OpdControlDecoratorDefinition>();
  private readonly definitionIds = new Set<string>();

  register(definition: OpdControlDecoratorDefinition) {
    if (this.definitions.has(definition.controlCapabilityId) || this.definitionIds.has(definition.definitionId)) {
      throw new OpdRelationRenderError("OPD_CONTROL_DECORATOR_DUPLICATE", `重复 Control Decorator：${definition.controlCapabilityId}`);
    }
    this.definitions.set(definition.controlCapabilityId, definition);
    this.definitionIds.add(definition.definitionId);
    return this;
  }

  require(capabilityId: string) {
    const definition = this.definitions.get(capabilityId);
    if (!definition) throw new OpdRelationRenderError("OPD_CONTROL_DECORATOR_MISSING", `缺少 Control Decorator：${capabilityId}`);
    return definition;
  }

  verifyComplete(expectedCapabilityIds: readonly string[]) {
    if (this.definitions.size !== expectedCapabilityIds.length || expectedCapabilityIds.some((id) => !this.definitions.has(id))) {
      throw new OpdRelationRenderError("OPD_CONTROL_DECORATOR_MISSING", "Control Decorator 注册不完整");
    }
  }
}
