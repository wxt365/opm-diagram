export type RelationToolGlyphKind =
  | "closed-target"
  | "state-effect-pair"
  | "filled-circle"
  | "open-circle"
  | "invocation"
  | "self-invocation"
  | "overtime"
  | "undertime"
  | "control-closed"
  | "control-filled-circle"
  | "tagged-directed"
  | "tagged-bidirectional"
  | "fan-aggregation"
  | "fan-exhibition"
  | "fan-generalization"
  | "fan-classification";

export interface RelationToolGlyph {
  readonly kind: RelationToolGlyphKind;
  readonly stateSource?: boolean;
  readonly stateTarget?: boolean;
  readonly annotation?: "e" | "c";
}

const glyphs: Readonly<Record<string, RelationToolGlyph>> = {
  "symbol.link.consumption": { kind: "closed-target" },
  "symbol.link.result": { kind: "closed-target" },
  "symbol.link.effect": { kind: "state-effect-pair" },
  "symbol.link.agent": { kind: "filled-circle" },
  "symbol.link.instrument": { kind: "open-circle" },
  "symbol.link.consumption.state": { kind: "closed-target", stateSource: true },
  "symbol.link.result.state": { kind: "closed-target", stateTarget: true },
  "symbol.link.effect.state.input-output": { kind: "state-effect-pair", stateSource: true, stateTarget: true },
  "symbol.link.effect.state.input": { kind: "state-effect-pair", stateSource: true },
  "symbol.link.effect.state.output": { kind: "state-effect-pair", stateTarget: true },
  "symbol.link.agent.state": { kind: "filled-circle", stateSource: true },
  "symbol.link.instrument.state": { kind: "open-circle", stateSource: true },
  "symbol.link.invocation": { kind: "invocation" },
  "symbol.link.invocation.self": { kind: "self-invocation" },
  "symbol.link.exception.overtime": { kind: "overtime" },
  "symbol.link.exception.undertime": { kind: "undertime" },
  "symbol.control.event.transforming": { kind: "control-closed", annotation: "e" },
  "symbol.control.event.enabling": { kind: "control-filled-circle", annotation: "e" },
  "symbol.control.event.transforming.state": { kind: "control-closed", stateSource: true, annotation: "e" },
  "symbol.control.event.enabling.state": { kind: "control-filled-circle", stateSource: true, annotation: "e" },
  "symbol.control.condition.transforming": { kind: "control-closed", annotation: "c" },
  "symbol.control.condition.enabling": { kind: "control-filled-circle", annotation: "c" },
  "symbol.control.condition.transforming.state": { kind: "control-closed", stateSource: true, annotation: "c" },
  "symbol.control.condition.enabling.state": { kind: "control-filled-circle", stateSource: true, annotation: "c" },
  "symbol.link.structural.tagged.unidirectional": { kind: "tagged-directed" },
  "symbol.link.structural.null-tagged.unidirectional": { kind: "tagged-directed" },
  "symbol.link.structural.tagged.bidirectional": { kind: "tagged-bidirectional" },
  "symbol.link.structural.tagged.reciprocal": { kind: "tagged-bidirectional" },
  "symbol.link.structural.aggregation": { kind: "fan-aggregation" },
  "symbol.link.structural.exhibition": { kind: "fan-exhibition" },
  "symbol.link.structural.generalization": { kind: "fan-generalization" },
  "symbol.link.structural.classification": { kind: "fan-classification" },
  "symbol.link.structural.exhibition.state": { kind: "fan-exhibition", stateTarget: true },
  "symbol.link.structural.tagged.state": { kind: "tagged-directed", stateTarget: true },
};

export function resolveRelationToolGlyph(symbolId: string): RelationToolGlyph | undefined {
  return glyphs[symbolId];
}

export function isSupportedRelationToolSymbol(symbolId: string): boolean {
  return resolveRelationToolGlyph(symbolId) !== undefined;
}
