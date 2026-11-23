import { expect, it } from "vitest";
import { withProceduralName } from "./procedural-labels";
import type { RelationRenderSpec } from "./relation-render-spec";

const spec: RelationRenderSpec = { family: "PROCEDURAL", relationId: "r", occurrenceId: "o", symbolId: "s", primaryCellId: "input", cells: ["input", "output"].map(id => ({
  kind: "edge", id, source: "a", target: "b", data: {}, line: { stroke: "black", strokeWidth: 2 }, labels: [{ position: 0.82, text: "5s", fontSize: 11 }],
})) };
it("默认不显示，开启只给主线添加名称且保留时长，源规格不变", () => {
  expect(withProceduralName(spec, "CAP-ISO-PROC-003", false)).toBe(spec);
  const shown = withProceduralName(spec, "CAP-ISO-PROC-003", true);
  expect(shown.cells[0]).toMatchObject({ labels: [{ text: "5s" }, { text: "影响" }] });
  expect(shown.cells[1]).toEqual(spec.cells[1]);
  expect(withProceduralName(spec, "CAP-ISO-PROC-003", true)).toEqual(shown);
  expect(withProceduralName(spec, "CAP-ISO-PROC-003", false)).toBe(spec);
});
it("结构关系名称不受过程关系开关影响", () => {
  const structural = { ...spec, family: "STRUCTURAL" as const };
  expect(withProceduralName(structural, "CAP-ISO-STRUCT-001", true)).toBe(structural);
});
