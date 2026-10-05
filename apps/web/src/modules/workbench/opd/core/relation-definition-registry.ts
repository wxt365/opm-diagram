import type { OpdRelationDefinition } from "./relation-render-spec";

export class OpdRelationRenderError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

export class RelationDefinitionRegistry {
  private readonly definitions = new Map<string, OpdRelationDefinition>();
  private readonly definitionIds = new Set<string>();

  register(definition: OpdRelationDefinition) {
    if (this.definitions.has(definition.capabilityId) || this.definitionIds.has(definition.definitionId)) {
      throw new OpdRelationRenderError("OPD_RELATION_DEFINITION_DUPLICATE", `重复关系 Definition：${definition.capabilityId}`);
    }
    this.definitions.set(definition.capabilityId, definition);
    this.definitionIds.add(definition.definitionId);
    return this;
  }

  require(capabilityId: string) {
    const definition = this.definitions.get(capabilityId);
    if (!definition) throw new OpdRelationRenderError("OPD_RELATION_DEFINITION_MISSING", `缺少关系 Definition：${capabilityId}`);
    return definition;
  }

  verifyComplete(expectedCapabilityIds: readonly string[]) {
    if (this.definitions.size !== expectedCapabilityIds.length || expectedCapabilityIds.some((id) => !this.definitions.has(id))) {
      throw new OpdRelationRenderError("OPD_RELATION_DEFINITION_MISSING", "基础关系 Definition 注册不完整");
    }
  }
}
