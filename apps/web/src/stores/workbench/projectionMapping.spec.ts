import { describe, expect, it } from "vitest";
import { toContexts } from "./projectionMapping";

describe("toContexts", () => {
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
