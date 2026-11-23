import { computed, effectScope, nextTick, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContextTree } from "./useContextTree";

const nodes = [
  { id: "root" }, { id: "a", parentId: "root" }, { id: "child", parentId: "a" },
  { id: "grandchild", parentId: "child" }, { id: "b", parentId: "root" }, { id: "other" },
];
const scopes: ReturnType<typeof effectScope>[] = [];
function setup(active = "root", key = "project/model", data = nodes) {
  const contexts = ref(data), current = ref(active), modelKey = ref(key);
  const scope = effectScope(); scopes.push(scope);
  const tree = scope.run(() => useContextTree(contexts, current, modelKey))!;
  return { ...tree, contexts, current, modelKey, ids: computed(() => tree.visibleContexts.value.map(item => item.id)) };
}
beforeEach(() => localStorage.clear());
afterEach(() => { scopes.splice(0).forEach(scope => scope.stop()); vi.restoreAllMocks(); });

describe("OPD 图列表展开收起", () => {
  it("父级隐藏全部后代，重新展开保留内层折叠，叶子不能折叠", () => {
    const tree = setup();
    expect(tree.ids.value).toEqual(nodes.map(item => item.id));
    tree.toggleContext("a"); expect(tree.ids.value).toEqual(["root", "a", "b", "other"]);
    tree.toggleContext("root"); expect(tree.ids.value).toEqual(["root", "other"]);
    tree.toggleContext("root"); expect(tree.ids.value).toEqual(["root", "a", "b", "other"]);
    tree.toggleContext("grandchild"); expect(tree.hasChildren.value.has("grandchild")).toBe(false);
    expect(tree.collapsedContexts.value.has("grandchild")).toBe(false);
    expect(tree.current.value).toBe("root");
  });
  it("刷新恢复偏好，模型切换彼此隔离，导航暂时为空时保留折叠", async () => {
    const first = setup(); first.toggleContext("a");
    const reopened = setup(); expect(reopened.collapsedContexts.value.has("a")).toBe(true);
    reopened.modelKey.value = "project/another"; await nextTick();
    expect(reopened.collapsedContexts.value.size).toBe(0);
    reopened.toggleContext("root");
    reopened.modelKey.value = "project/model"; reopened.contexts.value = []; await nextTick();
    reopened.contexts.value = nodes; await nextTick();
    expect(reopened.ids.value).toEqual(["root", "a", "b", "other"]);
  });
  it("主动切到子图展开其祖先，数据刷新保留手动折叠", async () => {
    const tree = setup(); tree.toggleContext("root"); tree.toggleContext("a");
    tree.current.value = "grandchild"; await nextTick();
    expect(tree.ids.value).toContain("grandchild");
    tree.toggleContext("a"); expect(tree.ids.value).not.toContain("grandchild");
    tree.contexts.value = nodes.map(item => ({ ...item })); await nextTick();
    expect(tree.ids.value).not.toContain("grandchild");
    tree.current.value = "child"; await nextTick();
    expect(tree.ids.value).toContain("child");
  });
  it("晚到的导航能自动展开当前图路径，预览子图参与折叠", async () => {
    const tree = setup(); tree.toggleContext("a");
    tree.current.value = "preview"; await nextTick();
    tree.contexts.value = [...nodes, { id: "preview", parentId: "a" }]; await nextTick();
    expect(tree.ids.value).toContain("preview");
    tree.toggleContext("a"); expect(tree.ids.value).not.toContain("preview");
  });
  it("损坏或禁止使用的存储不影响当前页面，缺失父级及循环不挂起", () => {
    vi.spyOn(Storage.prototype, "getItem").mockReturnValue("bad json");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("disabled"); });
    const tree = setup("root", "project/model", [...nodes, { id: "orphan", parentId: "missing" }, { id: "c1", parentId: "c2" }, { id: "c2", parentId: "c1" }]);
    tree.toggleContext("root");
    expect(tree.ids.value).toContain("orphan");
    expect(tree.ids.value).toContain("c1");
    expect(tree.ids.value).not.toContain("a");
  });
});
