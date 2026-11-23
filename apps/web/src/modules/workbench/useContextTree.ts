import { computed, shallowRef, watch, type Ref } from "vue";

interface TreeContext { id: string; parentId?: string }

/** 折叠仅是浏览器内的模型导航偏好，不写入画布草稿。 */
export function useContextTree<T extends TreeContext>(contexts: Ref<readonly T[]>, activeId: Ref<string>, modelKey: Ref<string>) {
  const collapsedContexts = shallowRef(new Set<string>());
  const byId = computed(() => new Map(contexts.value.map(context => [context.id, context])));
  const hasChildren = computed(() => new Set(contexts.value.flatMap(context =>
    context.parentId && context.parentId !== context.id && byId.value.has(context.parentId) ? [context.parentId] : [])));
  function ancestors(id: string) {
    const result: string[] = [], seen = new Set([id]);
    let parent = byId.value.get(id)?.parentId;
    while (parent && byId.value.has(parent) && !seen.has(parent)) {
      seen.add(parent); result.push(parent); parent = byId.value.get(parent)?.parentId;
    }
    return result;
  }
  const visibleContexts = computed(() => contexts.value.filter(context =>
    !ancestors(context.id).some(parent => collapsedContexts.value.has(parent))));
  const storageKey = () => `opm.context-tree.collapsed.v1:${modelKey.value}`;
  function update(ids: Set<string>) {
    collapsedContexts.value = ids;
    if (!modelKey.value) return;
    try { window.localStorage.setItem(storageKey(), JSON.stringify([...ids])); }
    catch { /* 浏览器禁用持久化时仍保留本页交互。 */ }
  }
  watch(modelKey, () => {
    let ids: unknown;
    try { ids = modelKey.value ? JSON.parse(window.localStorage.getItem(storageKey()) ?? "[]") : []; }
    catch { ids = []; }
    collapsedContexts.value = new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  }, { immediate: true, flush: "sync" });
  // 只在定位目标或其父级路径变化时展开，普通导航刷新保留手动折叠。
  watch(() => JSON.stringify([modelKey.value, activeId.value, ancestors(activeId.value)]), () => {
    const parents = ancestors(activeId.value);
    if (!parents.some(id => collapsedContexts.value.has(id))) return;
    update(new Set([...collapsedContexts.value].filter(id => !parents.includes(id))));
  }, { immediate: true });
  function toggleContext(id: string) {
    if (!hasChildren.value.has(id)) return;
    const next = new Set(collapsedContexts.value);
    if (next.has(id)) next.delete(id); else next.add(id);
    update(next);
  }
  return { visibleContexts, collapsedContexts, hasChildren, toggleContext };
}
