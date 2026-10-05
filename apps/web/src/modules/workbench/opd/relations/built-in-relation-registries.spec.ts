import { describe, expect, it } from "vitest";

import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";
import { buildRelationRenderSpec } from "../core/relation-renderer";
import { RelationDefinitionRegistry } from "../core/relation-definition-registry";
import { createBuiltInControlDecoratorRegistry, createBuiltInRelationRegistry, controlCapabilityIds, proceduralCapabilityIds, structuralCapabilityIds } from "./built-in-relation-registries";
import { consumptionDefinition } from "./procedural/consumption.definition";

const context = { nodes: [node("object.input", "object", 80, 80), node("process.transform", "process", 400, 80), node("object.output", "object", 680, 80)] };

describe("Capability 级 Relation Registry", () => {
  it.each([[400, 80, 270], [-240, 80, 90], [80, 400, 0], [80, -240, 180]])("展示—特征在布局 %s,%s 下使用双层三角且尖端连接 owner", (x, y, angle) => {
    const spec = buildRelationRenderSpec({
      ...relation("CAP-ISO-STRUCT-006"),
      endpoints: [endpoint("EXHIBITOR_THING", "owner", 0), endpoint("FEATURE_THING", "feature", 1)],
    }, { nodes: [node("owner", "object", 80, 80), { ...node("feature", "attribute", x, y), width: 160, height: 72 }] }, createBuiltInRelationRegistry(), createBuiltInControlDecoratorRegistry());
    const triangles = spec.cells.filter((cell) => cell.kind === "node");
    expect(triangles).toHaveLength(2);
    expect(triangles[0]).toMatchObject({ angle, body: { fill: "#ffffff" } });
    expect(triangles[1]).toMatchObject({ angle, body: { fill: "#20242a" } });
    expect(spec.cells.filter((cell) => cell.kind === "edge").every((cell) => !cell.line.sourceMarker && !cell.line.targetMarker)).toBe(true);
    expect(spec.cells.find((cell) => cell.id === spec.primaryCellId)).toMatchObject({ source: "owner" });
  });
  it("显式注册 16 Procedural、10 Structural 与 8 Control Capability", () => {
    const definitions = createBuiltInRelationRegistry();
    const decorators = createBuiltInControlDecoratorRegistry();

    [...proceduralCapabilityIds, ...structuralCapabilityIds].forEach((capabilityId) => expect(definitions.require(capabilityId).capabilityId).toBe(capabilityId));
    controlCapabilityIds.forEach((capabilityId) => expect(decorators.require(capabilityId).controlCapabilityId).toBe(capabilityId));
  });

  it("未知或重复基础 Capability 以稳定诊断码 fail closed", () => {
    const definitions = createBuiltInRelationRegistry();
    expect(() => definitions.require("CAP-ISO-PROC-999")).toThrow(expect.objectContaining({ code: "OPD_RELATION_DEFINITION_MISSING" }));
    const duplicate = new RelationDefinitionRegistry();
    duplicate.register(consumptionDefinition);
    expect(() => duplicate.register(consumptionDefinition)).toThrow(expect.objectContaining({ code: "OPD_RELATION_DEFINITION_DUPLICATE" }));
  });

  it("Control Decorator 保持基础 Fact、Occurrence、Relation Group 与 capture anchor", () => {
    const definitions = createBuiltInRelationRegistry();
    const decorators = createBuiltInControlDecoratorRegistry();
    const baseRelation = relation("CAP-ISO-PROC-001");
    const base = buildRelationRenderSpec(baseRelation, context, definitions, decorators);

    controlCapabilityIds.forEach((controlCapability) => {
      const decorated = buildRelationRenderSpec({ ...baseRelation, controlCapability, controlSegment: "PROCESS_INPUT" }, context, definitions, decorators);
      expect(decorated.relationId).toBe(base.relationId);
      expect(decorated.occurrenceId).toBe(base.occurrenceId);
      expect(decorated.primaryCellId).toBe(base.primaryCellId);
      expect(decorated.cells).toHaveLength(base.cells.length);
      expect(decorated.cells.filter((cell) => cell.kind === "edge" && cell.line.captureAnchor === base.occurrenceId)).toHaveLength(1);
      const primary = decorated.cells.find((cell) => cell.id === decorated.primaryCellId);
      expect(primary?.kind === "edge" && primary.labels.at(-1)?.text).toBe(Number(controlCapability.slice(-3)) <= 4 ? "e" : "c");
    });
  });

  it("非法 Control segment 使用冻结诊断码拒绝", () => {
    expect(() => buildRelationRenderSpec(
      { ...relation("CAP-ISO-PROC-001"), controlCapability: "CAP-ISO-CTRL-001" },
      context,
      createBuiltInRelationRegistry(),
      createBuiltInControlDecoratorRegistry(),
    )).toThrow(expect.objectContaining({ code: "OPD_CONTROL_DECORATION_INVALID" }));
  });

  it("Effect 只让 primary input segment 承载 committed capture anchor", () => {
    const spec = buildRelationRenderSpec({
      ...relation("CAP-ISO-PROC-003"),
      endpoints: [endpoint("AFFECTEE", "object.input", 0), endpoint("AFFECTING_PROCESS", "process.transform", 1), endpoint("AFFECTED", "object.input", 2)],
    }, context, createBuiltInRelationRegistry(), createBuiltInControlDecoratorRegistry());
    expect(spec.primaryCellId).toBe("fact.example.input");
    expect(spec.cells.filter((cell) => cell.kind === "edge" && cell.line.captureAnchor === "occurrence.fact.example")).toHaveLength(1);
    const edges = spec.cells.filter((cell) => cell.kind === "edge");
    expect(edges.map((edge) => [edge.source, edge.target])).toEqual([
      ["object.input", "process.transform"], ["process.transform", "object.input"],
    ]);
    expect(edges.every((edge) => !edge.line.sourceMarker && edge.line.targetMarker?.name === "classic")).toBe(true);
  });

  it("状态过程关系线位于对象框之上，普通关系保持原层级", () => {
    const stateContext = { nodes: [
      node("object.input", "object", 80, 80),
      node("state.pending", "state", 100, 130),
      node("state.ready", "state", 100, 170),
      node("process.transform", "process", 400, 80),
    ] };
    const definitions = createBuiltInRelationRegistry();
    const decorators = createBuiltInControlDecoratorRegistry();
    const render = (value: ConsumptionRelation) => buildRelationRenderSpec(value, stateContext, definitions, decorators);
    const consumption = render({ ...relation("CAP-ISO-PROC-006"), sourceId: "state.pending",
      endpoints: [stateEndpoint("CONSUMED_STATE", "state.pending", 0), endpoint("CONSUMING_PROCESS", "process.transform", 1)] });
    const result = render({ ...relation("CAP-ISO-PROC-007"), sourceId: "process.transform", targetId: "state.ready",
      endpoints: [endpoint("RESULT_PROCESS", "process.transform", 0), stateEndpoint("RESULT_STATE", "state.ready", 1)] });
    const effect = render({ ...relation("CAP-ISO-PROC-008"),
      endpoints: [stateEndpoint("AFFECTEE_INPUT_STATE", "state.pending", 0), endpoint("AFFECTING_PROCESS", "process.transform", 1), stateEndpoint("AFFECTED_OUTPUT_STATE", "state.ready", 2)] });
    const ordinary = render(relation("CAP-ISO-PROC-001"));

    for (const spec of [consumption, result, effect]) {
      expect(spec.cells.filter((cell) => cell.kind === "edge").every((cell) => cell.zIndex === 2.5)).toBe(true);
    }
    const effectEdges = effect.cells.filter((cell) => cell.kind === "edge");
    expect(effectEdges.map((edge) => [edge.source, edge.target])).toEqual([
      ["state.pending", "process.transform"], ["process.transform", "state.ready"],
    ]);
    expect(effectEdges.every((edge) => !edge.line.sourceMarker && edge.line.targetMarker?.name === "classic")).toBe(true);
    expect(ordinary.cells[0]).toMatchObject({ kind: "edge", source: "object.input", target: "process.transform" });
    expect(ordinary.cells[0]?.kind === "edge" && ordinary.cells[0].zIndex).toBeUndefined();
  });

  it.each(["CAP-ISO-STRUCT-001", "CAP-ISO-STRUCT-002", "CAP-ISO-STRUCT-010"])("%s 的画布目标端使用开放箭头", (capabilityId) => {
    const spec = buildRelationRenderSpec({ ...relation(capabilityId),
      endpoints: [endpoint("STRUCTURAL_SOURCE", "object.input", 0), endpoint("STRUCTURAL_TARGET", "object.output", 1)] },
    context, createBuiltInRelationRegistry(), createBuiltInControlDecoratorRegistry());
    expect(spec.cells[0]).toMatchObject({ kind: "edge", line: { targetMarker: { name: "block", open: true, fill: "none" } } });
  });

  it.each(["CAP-ISO-STRUCT-003", "CAP-ISO-STRUCT-004"])("%s 的画布两端使用开放半箭头", (capabilityId) => {
    const spec = buildRelationRenderSpec({ ...relation(capabilityId),
      endpoints: [endpoint("STRUCTURAL_SOURCE", "object.input", 0), endpoint("STRUCTURAL_TARGET", "object.output", 1)] },
    context, createBuiltInRelationRegistry(), createBuiltInControlDecoratorRegistry());
    expect(spec.cells[0]).toMatchObject({ kind: "edge", line: {
      sourceMarker: { name: "path", fill: "none" }, targetMarker: { name: "path", fill: "none" },
    } });
  });

  it("分类交点包含黑圆点，状态指定特征关系包含内嵌黑三角", () => {
    const definitions = createBuiltInRelationRegistry();
    const decorators = createBuiltInControlDecoratorRegistry();
    const classification = buildRelationRenderSpec({ ...relation("CAP-ISO-STRUCT-008"),
      endpoints: [endpoint("CLASS_THING", "object.input", 0), endpoint("INSTANCE_THING", "object.output", 1)] },
    context, definitions, decorators);
    expect(classification.cells.filter((cell) => cell.kind === "node")).toMatchObject([
      { shape: "polygon", body: { fill: "#ffffff" } }, { shape: "ellipse", body: { fill: "#20242a" } },
    ]);
    const characterization = buildRelationRenderSpec({ ...relation("CAP-ISO-STRUCT-009"),
      endpoints: [endpoint("EXHIBITOR_THING_OR_STATE", "object.input", 0), stateEndpoint("VALUE_STATE", "state.value", 1)] },
    { nodes: [...context.nodes, node("state.value", "state", 700, 140)] }, definitions, decorators);
    expect(characterization.cells.filter((cell) => cell.kind === "node")).toMatchObject([
      { shape: "polygon", body: { fill: "#ffffff" } }, { shape: "polygon", body: { fill: "#20242a" } },
    ]);
    expect(characterization.cells.filter((cell) => cell.kind === "edge")).toHaveLength(2);
    expect(characterization.cells.filter((cell) => cell.kind === "edge" && cell.line.captureAnchor === characterization.occurrenceId)).toHaveLength(1);
  });
});

function relation(capabilityId: string): ConsumptionRelation {
  return {
    id: "fact.example", occurrenceId: "occurrence.fact.example", capabilityId, symbolRef: "symbol.example", layoutRef: "layout.example",
    sourceId: "object.input", targetId: "process.transform", sourceOccurrenceId: "occurrence.object.input", targetOccurrenceId: "occurrence.process.transform",
  };
}

function endpoint(role: string, targetId: string, ordinal: number) {
  return { role, targetId, targetKind: "ELEMENT" as const, ordinal };
}

function stateEndpoint(role: string, targetId: string, ordinal: number) {
  return { role, targetId, targetKind: "STATE" as const, ordinal };
}

function node(id: string, kind: OpdNode["kind"], x: number, y: number): OpdNode {
  return { id, occurrenceId: `occurrence.${id}`, label: id, kind, x, y, valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" };
}
