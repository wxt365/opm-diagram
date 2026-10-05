import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";

export type RelationFamily = "PROCEDURAL" | "STRUCTURAL";

export interface RelationRenderContext {
  readonly nodes: readonly OpdNode[];
  readonly nodeById?: ReadonlyMap<string, OpdNode>;
  readonly highlightedFindingTargetId?: string;
}

export interface RelationLineSpec {
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly sourceMarker?: Record<string, unknown>;
  readonly targetMarker?: Record<string, unknown>;
  readonly captureAnchor?: string;
  readonly findingHighlighted?: boolean;
}

export interface RelationLabelSpec {
  readonly position: number;
  readonly text: string;
  readonly fontSize: number;
  readonly fontWeight?: number;
}

export interface RelationEdgeSpec {
  readonly kind: "edge";
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly zIndex?: number;
  readonly role?: "PROCESS_INPUT";
  readonly data: Readonly<Record<string, string>>;
  readonly line: RelationLineSpec;
  readonly labels: readonly RelationLabelSpec[];
  readonly vertices?: readonly Readonly<{ x: number; y: number }>[];
  readonly router?: Readonly<{ name: string; args: Readonly<Record<string, unknown>> }>;
}

export interface RelationNodeSpec {
  readonly kind: "node";
  readonly id: string;
  readonly shape: "polygon" | "rect" | "ellipse";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly zIndex: number;
  readonly angle?: number;
  readonly body: Readonly<Record<string, unknown>>;
  readonly label: Readonly<Record<string, unknown>>;
}

export type RelationCellSpec = RelationEdgeSpec | RelationNodeSpec;

export interface RelationRenderSpec {
  readonly selected?: boolean;
  readonly relationId: string;
  readonly occurrenceId: string;
  readonly family: RelationFamily;
  readonly symbolId: string;
  readonly cells: readonly RelationCellSpec[];
  readonly primaryCellId: string;
}

export interface OpdRelationDefinition {
  readonly definitionId: string;
  readonly capabilityId: string;
  readonly family: RelationFamily;
  buildRenderSpec(relation: ConsumptionRelation, context: RelationRenderContext): RelationRenderSpec;
}

export interface OpdControlDecoratorDefinition {
  readonly definitionId: string;
  readonly controlCapabilityId: string;
  decorate(base: RelationRenderSpec, relation: ConsumptionRelation, context: RelationRenderContext): RelationRenderSpec;
}
