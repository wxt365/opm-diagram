import { mount } from "@vue/test-utils";
import { nextTick } from "vue";
import { describe, expect, it, vi } from "vitest";

import type { ConsumptionRelation, OpdNode } from "@/shared/types/modeling";

const graphInstances = vi.hoisted(() => [] as Array<Record<string, ReturnType<typeof vi.fn>>>);

vi.mock("@antv/x6", () => ({
  Graph: class {
    addEdge = vi.fn();
    addNode = vi.fn();
    clearCells = vi.fn();
    dispose = vi.fn();
    on = vi.fn();
    zoomTo = vi.fn();

    constructor() {
      graphInstances.push(this as unknown as Record<string, ReturnType<typeof vi.fn>>);
    }
  },
}));

import OpdCanvas from "./OpdCanvas.vue";

describe("OpdCanvas", () => {
  it("只为语义节点和 Fact 写入 occurrence capture anchor 与 action testid", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, { props: { nodes: nodes(), relations: relations(), selectedId: "", zoom: 100 } });
    await nextTick();

    const graph = graphInstances[0];
    expect(graph).toBeDefined();
    const initialAnchors = captureAnchors(graph);
    expect(initialAnchors).toEqual([
      "occurrence.element.object", "occurrence.element.part-a", "occurrence.element.part-b", "occurrence.element.process", "occurrence.fact.effect", "occurrence.fact.fan", "occurrence.fact.simple", "occurrence.state.final",
    ]);
    expectSemanticCell(node(graph, "element.object"), "body", "occurrence.element.object");
    expectSemanticCell(edge(graph, "fact.simple"), "line", "occurrence.fact.simple");
    expectSemanticCell(edge(graph, "fact.effect.input"), "line", "occurrence.fact.effect");
    expectSemanticCell(edge(graph, "fact.fan.root"), "line", "occurrence.fact.fan");
    expectDecorativeCell(node(graph, "state.final-outline.state.final"), "body");
    expectDecorativeCell(edge(graph, "state.default.state.final"), "line");
    expectDecorativeCell(edge(graph, "fact.effect.output"), "line");
    expectDecorativeCell(edge(graph, "fact.fan.member.0"), "line");
    expectDecorativeCell(node(graph, "fact.fan.junction"), "body");

    const nodeCalls = graph.addNode.mock.calls.length;
    const edgeCalls = graph.addEdge.mock.calls.length;
    await wrapper.setProps({ zoom: 400 });
    await nextTick();

    expect(captureAnchors(graph, nodeCalls, edgeCalls)).toEqual(initialAnchors);
    wrapper.unmount();
  });

  it("候选预览只渲染 transient Cell，Finding 高亮不改变 committed anchor", async () => {
    graphInstances.length = 0;
    const wrapper = mount(OpdCanvas, {
      props: {
        nodes: nodes(), relations: relations(), selectedId: "", zoom: 100,
        relationPreview: { candidateId: "candidate.visual.candidate-layer", sourceId: "element.object", targetId: "element.process" },
        highlightedFindingTargetId: "fact.simple",
      },
    });
    await nextTick();

    const graph = graphInstances[0];
    const candidate = edge(graph, "candidate.visual.candidate-layer");
    expect(candidate.attrs.line["data-opm-candidate-cell-id"]).toBe("candidate.visual.candidate-layer");
    expect(candidate.attrs.line["data-testid"]).toBe("p03-candidate-candidate.visual.candidate-layer");
    expect(candidate.attrs.line["data-opm-capture-cell-id"]).toBeUndefined();
    expect(edge(graph, "fact.simple").attrs.line["data-opm-finding-highlight"]).toBe("true");
    expect(edge(graph, "fact.effect.input").attrs.line["data-opm-finding-highlight"]).toBe("false");
    wrapper.unmount();
  });
});

function captureAnchors(graph: Record<string, ReturnType<typeof vi.fn>>, nodeOffset = 0, edgeOffset = 0) {
  return [
    ...graph.addNode.mock.calls.slice(nodeOffset).map(([value]) => value.attrs.body["data-opm-capture-cell-id"]),
    ...graph.addEdge.mock.calls.slice(edgeOffset).map(([value]) => value.attrs.line["data-opm-capture-cell-id"]),
  ].filter((value): value is string => typeof value === "string").sort();
}

function expectSemanticCell(cell: Record<string, { [key: string]: string }>, attribute: "body" | "line", occurrenceId: string) {
  expect(cell.attrs[attribute]["data-opm-capture-cell-id"]).toBe(occurrenceId);
  expect(cell.attrs[attribute]["data-testid"]).toBe(`p03-occurrence-${occurrenceId}`);
}

function expectDecorativeCell(cell: Record<string, { [key: string]: string }>, attribute: "body" | "line") {
  expect(cell.attrs[attribute]["data-opm-capture-cell-id"]).toBeUndefined();
  expect(cell.attrs[attribute]["data-testid"]).toBeUndefined();
}

function node(graph: Record<string, ReturnType<typeof vi.fn>>, id: string) {
  return graph.addNode.mock.calls.map(([value]) => value).find((value) => value.id === id);
}

function edge(graph: Record<string, ReturnType<typeof vi.fn>>, id: string) {
  return graph.addEdge.mock.calls.map(([value]) => value).find((value) => value.id === id);
}

function nodes(): OpdNode[] {
  return [
    createNode("element.object", "object", 80, 80),
    createNode("element.process", "process", 420, 80),
    createNode("element.part-a", "object", 620, 40),
    createNode("element.part-b", "object", 620, 220),
    { ...createNode("state.final", "state", 120, 150), ownerId: "element.object", stateRoles: ["DEFAULT", "FINAL"] },
  ];
}

function createNode(id: string, kind: OpdNode["kind"], x: number, y: number): OpdNode {
  return { id, occurrenceId: `occurrence.${id}`, label: id, kind, x, y, valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "任务", occurrenceRole: "owned" };
}

function relations(): ConsumptionRelation[] {
  return [
    { id: "fact.simple", occurrenceId: "occurrence.fact.simple", sourceId: "element.object", targetId: "element.process", sourceOccurrenceId: "occurrence.element.object", targetOccurrenceId: "occurrence.element.process", symbolRef: "symbol.link.consumption", layoutRef: "layout.fact.simple" },
    {
      id: "fact.effect", occurrenceId: "occurrence.fact.effect", sourceId: "element.object", targetId: "element.process", sourceOccurrenceId: "occurrence.element.object", targetOccurrenceId: "occurrence.element.process", symbolRef: "symbol.link.effect", layoutRef: "layout.fact.effect",
      endpoints: [endpoint("AFFECTEE", "element.object", 0), endpoint("AFFECTING_PROCESS", "element.process", 1), endpoint("AFFECTED", "element.part-a", 2)],
    },
    {
      id: "fact.fan", occurrenceId: "occurrence.fact.fan", sourceId: "element.object", targetId: "element.part-a", sourceOccurrenceId: "occurrence.element.object", targetOccurrenceId: "occurrence.element.part-a", symbolRef: "symbol.link.structural.aggregation", layoutRef: "layout.fact.fan", collectionCompleteness: "INCOMPLETE",
      endpoints: [endpoint("WHOLE_THING", "element.object", 0), endpoint("PART_THING", "element.part-a", 1), endpoint("PART_THING", "element.part-b", 2)],
    },
  ];
}

function endpoint(role: string, targetId: string, ordinal: number) {
  return { role, targetId, targetKind: "ELEMENT" as const, ordinal };
}
