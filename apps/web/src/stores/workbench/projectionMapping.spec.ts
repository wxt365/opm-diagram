import { describe, expect, it } from "vitest";
import { toContexts, toNode } from "./projectionMapping";
import type { ProjectionConstructWire } from "@/shared/api/localRuntimeApi";

describe("toContexts", () => {
  it("places the system diagram first and sorts imported siblings by their natural names", () => {
    const contexts = toContexts({
      process_tree: [{ context_id: "context.host.root", label: "01 业务总图", context_kind: "SYSTEM_DIAGRAM", has_children: true }],
      object_forest: [],
      views: [
        { context_id: "context.aaa", label: "10 其他视图", context_kind: "MODEL_VIEW", has_children: false },
        { context_id: "context.bbb", label: "05 情景推演", context_kind: "MODEL_VIEW", parent_context_id: "context.host.root", has_children: false },
        { context_id: "context.zzz", label: "02 业务展开", context_kind: "MODEL_VIEW", parent_context_id: "context.host.root", has_children: false },
      ],
    }, "context.host.root");
    expect(contexts.map(item => item.label)).toEqual(["01 业务总图", "02 业务展开", "05 情景推演", "10 其他视图"]);
    expect(contexts.map(item => item.depth)).toEqual([0, 1, 1, 0]);
  });
  it("keeps feature-owner route geometry from the occurrence projection", () => {
    const routes = [{ segment: "feature.owner", style: "CURVE", mode: "MANUAL", points: [{ x: 250, y: 180 }] }];
    const value = { target_id: "attribute", occurrence_id: "occ.attribute", construct_role: "ATTRIBUTE_NODE", owner_id: "object",
      layout: { x: 320, y: 100, width: 160, height: 44, z_order: 1, edge_routes: routes } } as ProjectionConstructWire;
    expect(toNode(value)).toMatchObject({ kind: "attribute", ownerId: "object", edgeRoutes: routes });
  });
  it("preserves the imported classification separately from the editable name", () => {
    const value = { target_id: "attribute", occurrence_id: "occ.attribute", construct_role: "ATTRIBUTE_NODE", owner_id: "object",
      domain_type_label: "文本属性\n(Text Property)", label: "事件标识",
      layout: { x: 320, y: 100, width: 160, height: 72, z_order: 1 } } as ProjectionConstructWire;
    expect(toNode(value)).toMatchObject({ label: "事件标识", kind: "attribute", domainTypeLabel: "文本属性\n(Text Property)" });
  });
  it("按持久父边排列跨 process tree 和 object forest 的多层 OPD", () => {
    const contexts = toContexts({
      process_tree: [
        { context_id: "context.grandchild", label: "子过程", context_kind: "PROCESS_REFINEMENT", has_children: false,
          parent_context_id: "context.child", refinee_element_id: "element.child.process" },
        { context_id: "context.root", label: "SD", context_kind: "SYSTEM_DIAGRAM", has_children: true },
      ],
      object_forest: [{ context_id: "context.child", label: "原料", context_kind: "OBJECT_REFINEMENT", has_children: true,
        parent_context_id: "context.root", refinee_element_id: "element.raw" }],
      views: [],
    }, "context.root");
    expect(contexts.map(({ id, depth, parentId }) => ({ id, depth, parentId }))).toEqual([
      { id: "context.root", depth: 0, parentId: undefined },
      { id: "context.child", depth: 1, parentId: "context.root" },
      { id: "context.grandchild", depth: 2, parentId: "context.child" },
    ]);
    expect(contexts[1]?.refineeId).toBe("element.raw");
  });
});
