import { describe, expect, it } from "vitest";

import { layoutParallelBinaryRelations, PARALLEL_RELATION_LANE_GAP } from "./parallel-relation-layout";
import type { RelationRenderSpec } from "./relation-render-spec";

const centerMap: Record<string, { x: number; y: number }> = {
  left: { x: 0, y: 0 },
  right: { x: 100, y: 0 },
};
const centers = (id: string) => centerMap[id];

describe("parallel relation layout", () => {
  it("单条关系保持直线，两条同向关系分居两侧", () => {
    const one = layoutParallelBinaryRelations([spec("fact.one")], centers);
    expect(primary(one[0]!).vertices).toBeUndefined();

    const two = layoutParallelBinaryRelations([spec("fact.one"), spec("fact.two")], centers);
    expect(primary(two[0]!).vertices).toEqual([{ x: 50, y: -PARALLEL_RELATION_LANE_GAP / 2 }]);
    expect(primary(two[1]!).vertices).toEqual([{ x: 50, y: PARALLEL_RELATION_LANE_GAP / 2 }]);
  });

  it("三条关系稳定对称分轨且输入顺序不改变 identity 对应轨道", () => {
    const ordered = layoutParallelBinaryRelations([spec("fact.a"), spec("fact.b"), spec("fact.c")], centers);
    const shuffled = layoutParallelBinaryRelations([spec("fact.c"), spec("fact.a"), spec("fact.b")], centers);
    expect(lanes(ordered)).toEqual({ "fact.a": -24, "fact.b": 0, "fact.c": 24 });
    expect(lanes(shuffled)).toEqual(lanes(ordered));
  });

  it("正反向关系使用同一规范法向量，不会落到同一轨道", () => {
    const result = layoutParallelBinaryRelations([spec("fact.a"), spec("fact.b", "right", "left")], centers);
    expect(lanes(result)).toEqual({ "fact.a": -12, "fact.b": 12 });
  });

  it("保留 fan、已有 route、自调用和缺少端点中心的原始 RenderSpec", () => {
    const complex = { ...spec("fact.complex"), cells: [{ ...primary(spec("fact.complex")), vertices: [{ x: 40, y: 20 }] }] } as RelationRenderSpec;
    const fan = { ...spec("fact.fan"), cells: [...spec("fact.fan").cells, { ...primary(spec("fact.fan")), id: "fact.fan.branch" }] } as RelationRenderSpec;
    const self = spec("fact.self", "left", "left");
    const missing = spec("fact.missing", "left", "unknown");
    const result = layoutParallelBinaryRelations([complex, fan, self, missing], centers);
    expect(result).toEqual([complex, fan, self, missing]);
  });
});

function spec(relationId: string, source = "left", target = "right"): RelationRenderSpec {
  return {
    relationId,
    occurrenceId: `occurrence.${relationId}`,
    family: "PROCEDURAL",
    symbolId: "symbol.test",
    primaryCellId: relationId,
    cells: [{
      kind: "edge", id: relationId, source, target, data: { relationId }, labels: [],
      line: { stroke: "#20242a", strokeWidth: 2, captureAnchor: `occurrence.${relationId}` },
    }],
  };
}

function primary(specification: RelationRenderSpec) {
  const cell = specification.cells.find((item) => item.id === specification.primaryCellId);
  if (!cell || cell.kind !== "edge") throw new Error("测试关系缺少 primary edge");
  return cell;
}

function lanes(specs: readonly RelationRenderSpec[]) {
  return Object.fromEntries(specs.map((item) => [item.relationId, primary(item).vertices?.[0]?.y]));
}
