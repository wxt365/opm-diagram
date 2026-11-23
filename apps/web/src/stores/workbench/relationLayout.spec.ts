import { computed, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type { DraftToken } from "@/shared/api/generated/draftWorkspaceContract";
import type { ConsumptionRelation, EdgeRoute, OpdNode } from "@/shared/types/modeling";
import { createWorkbenchLayout } from "./workbenchLayout";
import { createWorkbenchState } from "./workbenchState";
import { translatedRelationLayouts } from "./relationLayout";

function fixture() {
  const workbench = createWorkbenchState(); workbench.resourceState = "ready";
  workbench.nodes = ["a", "b"].map((id, index) => ({ id, occurrenceId: `occ.${id}`, kind: "object", label: id, x: index * 400, y: 80, width: 160, height: 72, occurrenceRole: "owned", valueDomain: "", visibility: "public", multiplicity: "1", architectureLayer: "产品" } as OpdNode));
  workbench.relations = [{ id: "fact", occurrenceId: "occ.fact", sourceId: "a", targetId: "b", sourceOccurrenceId: "occ.a", targetOccurrenceId: "occ.b", symbolRef: "symbol.link.consumption", layoutRef: "layout.fact" } as ConsumptionRelation];
  const readonly = ref(false), saving = ref(false), execute = vi.fn(async () => true);
  const layout = createWorkbenchLayout({ workbench, draftToken: ref({} as DraftToken), isReadonly: computed(() => readonly.value), selectedIds: ref([]), projectId: ref("project"), modelId: ref("model"), editingIdentity: computed(() => "identity"), relationCandidate: { phase: "idle" }, controlCandidate: { phase: "idle" }, structuralUpdateCandidate: { phase: "idle" }, getLoadSequence: () => 1, hasDraftSession: () => true, canEdit: () => true, execute, block: vi.fn(), saving });
  return { workbench, readonly, saving, execute, ...layout };
}
const route: EdgeRoute = { segment: "main", style: "CURVE", mode: "MANUAL", points: [{ x: 280, y: 240 }] };
function featureFixture() {
  const f = fixture();
  f.workbench.nodes.push({ ...f.workbench.nodes[0]!, id: "attribute", occurrenceId: "occ.attribute", kind: "attribute", ownerId: "a", x: 240, y: 200 });
  return f;
}
describe("relation route draft history", () => {
  it("rebuilds pending layout history against the fresh projection after semantic edits", async () => {
    const f = fixture();
    await f.moveElements([{ occurrence_id: "occ.a", layout: { x: 40, y: 80, width: 160, height: 72 } }]);
    f.clearLayoutHistory();
    f.workbench.nodes = f.workbench.nodes.map(node => ({ ...node, x: node.id === "a" ? 0 : 500, width: 200 }));
    f.overlayPendingLayouts();
    expect(f.canUndoLayout.value).toBe(true);
    expect(f.workbench.nodes[0]).toMatchObject({ x: 40, width: 200 });
    await f.undoLayout();
    expect(f.layoutDirty.value).toBe(false);
    expect(f.workbench.nodes[0]).toMatchObject({ x: 0, width: 200 });
    expect(f.workbench.nodes[1]).toMatchObject({ x: 500, width: 200 });
    await f.redoLayout();
    expect(f.workbench.nodes[0]).toMatchObject({ x: 40, width: 200 });
    expect(f.layoutDirty.value).toBe(true);
    await f.flushLayouts();
    expect(f.canUndoLayout.value).toBe(false); expect(f.canRedoLayout.value).toBe(false);
  });
  it("整理预览使用自动路径，取消不改原图，应用后可完整撤销并保存", async () => {
    const f = featureFixture();
    f.workbench.relations[0]!.edgeRoutes = [route];
    const feature = f.workbench.nodes[2]!;
    feature.edgeRoutes = [{ ...route, segment: "feature.owner" }];
    f.previewAutoLayout("down");
    expect(f.autoLayoutRelations.value[0]!.edgeRoutes).toEqual([]);
    expect(f.autoLayoutNodes.value[2]!.edgeRoutes).toEqual([]);
    f.cancelAutoLayout();
    expect(f.workbench.relations[0]!.edgeRoutes).toEqual([route]); expect(f.layoutDirty.value).toBe(false);
    f.previewAutoLayout("down"); await f.applyAutoLayout();
    expect(f.workbench.relations[0]!.edgeRoutes).toEqual([]);
    expect(f.workbench.nodes[2]!.edgeRoutes).toEqual([]);
    await f.undoLayout();
    expect(f.workbench.relations[0]!.edgeRoutes).toEqual([route]);
    expect(f.workbench.nodes[2]!.edgeRoutes).toEqual([{ ...route, segment: "feature.owner" }]);
    await f.redoLayout(); expect(await f.flushLayouts()).toBe(true);
    expect(f.execute.mock.lastCall?.[0].payload.layouts).toContainEqual(expect.objectContaining({ occurrence_id: "occ.fact", layout: expect.objectContaining({ edge_routes: [] }) }));
  });
  it("stores junction positions with undo, group translation, save retry and automatic reset without altering line bends", async () => {
    const f = featureFixture(), junction = { ...route, segment: "feature.characterization.junction" };
    const root = { ...route, segment: "feature.characterization" };
    await f.editRelationRoute("occ.a", root); await f.editRelationRoute("occ.a", junction);
    expect(f.workbench.nodes[0]!.edgeRoutes).toEqual([root, junction]);
    await f.undoLayout(); expect(f.workbench.nodes[0]!.edgeRoutes).toEqual([root]);
    await f.redoLayout(); expect(f.workbench.nodes[0]!.edgeRoutes).toEqual([root, junction]);
    await f.moveElements([{ occurrence_id: "occ.a", layout: { x: 20, y: 110, width: 160, height: 72 } }]);
    expect(f.workbench.nodes[0]!.edgeRoutes?.[1]?.points).toEqual([{ x: 300, y: 270 }]);
    await f.undoLayout();
    f.workbench.nodes = f.workbench.nodes.map(node => ({ ...node, edgeRoutes: undefined }));
    f.overlayPendingLayouts(); expect(f.workbench.nodes[0]!.edgeRoutes).toEqual([root, junction]);
    f.execute.mockResolvedValueOnce(false); expect(await f.flushLayouts()).toBe(false); expect(await f.flushLayouts()).toBe(true);
    await f.editRelationRoute("occ.a", { ...junction, mode: "AUTO", points: [] });
    expect(f.workbench.nodes[0]!.edgeRoutes).toEqual([root, { ...junction, mode: "AUTO", points: [] }]);
  });
  it("rejects junction segments on the wrong owner and malformed junction point counts", async () => {
    const f = featureFixture(), junction = { ...route, segment: "feature.characterization.junction" };
    await f.editRelationRoute("occ.attribute", junction);
    await f.editRelationRoute("occ.a", { ...junction, segment: "feature.composition.junction" });
    await f.editRelationRoute("occ.a", { ...junction, points: [] });
    await f.editRelationRoute("occ.a", { ...junction, points: [...route.points, ...route.points] });
    await f.editRelationRoute("occ.a", { ...junction, mode: "AUTO" });
    expect(f.layoutDirty.value).toBe(false);
  });
  it("stores feature branch and root routes in real occurrences, with undo, retry, projection overlay and reset", async () => {
    const f = featureFixture(), branch = { ...route, segment: "feature.owner" }, root = { ...route, segment: "feature.characterization" };
    await f.editRelationRoute("occ.attribute", branch); await f.editRelationRoute("occ.a", root);
    expect(f.workbench.nodes[0]!.edgeRoutes).toEqual([root]);
    expect(f.workbench.nodes[2]!.edgeRoutes).toEqual([branch]);
    await f.undoLayout(); expect(f.workbench.nodes[0]!.edgeRoutes).toBeUndefined();
    await f.redoLayout(); expect(f.workbench.nodes[0]!.edgeRoutes).toEqual([root]);
    f.workbench.nodes = f.workbench.nodes.map(node => ({ ...node, edgeRoutes: undefined }));
    f.overlayPendingLayouts(); expect(f.workbench.nodes[2]!.edgeRoutes).toEqual([branch]);
    f.execute.mockResolvedValueOnce(false); expect(await f.flushLayouts()).toBe(false);
    expect(await f.flushLayouts()).toBe(true);
    expect(f.execute.mock.lastCall?.[0]).toMatchObject({ payload: { layouts: expect.arrayContaining([
      expect.objectContaining({ occurrence_id: "occ.attribute", layout: expect.objectContaining({ edge_routes: [branch] }) }),
      expect.objectContaining({ occurrence_id: "occ.a", layout: expect.objectContaining({ edge_routes: [root] }) }),
    ]) } });
    const automatic = { ...branch, mode: "AUTO" as const, points: [] };
    await f.editRelationRoute("occ.attribute", automatic); expect(f.workbench.nodes[2]!.edgeRoutes).toEqual([automatic]);
  });
  it("preserves owner bends when nodes move, translates the whole group once and restores routes through undo", async () => {
    const f = featureFixture(), branch = { ...route, segment: "feature.owner" }, root = { ...route, segment: "feature.characterization" };
    await f.editRelationRoute("occ.attribute", branch); await f.editRelationRoute("occ.a", root);
    const moved = [f.workbench.nodes[0]!, f.workbench.nodes[2]!].map(node => ({ occurrence_id: node.occurrenceId,
      layout: { x: node.x + 20, y: node.y + 30, width: 160, height: 72 } }));
    await f.moveElements(moved);
    expect(f.workbench.nodes[0]!.edgeRoutes?.[0]?.points).toEqual([{ x: 300, y: 270 }]);
    expect(f.workbench.nodes[2]!.edgeRoutes?.[0]?.points).toEqual([{ x: 300, y: 270 }]);
    await f.undoLayout(); expect(f.workbench.nodes[0]!.edgeRoutes).toEqual([root]); expect(f.workbench.nodes[2]!.edgeRoutes).toEqual([branch]);
    await f.moveElements([moved[1]!]); expect(f.workbench.nodes[2]!.edgeRoutes).toEqual([branch]);
  });
  it("rejects unrelated node route segments and does not write readonly or preview feature routes", async () => {
    const f = featureFixture(), branch = { ...route, segment: "feature.owner" };
    await f.editRelationRoute("occ.a", branch); await f.editRelationRoute("occ.attribute", route); expect(f.layoutDirty.value).toBe(false);
    f.readonly.value = true; await f.editRelationRoute("occ.attribute", branch); expect(f.layoutDirty.value).toBe(false);
    f.readonly.value = false; f.previewAutoLayout("right"); await f.editRelationRoute("occ.attribute", branch); expect(f.layoutDirty.value).toBe(false);
  });
  it("translates fan bends with the complete group, retaining interiors on partial member moves", () => {
    const f = fixture(), first = f.workbench.nodes[0]!;
    const nodes = [...f.workbench.nodes, { ...first, id: "c", occurrenceId: "occ.c", y: 400 }];
    const fan = { ...f.workbench.relations[0]!, edgeRoutes: [{ ...route, segment: "root" }, { ...route, segment: "part.2" }],
      endpoints: nodes.map((node, ordinal) => ({ ordinal, role: "MEMBER", targetId: node.id, targetKind: "ELEMENT" as const })) };
    const moved = nodes.map(node => ({ ...node, x: node.x + 20, y: node.y + 30 }));
    expect(translatedRelationLayouts([fan], nodes, [moved[0]!, moved[1]!, nodes[2]!])).toEqual([]);
    expect(translatedRelationLayouts([fan], nodes, moved)[0]?.layout.edge_routes?.map(item => item.points))
      .toEqual([[{ x: 300, y: 270 }], [{ x: 300, y: 270 }]]);
  });
  it("supports undo, redo, save failure retry, and overlays pending routes on fresh projection", async () => {
    const f = fixture(); await f.editRelationRoute("occ.fact", route);
    expect(f.layoutDirty.value).toBe(true); expect(f.workbench.relations[0]!.edgeRoutes).toEqual([route]);
    await f.undoLayout(); expect(f.layoutDirty.value).toBe(false);
    await f.redoLayout(); expect(f.layoutDirty.value).toBe(true);
    f.workbench.relations = f.workbench.relations.map(relation => ({ ...relation, edgeRoutes: [] }));
    f.overlayPendingLayouts(); expect(f.workbench.relations[0]!.edgeRoutes).toEqual([route]);
    f.execute.mockResolvedValueOnce(false); expect(await f.flushLayouts()).toBe(false); expect(f.layoutDirty.value).toBe(true);
    expect(await f.flushLayouts()).toBe(true); expect(f.layoutDirty.value).toBe(false);
    expect(f.execute.mock.lastCall?.[0]).toMatchObject({ payload: { layouts: [{ occurrence_id: "occ.fact", layout: { edge_routes: [route] } }] } });
  });
  it("translates route with both nodes, includes it in undo, and preserves it with a single endpoint move", async () => {
    const f = fixture(); await f.editRelationRoute("occ.fact", route);
    await f.moveElements(f.workbench.nodes.map(node => ({ occurrence_id: node.occurrenceId, layout: { x: node.x + 24, y: node.y + 16, width: 160, height: 72 } })));
    expect(f.workbench.relations[0]!.edgeRoutes?.[0]?.points).toEqual([{ x: 304, y: 256 }]);
    await f.undoLayout(); expect(f.workbench.relations[0]!.edgeRoutes?.[0]?.points).toEqual(route.points);
    await f.moveElements([{ occurrence_id: "occ.a", layout: { x: 80, y: 80, width: 160, height: 72 } }]);
    expect(f.workbench.relations[0]!.edgeRoutes?.[0]?.points).toEqual(route.points);
  });
  it("blocks readonly, saving and preview edits and discards routes without touching semantic identities", async () => {
    const f = fixture(), before = JSON.stringify(f.workbench.relations);
    f.readonly.value = true; await f.editRelationRoute("occ.fact", route); expect(JSON.stringify(f.workbench.relations)).toBe(before);
    f.readonly.value = false; f.saving.value = true; await f.editRelationRoute("occ.fact", route); expect(f.layoutDirty.value).toBe(false);
    f.saving.value = false; f.previewAutoLayout("right"); await f.editRelationRoute("occ.fact", route); expect(f.layoutDirty.value).toBe(false);
    f.cancelAutoLayout(); await f.editRelationRoute("occ.fact", route); f.discardLayouts();
    expect(f.workbench.relations[0]!.edgeRoutes).toEqual([]); expect(f.layoutDirty.value).toBe(false);
  });
});
