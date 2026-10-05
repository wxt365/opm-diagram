import { describe, expect, it } from "vitest";

import { isSupportedRelationToolSymbol, resolveRelationToolGlyph } from "./relation-tool-symbol";

const symbolIds = [
  "symbol.link.consumption", "symbol.link.result", "symbol.link.effect", "symbol.link.agent", "symbol.link.instrument",
  "symbol.link.consumption.state", "symbol.link.result.state", "symbol.link.effect.state.input-output", "symbol.link.effect.state.input",
  "symbol.link.effect.state.output", "symbol.link.agent.state", "symbol.link.instrument.state", "symbol.link.invocation",
  "symbol.link.invocation.self", "symbol.link.exception.overtime", "symbol.link.exception.undertime",
  "symbol.control.event.transforming", "symbol.control.event.enabling", "symbol.control.event.transforming.state",
  "symbol.control.event.enabling.state", "symbol.control.condition.transforming", "symbol.control.condition.enabling",
  "symbol.control.condition.transforming.state", "symbol.control.condition.enabling.state",
  "symbol.link.structural.tagged.unidirectional", "symbol.link.structural.null-tagged.unidirectional",
  "symbol.link.structural.tagged.bidirectional", "symbol.link.structural.tagged.reciprocal", "symbol.link.structural.aggregation",
  "symbol.link.structural.exhibition", "symbol.link.structural.generalization", "symbol.link.structural.classification",
  "symbol.link.structural.exhibition.state", "symbol.link.structural.tagged.state",
] as const;

describe("relation tool symbol", () => {
  it("覆盖活动 16/8/10 Symbol ID 且不提供未知 fallback", () => {
    expect(symbolIds).toHaveLength(34);
    expect(symbolIds.every(isSupportedRelationToolSymbol)).toBe(true);
    expect(resolveRelationToolGlyph("symbol.unknown")).toBeUndefined();
  });

  it("保留标准 marker、Control 注记和四类结构三角的区分", () => {
    expect(resolveRelationToolGlyph("symbol.link.effect")?.kind).toBe("state-effect-pair");
    expect(resolveRelationToolGlyph("symbol.link.agent")?.kind).toBe("filled-circle");
    expect(resolveRelationToolGlyph("symbol.link.instrument")?.kind).toBe("open-circle");
    expect(resolveRelationToolGlyph("symbol.control.event.transforming")?.annotation).toBe("e");
    expect(resolveRelationToolGlyph("symbol.control.condition.transforming")?.annotation).toBe("c");
    expect([
      resolveRelationToolGlyph("symbol.link.structural.aggregation")?.kind,
      resolveRelationToolGlyph("symbol.link.structural.exhibition")?.kind,
      resolveRelationToolGlyph("symbol.link.structural.generalization")?.kind,
      resolveRelationToolGlyph("symbol.link.structural.classification")?.kind,
    ]).toEqual(["fan-aggregation", "fan-exhibition", "fan-generalization", "fan-classification"]);
  });
});
