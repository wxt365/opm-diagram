import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DraftWorkbenchSession } from "@/shared/api/draftWorkbenchSession";
import { useWorkbenchRuntimeStore } from "@/stores/workbenchRuntime";

import WorkbenchView from "./WorkbenchView.vue";
import { LocalRuntimeApiError, localRuntimeApi } from "@/shared/api/localRuntimeApi";
import { assistantRequest, watchAssistant } from "@/shared/api/assistantApi";

vi.mock("@/shared/api/assistantApi", () => ({ assistantRequest: vi.fn(async () => []), watchAssistant: vi.fn() }));

vi.mock("@/shared/api/localRuntimeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/localRuntimeApi")>();
  return {
    ...actual,
    localRuntimeApi: {
      draftQuery: vi.fn(),
      workspaceSession: vi.fn(),
      getProject: vi.fn(),
      navigation: vi.fn(),
      projection: vi.fn(),
      commandCapabilities: vi.fn(),
      relationCatalog: vi.fn(),
      textProjection: vi.fn(),
      findings: vi.fn(),
      operationRecords: vi.fn(),
      releaseVisualCommonFaultCommand: vi.fn(),
      revisions: vi.fn(),
      executeP0Command: vi.fn(),
      executeReleaseVisualCommonFaultCommand: vi.fn(),
      validate: vi.fn(),
    },
  };
});

const api = localRuntimeApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const expectedRelationToolLabels = {
  "CAP-ISO-PROC-001": "生成/消耗关系 / Result / Consumption",
  "CAP-ISO-PROC-002": "生成关系 / Result Link",
  "CAP-ISO-PROC-003": "影响关系 / Effect Link",
  "CAP-ISO-PROC-004": "主体关系 / Agent Link",
  "CAP-ISO-PROC-005": "手段关系 / Instrument Link",
  "CAP-ISO-PROC-006": "状态指定消耗关系 / State-specified Consumption",
  "CAP-ISO-PROC-007": "状态指定生成关系 / State-specified Result",
  "CAP-ISO-PROC-008": "输入-输出状态指定影响关系 / Input-output-specified Effect",
  "CAP-ISO-PROC-009": "输入状态指定影响关系 / Input-specified Effect",
  "CAP-ISO-PROC-010": "输出状态指定影响关系 / Output-specified Effect",
  "CAP-ISO-PROC-011": "状态指定主体关系 / State-specified Agent",
  "CAP-ISO-PROC-012": "状态指定手段关系 / State-specified Instrument",
  "CAP-ISO-PROC-013": "调用关系 / Invocation Link",
  "CAP-ISO-PROC-014": "自调用关系 / Self-invocation Link",
  "CAP-ISO-PROC-015": "超时异常关系 / Overtime Exception Link",
  "CAP-ISO-PROC-016": "欠时异常关系 / Undertime Exception Link",
  "CAP-ISO-CTRL-001": "转换事件 / Transforming Event",
  "CAP-ISO-CTRL-002": "使能事件 / Enabling Event",
  "CAP-ISO-CTRL-003": "状态指定转换事件 / State-specified Transforming Event",
  "CAP-ISO-CTRL-004": "状态指定使能事件 / State-specified Enabling Event",
  "CAP-ISO-CTRL-005": "转换条件 / Transforming Condition",
  "CAP-ISO-CTRL-006": "使能条件 / Enabling Condition",
  "CAP-ISO-CTRL-007": "状态指定转换条件 / State-specified Transforming Condition",
  "CAP-ISO-CTRL-008": "状态指定使能条件 / State-specified Enabling Condition",
  "CAP-ISO-STRUCT-001": "单向标记结构关系 / Unidirectional Tagged Structural",
  "CAP-ISO-STRUCT-002": "单向无标记结构关系 / Unidirectional Null-tagged Structural",
  "CAP-ISO-STRUCT-003": "双向标记结构关系 / Bidirectional Tagged Structural",
  "CAP-ISO-STRUCT-004": "互惠标记结构关系 / Reciprocal Tagged Structural",
  "CAP-ISO-STRUCT-005": "聚合-参与关系 / Aggregation-participation",
  "CAP-ISO-STRUCT-006": "展示-特征关系 / Exhibition-characterization",
  "CAP-ISO-STRUCT-007": "泛化-特化关系 / Generalization-specialization",
  "CAP-ISO-STRUCT-008": "分类-实例化关系 / Classification-instantiation",
  "CAP-ISO-STRUCT-009": "状态指定特征关系 / State-specified Characterization",
  "CAP-ISO-STRUCT-010": "状态指定标记结构关系 / State-specified Tagged Structural",
} as const;

function configureApi() {
  api.draftQuery.mockRejectedValue(new LocalRuntimeApiError("DRAFT_MODE_REQUIRED", "旧模式"));
  api.getProject.mockResolvedValue({ project_id: "project.1", name: "仓储项目", archive_state: "ACTIVE", model_count: 1, updated_at: "2026-07-28T00:00:00Z" });
  api.workspaceSession.mockImplementation((_project, _model, revision?: string) => Promise.resolve({ meta: { read_revision: revision && revision !== "head" ? revision : "revision.1" }, data: { model: { project_id: "project.1", model_id: "model.1", name: "生产模型", profile_id: "profile.iso", profile_version: "0.1.0", access_mode: "EDITABLE_DRAFT", head_revision: revision && revision !== "head" ? revision : "revision.1" }, root_context_id: "context.root", current_context_id: "context.root" } }));
  api.navigation.mockResolvedValue({ data: { process_tree: [{ context_id: "context.root", label: "SD", context_kind: "SYSTEM_DIAGRAM", has_children: false }], object_forest: [], views: [] } });
  api.projection.mockImplementation((_project, _model, context: string, revision: string) => Promise.resolve({ meta: { read_revision: revision }, data: { context_id: context, constructs: [
    { occurrence_id: "occ.object", target_id: "element.object", construct_role: "OBJECT_NODE", label: "Material", layout: { x: 80, y: 80, width: 160, height: 72, z_order: 1 } },
    { occurrence_id: "occ.object.product", target_id: "element.object.product", construct_role: "OBJECT_NODE", label: "Product", layout: { x: 80, y: 240, width: 160, height: 72, z_order: 2 } },
    { occurrence_id: "occ.process", target_id: "element.process", construct_role: "PROCESS_NODE", label: "Transform", layout: { x: 420, y: 80, width: 168, height: 84, z_order: 2 } },
    { occurrence_id: "occ.process.handler", target_id: "element.process.handler", construct_role: "PROCESS_NODE", label: "Handle exception", layout: { x: 680, y: 80, width: 168, height: 84, z_order: 3 } },
    { occurrence_id: "occ.attribute", target_id: "feature.attribute", construct_role: "ATTRIBUTE_NODE", label: "Temperature", owner_id: "element.object", layout: { x: 260, y: 160, width: 160, height: 72, z_order: 4 } },
    { occurrence_id: "occ.operation", target_id: "feature.operation", construct_role: "OPERATION_NODE", label: "Calibrate", owner_id: "element.process", layout: { x: 600, y: 160, width: 168, height: 84, z_order: 5 } },
    { occurrence_id: "occ.state", target_id: "state.material.ready", construct_role: "STATE_NODE", label: "Ready", owner_id: "element.object", state_roles: ["INITIAL"], explicitness: "EXPLICIT", fold_state: "UNFOLDED", layout: { x: 116, y: 118, width: 88, height: 28, z_order: 3 } },
    { occurrence_id: "occ.fact", target_id: "fact.consumption", construct_role: "CONSUMPTION_LINK", layout: { x: 250, y: 116, width: 160, height: 2, z_order: 3 }, source_id: "element.object", process_id: "element.process", source_occurrence_id: "occ.object", target_occurrence_id: "occ.process", symbol_ref: "symbol.link.consumption", layout_ref: "layout.fact", capability_id: "CAP-ISO-PROC-001", endpoints: [endpoint("CONSUMED_OBJECT", "ELEMENT", "element.object", 0), endpoint("CONSUMING_PROCESS", "ELEMENT", "element.process", 1)] },
    { occurrence_id: "occ.fact.structural", target_id: "fact.structural", construct_role: "STRUCTURAL_LINK", layout: { x: 250, y: 272, width: 160, height: 2, z_order: 3 }, symbol_ref: "symbol.link.structural.tagged.state", layout_ref: "layout.fact.structural", capability_id: "CAP-ISO-STRUCT-010", direction: "DIRECTED", labels: [{ slot_id: "forward_tag", text: "owns" }], collection_completeness: "NOT_APPLICABLE", endpoints: [endpoint("STATE_TAGGED_SOURCE", "STATE", "state.material.ready", 0), endpoint("STATE_TAGGED_TARGET", "ELEMENT", "element.object.product", 1)] },
  ], suppressed_states: [] } }));
  api.commandCapabilities.mockResolvedValue({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT", "UPDATE_LAYOUT"], forbidden: [], capability_query_id: "query.1", options: [] } });
  api.relationCatalog.mockResolvedValue({ data: { items: relationCatalog() } });
  api.textProjection.mockResolvedValue({ data: { sentences: [{ sentence_id: "sentence.1", text: "Transform consumes Material.", ordinal: 0 }], traces: [{ sentence_id: "sentence.1", fact_ids: ["fact.consumption"], occurrence_ids: ["occ.object", "occ.process"] }] } });
  api.findings.mockResolvedValue({ data: [] });
  api.operationRecords.mockResolvedValue({ data: [] });
  api.releaseVisualCommonFaultCommand.mockRejectedValue(new LocalRuntimeApiError("NOT_FOUND", "受控命令不存在"));
  api.revisions.mockResolvedValue([{ revision_id: "revision.1", sequence: 1, kind: "DRAFT", created_at: "2026-07-28T00:00:00Z", immutable: true, blocking_count: 0 }]);
  api.executeP0Command.mockResolvedValue({ meta: { committed_revision: "revision.2", status: "COMMITTED", command_id: "command.1", autosave_state: "saved" }, data: { affected_ids: [], text_trace_ids: [], validation_summary: { blocking: 0, warning: 0, suggestion: 0, coverage_state: "INCOMPLETE" } } });
  api.validate.mockResolvedValue({ data: { task_id: "task.1", state: "COMPLETED", progress: 100 } });
}

async function mountWorkbench(query = "") {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/projects/:projectId/models/:modelId/workbench", component: WorkbenchView }] });
  await router.push(`/projects/project.1/models/model.1/workbench${query}`);
  await router.isReady();
  const wrapper = mount(WorkbenchView, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), router],
      stubs: {
        OpdCanvas: {
          methods: { async finishNameEdit() { return true; } },
          props: ["beginNameEdit", "submitNameEdit", "interactionTool"],
          emits: ["select", "move", "relationIntent", "constructActionsMenuRequested", "relationLabelEditRequested"],
          template: `<div :data-interaction-tool="interactionTool">
            <button data-testid="p03-canvas-select-object" type="button" @click="$emit('select', 'element.object')" />
            <button data-testid="p03-canvas-select-product" type="button" @click="$emit('select', 'element.object.product')" />
            <button data-testid="p03-canvas-select-process" type="button" @click="$emit('select', 'element.process')" />
            <button data-testid="p03-canvas-select-attribute" type="button" @click="$emit('select', 'feature.attribute')" />
            <button data-testid="p03-canvas-select-operation" type="button" @click="$emit('select', 'feature.operation')" />
            <button data-testid="p03-canvas-select-handler-process" type="button" @click="$emit('select', 'element.process.handler')" />
            <button data-testid="p03-canvas-select-state" type="button" @click="$emit('select', 'state.material.ready')" />
            <button data-testid="p03-canvas-select-consumption" type="button" @click="$emit('select', 'fact.consumption')" />
            <button data-testid="p03-canvas-select-structural" type="button" @click="$emit('select', 'fact.structural')" />
            <button data-testid="p03-canvas-edit-relation-label" type="button" @click="$emit('relationLabelEditRequested', 'fact.structural')" />
            <button data-testid="p03-canvas-delete-state" type="button" @click="$emit('constructActionsMenuRequested', 'occ.state')" />
            <button data-testid="p03-canvas-keyboard-delete-state" type="button" @click="$emit('constructActionsMenuRequested', 'occ.state', { clientX: 0, clientY: 0 }, 'direct')" />
            <button data-testid="p03-canvas-delete-fact" type="button" @click="$emit('constructActionsMenuRequested', 'occ.fact')" />
            <button data-testid="p03-canvas-move-object" type="button" @click="$emit('move', 'occ.object', 240, 180)" />
            <button data-testid="p03-canvas-move-attribute" type="button" @click="$emit('move', 'occ.attribute', 300, 220)" />
            <button data-testid="p03-canvas-begin-name-edit" type="button" @click="beginNameEdit('element.object')" />
            <button data-testid="p03-canvas-submit-name-edit" type="button" @click="submitNameEdit('element.object', 'Renamed Material')" />
            <button data-testid="p03-canvas-submit-same-name" type="button" @click="submitNameEdit('element.object', 'Material')" />
            <button data-testid="p03-canvas-drag-object-process" type="button" @click="$emit('relationIntent', { type: 'relation-drag-start', source_occurrence_id: 'occ.object', pointer: { x: 80, y: 80 } }); $emit('relationIntent', { type: 'relation-endpoint-selected', source_occurrence_id: 'occ.object', target_occurrence_id: 'occ.process', pointer: { x: 420, y: 80 } })" />
            <button data-testid="p03-canvas-drag-process-object" type="button" @click="$emit('relationIntent', { type: 'relation-drag-start', source_occurrence_id: 'occ.process', pointer: { x: 420, y: 80 } }); $emit('relationIntent', { type: 'relation-endpoint-selected', source_occurrence_id: 'occ.process', target_occurrence_id: 'occ.object', pointer: { x: 80, y: 80 } })" />
            <button data-testid="p03-canvas-drag-process-handler" type="button" @click="$emit('relationIntent', { type: 'relation-drag-start', source_occurrence_id: 'occ.process', pointer: { x: 420, y: 80 } }); $emit('relationIntent', { type: 'relation-endpoint-selected', source_occurrence_id: 'occ.process', target_occurrence_id: 'occ.process.handler', pointer: { x: 680, y: 80 } })" />
            <button data-testid="p03-canvas-drag-object-product" type="button" @click="$emit('relationIntent', { type: 'relation-drag-start', source_occurrence_id: 'occ.object', pointer: { x: 80, y: 80 } }); $emit('relationIntent', { type: 'relation-endpoint-selected', source_occurrence_id: 'occ.object', target_occurrence_id: 'occ.object.product', pointer: { x: 80, y: 240 } })" />
            <button data-testid="p03-canvas-drag-process-product" type="button" @click="$emit('relationIntent', { type: 'relation-drag-start', source_occurrence_id: 'occ.process', pointer: { x: 420, y: 80 } }); $emit('relationIntent', { type: 'relation-endpoint-selected', source_occurrence_id: 'occ.process', target_occurrence_id: 'occ.object.product', pointer: { x: 80, y: 240 } })" />
          </div>`,
        },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

async function openRightPanel(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-testid="p03-right-panel-open"]').trigger("click");
  await flushPromises();
}

async function activateRelationCatalogItem(wrapper: ReturnType<typeof mount>, family: "PROCEDURAL" | "CONTROL" | "STRUCTURAL", capabilityId: string) {
  if (capabilityId === "CAP-ISO-PROC-002") capabilityId = "CAP-ISO-PROC-001";
  expect(wrapper.get(`[data-testid="p03-relation-toolbar-${family}"]`).exists()).toBe(true);
  const quickItem = wrapper.find(`[data-testid="p03-relation-quick-option-${capabilityId}"]`);
  if (quickItem.exists()) await quickItem.trigger("click");
  else {
    await wrapper.get(`[data-testid="p03-relation-menu-toggle-${family}"]`).trigger("click");
    await wrapper.get(`[data-testid="p03-relation-menu-option-${capabilityId}"]`).trigger("click");
  }
  await flushPromises();
}

describe("WorkbenchView", () => {
  afterEach(() => { vi.restoreAllMocks(); });
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    configureApi();
  });

  function draftFixture() {
    let seq = 0;
    const token = () => ({ draft_id: "draft.ui", edit_seq: seq, binding_digest: "a".repeat(64) });
    const state = () => ({ durable_token: token(), checkpoint_token: null, last_manual_revision: null,
      dirty_since: seq ? "2026-09-14T00:00:00.000Z" : null, deadline: seq ? "2026-09-14T00:00:10.000Z" : null, in_flight: "NONE" as const, pending_manual_target: null, last_error: null });
    const opened = () => ({ request_id: "request.ui", project_id: "project.1", model_id: "model.1", root_context_id: "context.root", context_id: "context.root", mode: "JOURNALED_DRAFT_V2" as const, draft_token: token(), save_state: state() });
    const open = vi.spyOn(DraftWorkbenchSession.prototype, "open").mockImplementation(async () => opened());
    vi.spyOn(DraftWorkbenchSession.prototype, "recover").mockResolvedValue();
    vi.spyOn(DraftWorkbenchSession.prototype, "pending").mockResolvedValue([]);
    const read = vi.spyOn(DraftWorkbenchSession.prototype, "read").mockImplementation(async () => ({ opened: opened(), project: { name: "项目" }, model: { name: "草稿模型", profile_id: "profile.1", profile_version: "0.2.0", head_revision: "revision.1" }, history: [{ revision_id: "revision.1", sequence: 1, kind: "DRAFT", created_at: "2026-09-14T00:00:00Z" }], navigation: { process_tree: [], object_forest: [], views: [] }, constructs: [{ occurrence_id: "occ.object", target_id: "element.object", target_kind: "ELEMENT", construct_role: "OBJECT_NODE", label: `Object ${seq}`, layout: { x: seq, y: 0, width: 100, height: 60, z_order: 0 }, capability_id: "CAP-OBJECT-001" }], suppressed: [], text: { sentences: [{ sentence_id: `sentence.${seq}`, text: `文本 ${seq}`, ordinal: 0 }], traces: [] }, findings: { items: [], validation_summary: { blocking: 0, coverage_state: "INCOMPLETE" } }, catalog: [] }) as never);
    const edit = vi.spyOn(DraftWorkbenchSession.prototype, "edit").mockImplementation(async () => { seq++; return { result_token: token() } as never; });
    const save = vi.spyOn(DraftWorkbenchSession.prototype, "save").mockImplementation(async captured => ({ save_id: "save.ui", status: "SAVED", captured_token: captured, head_token: token(), revision_id: "revision.saved", checkpoint_id: "checkpoint.ui" }));
    const pin = vi.spyOn(DraftWorkbenchSession.prototype, "pin").mockImplementation(async captured => ({ pin_id: "pin.ui", captured_token: captured, revision_id: "revision.pinned" }));
    vi.spyOn(DraftWorkbenchSession.prototype, "catalog").mockResolvedValue({ data: { items: [] } } as never);
    vi.spyOn(DraftWorkbenchSession.prototype, "capabilities").mockResolvedValue({ data: { options: [] } } as never);
    return { token, open, read, edit, save, pin };
  }

  it("OPD右键删除预览可取消，确认删除当前图后回读父图并更新导航", async () => {
    const fixture = draftFixture(), originalOpen = fixture.open.getMockImplementation()!, originalRead = fixture.read.getMockImplementation()!, originalEdit = fixture.edit.getMockImplementation()!;
    let deleted = false;
    fixture.open.mockImplementation(async context => ({ ...await originalOpen(context), context_id: context ?? "context.root" }));
    fixture.read.mockImplementation(async opened => {
      const snapshot = await originalRead(opened);
      snapshot.opened = opened;
      snapshot.navigation = { current_path: ["context.root", ...(opened.context_id === "context.child" ? ["context.child"] : [])],
        process_tree: [{ context_id: "context.root", label: "SD", context_kind: "SYSTEM_DIAGRAM", has_children: !deleted }],
        object_forest: deleted ? [] : [{ context_id: "context.child", label: "原料细化", context_kind: "OBJECT_REFINEMENT", has_children: false, parent_context_id: "context.root", refinee_element_id: "element.object" }], views: [] } as never;
      return snapshot;
    });
    fixture.edit.mockImplementation(async (token, context, command) => {
      const result = await originalEdit(token, context, command);
      if (command.commandType === "DELETE_CONTEXT") deleted = true;
      return result;
    });
    const capabilities = vi.spyOn(DraftWorkbenchSession.prototype, "capabilities").mockImplementation(async (token, _context, selection, intent) => ({ data: { options: intent === "DELETE_CONTEXT" ? [{
      command_type: "DELETE_CONTEXT", enabled: true, expires_with_token: token, impact_token: "impact.child",
      context_impact: { input_token: token, context_id: selection, parent_context_id: "context.root", context_ids: ["context.child"], counts: { contexts: 1, elements: 1, features: 0, states: 0, facts: 0 }, blockers: [] },
    }] : [] } }) as never);
    const { wrapper, router } = await mountWorkbench(); const store = useWorkbenchRuntimeStore();
    await wrapper.get('[data-testid="p03-context-context.root"]').trigger("contextmenu", { clientX: 80, clientY: 90 });
    expect((wrapper.get('[data-testid="opd-delete-action"]').element as HTMLButtonElement).disabled).toBe(true);
    await wrapper.get('[data-testid="p03-context-context.child"]').trigger("contextmenu", { clientX: 80, clientY: 110 });
    await wrapper.get('[data-testid="opd-delete-action"]').trigger("click"); await flushPromises();
    expect(wrapper.get('[data-testid="opd-delete-dialog"]').text()).toContain("原料细化");
    expect(wrapper.get('[data-testid="opd-delete-counts"]').text()).toContain("1 张图");
    await wrapper.get('[data-testid="opd-delete-cancel"]').trigger("click"); expect(fixture.edit).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="p03-context-context.child"]').trigger("click"); await flushPromises();
    expect(store.workbench.activeContextId).toBe("context.child");
    await store.requestContextDelete("context.child"); await flushPromises();
    await wrapper.get('[data-testid="opd-delete-confirm"]').trigger("click"); await flushPromises();
    expect(fixture.edit).toHaveBeenLastCalledWith(expect.anything(), "context.child", { commandType: "DELETE_CONTEXT", payload: { context_id: "context.child", impact_token: "impact.child" } });
    expect(fixture.open).toHaveBeenCalledWith("context.root");
    expect(store.workbench.activeContextId).toBe("context.root"); expect(router.currentRoute.value.query.context).toBe("context.root");
    expect(wrapper.find('[data-testid="p03-context-context.child"]').exists()).toBe(false);
    expect(store.workbench.nodes[0]?.id).toBe("element.object");
    expect(wrapper.find('[data-testid="opd-delete-dialog"]').exists()).toBe(false);
    expect(capabilities).toHaveBeenCalledWith(expect.anything(), "context.child", "context.child", "DELETE_CONTEXT");
    wrapper.unmount();
  });

  it("子图删除的引用阻断、只读、提交失败与取消后的迟到预览不会误删", async () => {
    const fixture = draftFixture(); const { wrapper } = await mountWorkbench(); const store = useWorkbenchRuntimeStore();
    store.contexts.push({ id: "context.child", label: "子图", parentId: "context.root", depth: 1 } as never);
    const option = { command_type: "DELETE_CONTEXT", enabled: false, expires_with_token: fixture.token(), impact_token: "impact.child", context_impact: {
      input_token: fixture.token(), context_id: "context.child", parent_context_id: "context.root", context_ids: ["context.child"],
      counts: { contexts: 1, elements: 1, features: 0, states: 0, facts: 0 }, blockers: [{ kind: "OCCURRENCE", id: "occ.external", context_id: "context.root" }],
    } };
    const capabilities = vi.spyOn(DraftWorkbenchSession.prototype, "capabilities").mockResolvedValue({ data: { options: [option] } } as never);
    await store.requestContextDelete("context.child"); await flushPromises();
    expect(wrapper.get('[data-testid="opd-delete-blockers"]').text()).toContain("occ.external");
    expect((wrapper.get('[data-testid="opd-delete-confirm"]').element as HTMLButtonElement).disabled).toBe(true);
    expect(await store.confirmContextDelete()).toBeNull(); expect(fixture.edit).not.toHaveBeenCalled(); store.cancelContextDelete();
    store.workbench.accessMode = "readonly"; await store.requestContextDelete("context.child"); expect(store.contextDelete.open).toBe(false);
    store.workbench.accessMode = "editable";
    option.enabled = true; option.context_impact.blockers = [];
    fixture.edit.mockRejectedValueOnce(new LocalRuntimeApiError("DRAFT_EDIT_REJECTED", "删除被拒绝"));
    await store.requestContextDelete("context.child"); expect(await store.confirmContextDelete()).toBeNull();
    expect(store.contextDelete.open).toBe(true); expect(store.contextDelete.error).toContain("删除被拒绝"); store.cancelContextDelete();
    let resolve!: (value: never) => void;
    capabilities.mockImplementationOnce(() => new Promise(done => { resolve = done; }));
    const pending = store.requestContextDelete("context.child"); store.cancelContextDelete();
    resolve({ data: { options: [option] } } as never); await pending;
    expect(store.contextDelete.open).toBe(false); expect(store.contextDelete.option).toBeNull();
    await store.requestContextDelete("context.child");
    store.draftToken = { ...fixture.token(), edit_seq: 2 }; await flushPromises();
    expect(store.contextDelete.option).toBeNull(); expect(store.contextDelete.error).toContain("草稿已变化");
    wrapper.unmount();
  });

  it("布局历史恢复完整几何，新移动清除重做，失败和重载清除历史", async () => {
    const fixture = draftFixture();
    const readOriginal = fixture.read.getMockImplementation()!;
    const editOriginal = fixture.edit.getMockImplementation()!;
    let layout = { x: 0, y: 0, width: 100, height: 60, z_order: 0 };
    fixture.read.mockImplementation(async opened => {
      const snapshot = await readOriginal(opened);
      snapshot.constructs[0]!.layout = { ...layout };
      return snapshot;
    });
    fixture.edit.mockImplementation(async (token, context, command) => {
      const result = await editOriginal(token, context, command);
      if (command.commandType === "UPDATE_LAYOUT_BATCH") layout = { ...command.payload.layouts[0]!.layout, z_order: 0 };
      return result;
    });
    const { wrapper } = await mountWorkbench();
    const store = useWorkbenchRuntimeStore();
    const move = () => store.moveElements([{ occurrence_id: "occ.object", layout: { x: 32, y: 16, width: 160, height: 72 } }]);
    await move(); expect(store.canUndoLayout).toBe(true);
    await store.undoLayout(); expect(layout).toEqual({ x: 0, y: 0, width: 100, height: 60, z_order: 0 });
    expect(store.canRedoLayout).toBe(true);
    const input = document.createElement("input"); document.body.append(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }));
    expect(fixture.edit).toHaveBeenCalledTimes(2); input.remove();
    await store.redoLayout(); expect(layout.x).toBe(32);
    await store.undoLayout(); await move(); expect(store.canRedoLayout).toBe(false);
    fixture.edit.mockRejectedValueOnce(new LocalRuntimeApiError("DRAFT_EDIT_REJECTED", "拒绝"));
    await move(); expect(store.canUndoLayout).toBe(false); expect(store.workbench.nodes[0]!.x).toBe(32);
    await move(); expect(store.canUndoLayout).toBe(true);
    await store.load("project.1", "model.1", "context.root"); expect(store.canUndoLayout).toBe(false);
    wrapper.unmount();
  });

  function autoLayoutFixture() {
    const fixture = draftFixture(), readOriginal = fixture.read.getMockImplementation()!, editOriginal = fixture.edit.getMockImplementation()!;
    const layouts = [
      { x: 400, y: 300, width: 160, height: 72, z_order: 0 },
      { x: 600, y: 400, width: 160, height: 100, z_order: 0 },
    ];
    fixture.read.mockImplementation(async opened => {
      const snapshot = await readOriginal(opened), original = snapshot.constructs[0]!;
      snapshot.constructs = layouts.map((layout, index) => ({ ...original, occurrence_id: `occ.${index}`,
        target_id: `element.${index}`, label: `布局对象 ${index}`, layout: { ...layout } }));
      return snapshot;
    });
    fixture.edit.mockImplementation(async (token, context, command) => {
      const result = await editOriginal(token, context, command);
      if (command.commandType === "UPDATE_LAYOUT_BATCH") for (const item of command.payload.layouts)
        layouts[Number(item.occurrence_id.split(".")[1])] = { ...item.layout, z_order: 0 };
      return result;
    });
    return { ...fixture, layouts };
  }

  it("自动布局预览零提交且取消还原；确认一次批量请求、撤销重做和无变化", async () => {
    const fixture = autoLayoutFixture(), { wrapper } = await mountWorkbench(), store = useWorkbenchRuntimeStore();
    const original = structuredClone(fixture.layouts);
    await wrapper.get('[data-testid="opd-layout-menu-toggle"]').trigger("click"); await flushPromises();
    (document.querySelector('[data-testid="opd-layout-auto"]') as HTMLButtonElement).click(); await flushPromises();
    expect(wrapper.get('[data-testid="opd-auto-preview"]').text()).toContain("尚未应用");
    expect(store.workbench.nodes[0]!.x).toBe(400); expect(store.autoLayoutNodes[0]!.x).toBe(80);
    expect(fixture.edit).not.toHaveBeenCalled(); expect(store.canUndoLayout).toBe(false);
    await wrapper.get('[data-testid="opd-auto-direction"]').setValue("down"); await flushPromises();
    expect(store.autoLayoutNodes[1]!.x).toBeGreaterThan(80); expect(store.autoLayoutNodes[1]!.y).toBe(80);
    await wrapper.get('[data-testid="opd-auto-cancel"]').trigger("click"); await flushPromises();
    expect(store.autoLayoutPreview).toBeNull(); expect(fixture.layouts).toEqual(original);
    store.previewAutoLayout(); await store.applyAutoLayout();
    expect(fixture.edit).toHaveBeenCalledTimes(1);
    expect(fixture.edit).toHaveBeenLastCalledWith(expect.anything(), "context.root", expect.objectContaining({ commandType: "UPDATE_LAYOUT_BATCH" }));
    const applied = structuredClone(fixture.layouts); expect(store.autoLayoutPreview).toBeNull(); expect(store.canUndoLayout).toBe(true);
    await store.undoLayout(); expect(fixture.layouts).toEqual(original);
    await store.redoLayout(); expect(fixture.layouts).toEqual(applied);
    store.previewAutoLayout(); expect(store.autoLayoutPreview).toBeNull(); expect(store.workbench.commandFeedback).toContain("已符合该自动布局");
    expect(fixture.edit).toHaveBeenCalledTimes(3); wrapper.unmount();
  });

  it("草稿或几何变化取消旧预览，重载、关系编辑、只读和提交中不应用", async () => {
    const fixture = autoLayoutFixture(), { wrapper } = await mountWorkbench(), store = useWorkbenchRuntimeStore();
    store.previewAutoLayout(); store.draftToken = { ...store.draftToken!, edit_seq: 1 }; await flushPromises();
    expect(store.autoLayoutPreview).toBeNull(); await store.applyAutoLayout(); expect(fixture.edit).not.toHaveBeenCalled();
    store.previewAutoLayout(); store.workbench.nodes[0]!.x++; await flushPromises(); expect(store.autoLayoutPreview).toBeNull();
    for (const phase of ["relation", "readonly", "submitting"] as const) {
      if (phase === "relation") store.relationCandidate.phase = "relation-armed";
      else if (phase === "readonly") store.workbench.accessMode = "readonly";
      else store.workbench.commandState = "submitting";
      store.previewAutoLayout(); expect(store.canAutoLayout).toBe(false); expect(store.autoLayoutPreview).toBeNull();
      store.relationCandidate.phase = "idle"; store.workbench.accessMode = "editable"; store.workbench.commandState = "idle";
    }
    store.previewAutoLayout(); await store.load("project.1", "model.1", "context.root"); expect(store.autoLayoutPreview).toBeNull();
    expect(fixture.edit).not.toHaveBeenCalled(); wrapper.unmount();
  });

  it("自动布局应用防重复提交，失败清预览并恢复确认几何", async () => {
    const fixture = autoLayoutFixture(), { wrapper } = await mountWorkbench(), store = useWorkbenchRuntimeStore();
    const original = structuredClone(fixture.layouts); let reject!: (reason: Error) => void;
    fixture.edit.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
    store.previewAutoLayout(); const applying = store.applyAutoLayout();
    await store.applyAutoLayout(); expect(fixture.edit).toHaveBeenCalledTimes(1); expect(store.applyingAutoLayout).toBe(true);
    expect(store.autoLayoutPreview).not.toBeNull();
    reject(new LocalRuntimeApiError("DRAFT_EDIT_REJECTED", "自动布局应用失败")); await applying;
    expect(store.autoLayoutPreview).toBeNull(); expect(store.applyingAutoLayout).toBe(false);
    expect(fixture.layouts).toEqual(original); expect(store.autoLayoutNodes[0]!.x).toBe(400);
    expect(store.canUndoLayout).toBe(false); expect(store.workbench.commandFeedback).toContain("自动布局应用失败");
    wrapper.unmount();
  });

  it("排列菜单按末选基准批量提交，复用历史，无变化和禁用状态零请求", async () => {
    const fixture = draftFixture();
    const readOriginal = fixture.read.getMockImplementation()!;
    const editOriginal = fixture.edit.getMockImplementation()!;
    const layouts = [
      { x: 0, y: 0, width: 100, height: 60, z_order: 0 },
      { x: 200, y: 150, width: 160, height: 72, z_order: 0 },
      { x: 600, y: 300, width: 120, height: 80, z_order: 0 },
    ];
    fixture.read.mockImplementation(async opened => {
      const snapshot = await readOriginal(opened), original = snapshot.constructs[0]!;
      snapshot.constructs = layouts.map((layout, index) => ({ ...original, occurrence_id: `occ.${index}`,
        target_id: `element.${index}`, label: `对象 ${index}`, layout: { ...layout } }));
      return snapshot;
    });
    fixture.edit.mockImplementation(async (token, context, command) => {
      const result = await editOriginal(token, context, command);
      if (command.commandType === "UPDATE_LAYOUT_BATCH") for (const item of command.payload.layouts)
        layouts[Number(item.occurrence_id.split(".")[1])] = { ...item.layout, z_order: 0 };
      return result;
    });
    const { wrapper } = await mountWorkbench(); const store = useWorkbenchRuntimeStore();
    store.selectNodes(["element.0"]); await flushPromises();
    expect(store.layoutArrangement.canAlign).toBe(false);
    store.selectNodes(["element.0", "element.1", "element.2"]); await flushPromises();
    expect(store.layoutArrangement).toMatchObject({ canAlign: true, canDistribute: true, referenceLabel: "对象 2" });
    await wrapper.get('[data-testid="opd-layout-menu-toggle"]').trigger("click"); await flushPromises();
    (document.querySelector('[data-testid="opd-layout-right"]') as HTMLButtonElement).click(); await flushPromises();
    expect(fixture.edit).toHaveBeenCalledTimes(1);
    expect(fixture.edit).toHaveBeenLastCalledWith(expect.anything(), "context.root", expect.objectContaining({
      commandType: "UPDATE_LAYOUT_BATCH", payload: { layouts: [
        { occurrence_id: "occ.0", layout: { x: 620, y: 0, width: 100, height: 60 } },
        { occurrence_id: "occ.1", layout: { x: 560, y: 150, width: 160, height: 72 } },
      ] },
    }));
    await store.arrangeSelection("right"); expect(fixture.edit).toHaveBeenCalledTimes(1);
    expect(store.workbench.commandFeedback).toContain("已符合该布局");
    await store.undoLayout(); expect(layouts[0]!.x).toBe(0); expect(layouts[1]!.x).toBe(200);
    await store.redoLayout(); expect(layouts[0]!.x).toBe(620); expect(layouts[1]!.x).toBe(560);
    const calls = fixture.edit.mock.calls.length;
    store.workbench.commandState = "submitting"; await store.arrangeSelection("left");
    expect(store.layoutArrangement.canAlign).toBe(false); expect(fixture.edit).toHaveBeenCalledTimes(calls);
    store.workbench.commandState = "idle";
    store.relationCandidate.phase = "armed"; await store.arrangeSelection("left");
    expect(store.layoutArrangement.canAlign).toBe(false); expect(fixture.edit).toHaveBeenCalledTimes(calls);
    store.relationCandidate.phase = "idle";
    wrapper.unmount();
  });

  it("细化所选 Object 后进入子 OPD，并可沿父边返回", async () => {
    const { token, open, read, edit } = draftFixture();
    const originalOpen = open.getMockImplementation()!;
    open.mockImplementation(async context => ({ ...await originalOpen(context), context_id: context ?? "context.root" }));
    read.mockImplementation(async opened => ({
      opened, project: { name: "项目" }, model: { name: "草稿模型", profile_id: "profile.1", profile_version: "0.2.0", head_revision: "revision.1" },
      history: [{ revision_id: "revision.1", sequence: 1, kind: "DRAFT", created_at: "2026-09-14T00:00:00Z" }],
      navigation: { current_path: opened.context_id === "context.child" ? ["context.root", "context.child"] : ["context.root"],
        process_tree: [{ context_id: "context.root", label: "SD", context_kind: "SYSTEM_DIAGRAM", has_children: token().edit_seq > 0 }],
        object_forest: token().edit_seq > 0 ? [{ context_id: "context.child", label: "原料细化", context_kind: "OBJECT_REFINEMENT", has_children: false,
          parent_context_id: "context.root", refinee_element_id: "element.object" }] : [], views: [] },
      constructs: opened.context_id === "context.child" ? [] : [{ occurrence_id: "occ.object", target_id: "element.object", target_kind: "ELEMENT", construct_role: "OBJECT_NODE", label: "Material", layout: { x: 80, y: 80, width: 160, height: 72, z_order: 0 }, capability_id: "CAP-OBJECT-001" }],
      suppressed: [], text: { sentences: [], traces: [] }, findings: { items: [], validation_summary: { blocking: 0, coverage_state: "INCOMPLETE" } }, catalog: [],
    }) as never);
    vi.spyOn(DraftWorkbenchSession.prototype, "capabilities").mockImplementation(async () => ({ data: { options: [{
      command_type: "CREATE_CONTEXT", enabled: true, capability_query_id: "query.refine", option_id: "option.refine",
    }] } }) as never);
    const { wrapper, router } = await mountWorkbench();
    expect(wrapper.find('[data-testid="opd-refinement-panel"]').exists()).toBe(false);
    useWorkbenchRuntimeStore().workbench.selectedId = ""; await flushPromises();
    await wrapper.get('[data-testid="opd-add-context.root"]').trigger("click"); await flushPromises();
    expect(wrapper.get('[data-testid="opd-refinement-panel"]').text()).toContain("请先在画布选择");
    await wrapper.get('[data-testid="opd-refinement-cancel"]').trigger("click");
    expect(edit).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    expect(wrapper.find('[data-testid="opd-refinement-panel"]').exists()).toBe(false);
    // 菜单目标按出现位置确定，不能误用打开菜单前的其他选择。
    useWorkbenchRuntimeStore().workbench.selectedId = "";
    await useWorkbenchRuntimeStore().requestConstructActions("occ.object"); await flushPromises();
    await wrapper.get('[data-testid="p03-construct-add-refinement"]').trigger("click"); await flushPromises();
    expect(wrapper.find('[data-testid="p03-construct-actions-menu"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="opd-refinement-panel"]').text()).toContain("细化：Material");
    expect(edit).not.toHaveBeenCalled();
    await useWorkbenchRuntimeStore().requestConstructActions("occ.object"); await flushPromises();
    await wrapper.get('[data-testid="p03-construct-add-refinement"]').trigger("click"); await flushPromises();
    expect(wrapper.find('[data-testid="opd-refinement-panel"]').exists()).toBe(true);
    await wrapper.get('[data-testid="opd-refinement-name"]').setValue("原料细化");
    await wrapper.get('[data-testid="opd-refine"]').trigger("click"); await flushPromises();
    expect(edit).toHaveBeenCalledWith(expect.anything(), "context.root", expect.objectContaining({ commandType: "CREATE_CONTEXT",
      payload: expect.objectContaining({ refinee_element_id: "element.object", name: "原料细化" }) }));
    expect(router.currentRoute.value.query.context).toBe("context.child");
    expect(wrapper.get('[data-testid="opd-parent"]').attributes("aria-label")).toBe("返回父 OPD");
    await wrapper.get('[data-testid="opd-parent"]').trigger("click"); await flushPromises();
    expect(router.currentRoute.value.query.context).toBe("context.root");
    const capabilities = vi.mocked(DraftWorkbenchSession.prototype.capabilities);
    const queried = capabilities.mock.calls.length, edited = edit.mock.calls.length;
    const store = useWorkbenchRuntimeStore();
    store.workbench.accessMode = "readonly";
    await store.requestConstructActions("occ.object"); await flushPromises();
    expect(capabilities).toHaveBeenCalledTimes(queried);
    expect(wrapper.find('[data-testid="p03-construct-add-refinement"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="p03-construct-delete-action"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="p03-construct-expand-refinement"]').attributes("disabled")).toBeUndefined();
    store.workbench.commandState = "submitting"; await flushPromises();
    expect(wrapper.get('[data-testid="p03-construct-expand-refinement"]').attributes("disabled")).toBeDefined();
    store.workbench.commandState = "idle"; await flushPromises();
    await wrapper.get('[data-testid="p03-construct-expand-refinement"]').trigger("click"); await flushPromises();
    expect(router.currentRoute.value.query.context).toBe("context.child");
    expect(edit).toHaveBeenCalledTimes(edited);
    wrapper.unmount();
  });

  it("引用元素与忙碌状态的右键添加子图入口禁用", async () => {
    const { edit } = draftFixture();
    const { wrapper } = await mountWorkbench();
    const store = useWorkbenchRuntimeStore();
    await store.requestConstructActions("occ.object"); await flushPromises();
    expect(wrapper.get('[data-testid="p03-construct-add-refinement"]').attributes("disabled")).toBeUndefined();
    store.workbench.nodes[0]!.occurrenceRole = "reference"; await flushPromises();
    expect(wrapper.get('[data-testid="p03-construct-add-refinement"]').attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-testid="p03-construct-add-refinement"]').attributes("title")).toContain("引用元素");
    store.workbench.nodes[0]!.occurrenceRole = "owned";
    store.workbench.commandState = "submitting"; await flushPromises();
    expect(wrapper.get('[data-testid="p03-construct-add-refinement"]').attributes("disabled")).toBeDefined();
    expect(edit).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("切换已有 OPD 等待读取时不插入顶部加载提示，首次打开仍显示", async () => {
    let releaseInitial!: () => void;
    const initialWait = new Promise<void>((resolve) => { releaseInitial = resolve; });
    const originalSession = api.workspaceSession.getMockImplementation()!;
    api.workspaceSession.mockImplementationOnce(async (...args: unknown[]) => { await initialWait; return originalSession(...args); });
    const { wrapper, router } = await mountWorkbench();
    expect(wrapper.get(".workbench-notices").text()).toContain("正在读取 Local Runtime 工作台会话。");
    releaseInitial(); await flushPromises();

    let releaseSwitch!: () => void;
    const switchWait = new Promise<void>((resolve) => { releaseSwitch = resolve; });
    api.workspaceSession.mockImplementationOnce(async (...args: unknown[]) => { await switchWait; return originalSession(...args); });
    await router.push({ query: { context: "context.child" } }); await flushPromises();
    const store = useWorkbenchRuntimeStore();
    expect(store.workbench.resourceState).toBe("loading");
    expect(wrapper.find(".workbench-notices").exists()).toBe(false);
    expect(wrapper.get(".workbench-grid").exists()).toBe(true);
    releaseSwitch(); await flushPromises();
    expect(store.workbench.resourceState).toBe("ready");
    wrapper.unmount();
  });

  it("V2 保存按钮与快捷键不调用 V1，卸载后撤销快捷键", async () => {
    const { save } = draftFixture(); const { wrapper, router } = await mountWorkbench();
    expect(wrapper.get('[data-testid="hs-draft-identity"]').text()).toBe("活动草稿 · 编辑 0");
    expect(wrapper.get('[data-testid="hs-text-input"]').text()).toBe("草稿输入 · 编辑 0");
    expect(api.workspaceSession).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="hs-save"]').trigger("click"); await flushPromises();
    expect(save).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", metaKey: true, cancelable: true })); await flushPromises();
    expect(save).toHaveBeenCalledTimes(2);
    expect(router.currentRoute.value.query.revision).toBeUndefined();
    expect(api.executeP0Command).not.toHaveBeenCalled();
    wrapper.unmount();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true })); await flushPromises();
    expect(save).toHaveBeenCalledTimes(2);
  });

  it("V2 保存等待在途编辑，后续编辑不被旧保存响应回滚", async () => {
    const { edit, save } = draftFixture();
    let releaseEdit!: () => void;
    const original = edit.getMockImplementation()!;
    edit.mockImplementationOnce(async (...args) => { await new Promise<void>(resolve => { releaseEdit = resolve; }); return original(...args); });
    let releaseSave!: () => void;
    save.mockImplementationOnce(async captured => { await new Promise<void>(resolve => { releaseSave = resolve; }); return { save_id: "save.ui", status: "SAVED", captured_token: captured, head_token: captured, revision_id: "revision.saved", checkpoint_id: "checkpoint.ui" }; });
    const { wrapper } = await mountWorkbench();
    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click");
    await wrapper.get('[data-testid="hs-save"]').trigger("click"); await flushPromises();
    expect(save).not.toHaveBeenCalled(); releaseEdit(); await flushPromises();
    expect(save.mock.calls[0]?.[0].edit_seq).toBe(1);
    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click"); await flushPromises();
    expect(wrapper.get('[data-testid="hs-draft-identity"]').text()).toContain("编辑 2");
    releaseSave(); await flushPromises();
    expect(wrapper.get('[data-testid="hs-draft-identity"]').text()).toContain("编辑 2");
    expect(wrapper.get('[data-testid="hs-save-state"]').text()).toContain("等待保存"); wrapper.unmount();
  });

  it("V2 IME与未完成候选不保存，失败反馈保留而不回退V1", async () => {
    const { save } = draftFixture(); const { wrapper } = await mountWorkbench();
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "s", ctrlKey: true, isComposing: true })); await flushPromises();
    expect(save).not.toHaveBeenCalled();
    const store = useWorkbenchRuntimeStore(); store.controlCandidate.phase = "choosing";
    await wrapper.get('[data-testid="hs-save"]').trigger("click"); await flushPromises(); expect(save).not.toHaveBeenCalled();
    store.controlCandidate.phase = "idle";
    save.mockRejectedValueOnce(new LocalRuntimeApiError("PERSISTENCE_FAILED", "写入失败", true));
    await wrapper.get('[data-testid="hs-save"]').trigger("click"); await flushPromises();
    expect(wrapper.get('[data-testid="hs-save-state"]').text()).toBe("保存失败");
    expect(wrapper.get('[data-testid="p03-command-feedback"]').text()).toContain("写入失败");
    expect(api.executeP0Command).not.toHaveBeenCalled(); wrapper.unmount();
  });

  it("V2 Pin 成功才复制永久链接，失败不复制", async () => {
    const { pin } = draftFixture(); const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { wrapper } = await mountWorkbench();
    pin.mockRejectedValueOnce(new LocalRuntimeApiError("PERSISTENCE_FAILED", "固定失败"));
    await wrapper.get('[data-testid="p03-copy-permalink"]').trigger("click"); await flushPromises(); expect(writeText).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="p03-copy-permalink"]').trigger("click"); await flushPromises();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("revision=revision.pinned")); wrapper.unmount();
  });

  it("头部将版本状态与命令操作分组且保留原控制入口", async () => {
    const { wrapper } = await mountWorkbench();

    expect(wrapper.get(".workbench-header__revision-group").find('[data-testid="hs-draft-identity"]').exists()).toBe(true);
    expect(wrapper.get(".workbench-header__revision-group").find('[data-testid="p03-version-select"]').exists()).toBe(true);
    expect(wrapper.get(".workbench-header__revision-group").find('[data-testid="hs-save-state"]').exists()).toBe(true);
    expect(wrapper.get(".workbench-header__actions").find('[data-testid="p03-copy-permalink"] svg').exists()).toBe(true);
    expect(wrapper.get('[data-testid="p03-run-validation"]').classes()).toContain("button--primary");
    expect(wrapper.get('[data-testid="p03-run-validation"] svg').exists()).toBe(true);
  });

  it("V2 读取失败不降级 V1，也不显示旧画布", async () => {
    api.draftQuery.mockRejectedValue(new LocalRuntimeApiError("DRAFT_RECOVERY_REQUIRED", "草稿需要恢复"));
    const { wrapper } = await mountWorkbench();
    expect(api.workspaceSession).not.toHaveBeenCalled(); expect(api.projection).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="p03-command-feedback"]').text()).toContain("草稿需要恢复"); wrapper.unmount();
  });

  it("V2 State 更新候选失败保留输入，迟到候选不提交到另一选择", async () => {
    const { edit } = draftFixture(); const { wrapper } = await mountWorkbench();
    const store = useWorkbenchRuntimeStore();
    store.workbench.nodes.push({ ...store.workbench.nodes[0]!, id: "state.ui", kind: "state", ownerId: "element.object" });
    store.workbench.selectedId = "state.ui"; store.stateEditor.name = "修改中的状态"; store.stateEditor.roles = ["INITIAL"];
    vi.mocked(DraftWorkbenchSession.prototype.capabilities).mockRejectedValueOnce(new LocalRuntimeApiError("DRAFT_QUERY_REJECTED", "状态候选读取失败"));
    await expect(store.saveSelectedState()).resolves.toBeUndefined();
    expect(store.stateEditor.name).toBe("修改中的状态");
    expect(store.workbench.commandFeedback).toBe("状态候选读取失败"); expect(edit).not.toHaveBeenCalled();
    let complete!: (value: never) => void;
    vi.mocked(DraftWorkbenchSession.prototype.capabilities).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const pending = store.saveSelectedState(); store.workbench.selectedId = "element.object";
    complete({ data: { options: [{ command_type: "UPDATE_STATE", enabled: true }] } } as never); await pending;
    expect(edit).not.toHaveBeenCalled(); wrapper.unmount();
  });

  it("V2 轮询发现外部编辑保持原画布且只读，卸载后的迟到响应不回填", async () => {
    const { token } = draftFixture(); const { wrapper } = await mountWorkbench();
    const store = useWorkbenchRuntimeStore(); const open = vi.mocked(DraftWorkbenchSession.prototype.open);
    const opened = await open.getMockImplementation()!.call({} as DraftWorkbenchSession, null);
    open.mockResolvedValueOnce({ ...opened, draft_token: { ...token(), edit_seq: 9 } });
    await store.pollDraftState(); expect(store.isReadonly).toBe(true);
    expect(store.draftToken?.edit_seq).toBe(0); expect(store.workbench.nodes[0]?.label).toBe("Object 0");
    expect(store.saveError).toContain("其他页面更新");
    let complete!: (value: typeof opened) => void;
    open.mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    const polling = store.pollDraftState(); wrapper.unmount(); complete(opened); await polling;
    expect(store.draftToken).toBeNull(); expect(store.draftSaveState).toBeNull(); expect(store.isReadonly).toBe(true);
  });

  it.each(["SAVE", "EDIT"] as const)("V2 %s 失败后的队列读取晚于重载，不污染新会话", async operation => {
    const fixture = draftFixture(); const { wrapper } = await mountWorkbench();
    const store = useWorkbenchRuntimeStore();
    let complete!: (value: never) => void;
    vi.mocked(DraftWorkbenchSession.prototype.pending).mockImplementationOnce(() => new Promise(resolve => { complete = resolve; }));
    if (operation === "SAVE") fixture.save.mockRejectedValueOnce(new Error("保存响应失败"));
    else fixture.edit.mockRejectedValueOnce(new Error("编辑响应失败"));
    const action = operation === "SAVE" ? store.saveDraft() : store.addElement("object");
    await flushPromises();
    await store.load("project.1", "model.1", "context.root");
    complete([{ pending: true }] as never); await action;
    expect(store.pendingDelivery).toBe(false); expect(store.isReadonly).toBe(false); expect(store.saveError).toBe("");
    wrapper.unmount();
  });

  it("兼容 head 仅 replace 规范化，连续语义及布局提交不改 URL", async () => {
    const { wrapper, router } = await mountWorkbench("?revision=head");
    expect(router.currentRoute.value.query).toEqual({ context: "context.root" });
    expect(api.workspaceSession).toHaveBeenCalledTimes(1);
    const location = router.currentRoute.value.fullPath;
    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click");
    await flushPromises();
    expect(wrapper.get(".revision-tag").text()).toBe("草稿 revision.2");
    expect(router.currentRoute.value.fullPath).toBe(location);
    api.executeP0Command.mockResolvedValueOnce({ meta: { committed_revision: "revision.3" }, data: {} });
    await wrapper.get('[data-testid="p03-canvas-move-object"]').trigger("click");
    await flushPromises();
    expect(wrapper.get(".revision-tag").text()).toBe("草稿 revision.3");
    expect(router.currentRoute.value.fullPath).toBe(location);
    expect(api.executeP0Command.mock.calls[1][3]).toBe("revision.2");
    expect(wrapper.get('[data-testid="p03-tool-object"]').attributes("disabled")).toBeUndefined();
    wrapper.unmount();
  });

  it("State option 慢响应不阻止 HEAD 入口完成规范化", async () => {
    let finish!: (value: unknown) => void;
    const pending = new Promise((resolve) => { finish = resolve; });
    api.commandCapabilities.mockImplementation((...args: unknown[]) => args[5] === "CREATE_STATE" ? pending : Promise.resolve({ data: { allowed: ["CREATE_ELEMENT"], options: [] } }));
    const { wrapper, router } = await mountWorkbench();
    expect(router.currentRoute.value.query).toEqual({ context: "context.root" });
    expect(wrapper.get('[data-testid="p03-tool-object"]').attributes("disabled")).toBeUndefined();
    finish({ data: { options: [] } });
    await flushPromises();
    wrapper.unmount();
  });

  it("精确 Head 一律只读，返回活动草稿后才可写，并可打开历史版本", async () => {
    const { wrapper, router } = await mountWorkbench("?revision=revision.1");
    expect(wrapper.get('.workbench-header [data-testid="p03-readonly-banner"]').text()).toBe("只读");
    expect(wrapper.find('.workbench-notices [data-testid="p03-readonly-banner"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="p03-readonly-banner"]').attributes("title")).toContain("语义和布局编辑已禁用");
    expect(router.currentRoute.value.query).toEqual({ revision: "revision.1", context: "context.root" });
    expect(wrapper.get('[data-testid="p03-tool-object"]').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="p03-canvas-move-object"]').trigger("click");
    await wrapper.get('[data-testid="p03-canvas-submit-name-edit"]').trigger("click");
    await wrapper.get('[data-testid="p03-canvas-keyboard-delete-state"]').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).not.toHaveBeenCalled();
    await wrapper.get('[data-testid="p03-return-head"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.query).toEqual({ context: "context.root" });
    expect(wrapper.get('[data-testid="p03-tool-object"]').attributes("disabled")).toBeUndefined();
    await wrapper.get('[data-testid="p03-version-select"]').setValue("revision.1");
    await flushPromises();
    expect(router.currentRoute.value.query.revision).toBe("revision.1");
    expect(wrapper.get('[data-testid="p03-tool-object"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("导航宽度跨 TAB 和只读版本保持，调整不提交模型命令", async () => {
    const { wrapper, router } = await mountWorkbench();
    await wrapper.get('[data-testid="opd-navigator-resizer"]').trigger("keydown", { key: "ArrowRight" });
    const style = () => wrapper.get('[data-testid="p03-workbench"]').attributes("style");
    expect(style()).toContain("--workbench-navigator-width: 250px");
    await wrapper.get('[data-testid="p03-tab-history"]').trigger("click");
    await router.push({ query: { revision: "revision.1", context: "context.root" } });
    await flushPromises();
    expect(style()).toContain("--workbench-navigator-width: 250px");
    await wrapper.get('[data-testid="opd-navigator-resizer"]').trigger("keydown", { key: "ArrowLeft" });
    expect(style()).toContain("--workbench-navigator-width: 230px");
    expect(api.executeP0Command).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("左侧助手独立于底部和属性区，切换保留输入与分别调整的宽度", async () => {
    vi.mocked(assistantRequest).mockResolvedValue([{ id: 'session.fixed', projectId: 'project.1', modelId: 'model.1', contextId: 'context.root', title: 'OPD 会话', updatedAt: '1', messages: [], proposals: [], run: null }]);
    const { wrapper } = await mountWorkbench();
    expect(wrapper.find('[data-testid="assistant-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="p03-tab-assistant"]').exists()).toBe(false);
    await wrapper.get('[data-testid="opd-navigator-resizer"]').trigger("keydown", { key: "ArrowRight" });
    await wrapper.get('[data-testid="left-tab-assistant"]').trigger("click"); await flushPromises();
    const panel = wrapper.get('[data-testid="assistant-panel"]');
    const input = panel.get('textarea'); await input.setValue('还没发送的建模需求');
    const style = () => wrapper.get('[data-testid="p03-workbench"]').attributes('style');
    expect(style()).toContain('--workbench-navigator-width: 360px');
    await wrapper.get('[data-testid="opd-navigator-resizer"]').trigger("keydown", { key: "ArrowRight" });
    await wrapper.get('[data-testid="p03-bottom-toggle"]').trigger('click');
    expect(useWorkbenchRuntimeStore().workbench.bottomPanelExpanded).toBe(false);
    await wrapper.get('[data-testid="left-tab-navigation"]').trigger('click');
    expect(style()).toContain('--workbench-navigator-width: 250px');
    expect(wrapper.get('#left-assistant-content').attributes('style')).toContain('display: none');
    await wrapper.get('[data-testid="left-tab-navigation"]').trigger('keydown', { key: 'ArrowRight' }); await flushPromises();
    expect(style()).toContain('--workbench-navigator-width: 380px');
    expect(wrapper.get('[data-testid="assistant-input"]').element).toBe(input.element);
    expect((input.element as HTMLTextAreaElement).value).toBe('还没发送的建模需求');
    await wrapper.get('[data-testid="opd-navigator-resizer"]').trigger('dblclick');
    expect(style()).toContain('--workbench-navigator-width: 360px');
    expect(assistantRequest).toHaveBeenCalledTimes(1);
    expect(watchAssistant).toHaveBeenCalledTimes(1);
    expect(api.executeP0Command).not.toHaveBeenCalled(); wrapper.unmount();
  });

  it("底部标签均可折叠恢复，保留校验状态且提交不会强制展开", async () => {
    const { wrapper, router } = await mountWorkbench();
    await wrapper.get('[data-testid="p03-bottom-resizer"]').trigger("keydown", { key: "ArrowUp" });
    expect(wrapper.get('[data-testid="p03-workbench"]').attributes("style")).toContain("--workbench-bottom-height: 260px");
    const toggle = wrapper.get('[data-testid="p03-bottom-toggle"]');
    const location = router.currentRoute.value.fullPath;
    for (const tab of ["text", "findings", "history", "method"]) {
      if (tab !== "text") await wrapper.get(`[data-testid="p03-tab-${tab}"]`).trigger("click");
      expect(toggle.attributes("aria-expanded")).toBe("true");
      await toggle.trigger("click");
      expect(wrapper.get('#p03-bottom-content').isVisible()).toBe(false);
      expect(wrapper.find('[data-testid="p03-bottom-resizer"]').exists()).toBe(false);
      expect(wrapper.get('.validation-status').isVisible()).toBe(true);
      expect(wrapper.get('[data-testid="p03-capture-view-state"]').attributes("data-bottom-open")).toBe("false");
      await toggle.trigger("click");
      expect(wrapper.get('[data-testid="p03-bottom-resizer"]').attributes("aria-valuenow")).toBe("260");
      expect(wrapper.get(`[data-testid="p03-tab-${tab}"]`).attributes("aria-selected")).toBe("true");
      await wrapper.get(`[data-testid="p03-tab-${tab}"]`).trigger("click");
      expect(toggle.attributes("aria-expanded")).toBe("false");
    }
    expect(api.executeP0Command).not.toHaveBeenCalled();
    expect(router.currentRoute.value.fullPath).toBe(location);
    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenCalledTimes(1);
    expect(toggle.attributes("aria-expanded")).toBe("false");
    await wrapper.get('[data-testid="p03-tab-text"]').trigger("click");
    expect(wrapper.get('[data-testid="p03-text-panel"]').isVisible()).toBe(true);
    wrapper.unmount();
  });

  it("拒绝无效精确入口时清空旧投影并保留错误 URL", async () => {
    const { wrapper, router } = await mountWorkbench();
    api.workspaceSession.mockRejectedValueOnce(new LocalRuntimeApiError("NOT_FOUND", "修订不存在"));
    await router.push({ query: { revision: "revision.foreign", context: "context.root" } });
    await flushPromises();
    expect(router.currentRoute.value.query.revision).toBe("revision.foreign");
    expect(wrapper.get('[data-testid="p03-command-feedback"]').text()).toContain("修订不存在");
    expect(wrapper.get('[data-testid="p03-tool-object"]').attributes("disabled")).toBeDefined();
    expect(wrapper.findAll('[data-testid="p03-opl-sentence"]')).toHaveLength(0);
    expect(wrapper.get('[data-testid="p03-copy-permalink"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("Context 按目标版本的 Runtime 结果回退根并给出提示", async () => {
    api.workspaceSession.mockResolvedValueOnce({ meta: { read_revision: "revision.old" }, data: { model: { name: "生产模型", profile_id: "profile.iso", profile_version: "0.2.0", head_revision: "revision.1", access_mode: "READONLY_SNAPSHOT" }, root_context_id: "context.old.root", current_context_id: "context.old.root" } });
    const { wrapper, router } = await mountWorkbench("?revision=revision.old&context=context.foreign");
    expect(api.projection).toHaveBeenCalledWith("project.1", "model.1", "context.old.root", "revision.old");
    expect(router.currentRoute.value.query).toEqual({ revision: "revision.old", context: "context.old.root" });
    expect(wrapper.get('[data-testid="p03-command-feedback"]').text()).toContain("该版本的根系统图");
    wrapper.unmount();
  });

  it("无活动 Head 的会话转为只读 Baseline EXACT", async () => {
    api.workspaceSession.mockResolvedValueOnce({ meta: { read_revision: "revision.baseline" }, data: { model: { name: "生产模型", profile_id: "profile.iso", profile_version: "0.2.0", head_revision: null, access_mode: "READONLY_BASELINE" }, root_context_id: "context.root", current_context_id: "context.root" } });
    const { wrapper, router } = await mountWorkbench();
    expect(router.currentRoute.value.query).toEqual({ revision: "revision.baseline", context: "context.root" });
    expect(wrapper.get('[data-testid="p03-tool-object"]').attributes("disabled")).toBeDefined();
    wrapper.unmount();
  });

  it("复制投影当前 Revision 的永久链接，不改变 HEAD 地址", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const { wrapper, router } = await mountWorkbench();
    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-copy-permalink"]').trigger("click");
    await flushPromises();
    const copied = new URL(writeText.mock.calls[0][0]);
    expect(copied.searchParams.get("revision")).toBe("revision.2");
    expect(copied.searchParams.get("context")).toBe("context.root");
    expect(router.currentRoute.value.query).toEqual({ context: "context.root" });
    wrapper.unmount();
  });

  it("导航后迟到的提交响应不覆盖精确版本或重写 URL", async () => {
    const { wrapper, router } = await mountWorkbench();
    let finish!: (value: unknown) => void;
    api.executeP0Command.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click");
    await flushPromises();
    await router.push({ query: { revision: "revision.1", context: "context.root" } });
    await flushPromises();
    finish({ meta: { committed_revision: "revision.2" }, data: {} });
    await flushPromises();
    expect(wrapper.get(".revision-tag").text()).toBe("固定版本 revision.1");
    expect(router.currentRoute.value.query.revision).toBe("revision.1");
    expect(api.projection).not.toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.2");
    wrapper.unmount();
  });

  it("过期会话响应不覆盖较新的 EXACT 导航", async () => {
    const { wrapper, router } = await mountWorkbench();
    let finish!: (value: unknown) => void;
    api.workspaceSession.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    await router.push({ query: { revision: "revision.old" } });
    await flushPromises();
    await router.push({ query: { revision: "revision.1", context: "context.root" } });
    await flushPromises();
    finish({ meta: { read_revision: "revision.old" }, data: {} });
    await flushPromises();
    expect(wrapper.get(".revision-tag").text()).toBe("固定版本 revision.1");
    expect(router.currentRoute.value.query.revision).toBe("revision.1");
    wrapper.unmount();
  });

  it.each(["missing-meta", "wrong-revision", "wrong-context"])("投影身份异常 %s 不生成永久链接或可编辑页面", async (scenario) => {
    api.projection.mockResolvedValueOnce({
      meta: scenario === "missing-meta" ? undefined : { read_revision: scenario === "wrong-revision" ? "revision.other" : "revision.1" },
      data: { context_id: scenario === "wrong-context" ? "context.other" : "context.root", constructs: [], suppressed_states: [] },
    });
    const { wrapper, router } = await mountWorkbench("?revision=revision.1");
    expect(wrapper.get('[data-testid="p03-command-feedback"]').text()).toContain("投影修订不一致");
    expect(wrapper.get('[data-testid="p03-copy-permalink"]').attributes("disabled")).toBeDefined();
    expect(router.currentRoute.value.query).toEqual({ revision: "revision.1" });
    wrapper.unmount();
  });

  it("读取真实 P03 投影、OPL 和稳定修订定位", async () => {
    const { wrapper, router } = await mountWorkbench();

    expect(wrapper.get('[data-testid="p03-opl-sentence"]').text()).toBe("Transform consumes Material.");
    expect(wrapper.get('[data-testid="p03-context-context.root"]').text()).toBe("生产模型");
    expect(wrapper.get('[data-testid="p03-context-context.root"]').attributes("title")).toBe("生产模型（SD · 根图）");
    expect(wrapper.get('[data-testid="opd-add-context.root"]').attributes("aria-label")).toBe("在 生产模型 下创建子图");
    expect(router.currentRoute.value.query).toEqual({ context: "context.root" });

    await wrapper.get('[data-testid="p03-opl-sentence"]').trigger("click");
    const store = useWorkbenchRuntimeStore();
    expect(store.highlightedTextNodeIds).toEqual(["element.object", "element.process"]);
    expect(store.highlightedTextRelationIds).toEqual(["fact.consumption"]);
    expect(store.selectedIds).toEqual([]);
    expect(wrapper.get('[data-testid="p03-opl-sentence"]').attributes("aria-pressed")).toBe("true");
    await openRightPanel(wrapper);
    expect(wrapper.text()).toContain("fact.consumption");
    await wrapper.get('[data-testid="p03-canvas-select-product"]').trigger("click");
    expect(store.highlightedTextNodeIds).toEqual([]);
    expect(store.selectedTextLineId).toBe("");
  });

  it("OPL 状态和属性按 occurrence 定位并包含所属元素，空白和切图清除定位", async () => {
    const { wrapper } = await mountWorkbench("?revision=revision.1");
    const store = useWorkbenchRuntimeStore();
    store.textLines = [{ id: "sentence.state", text: "Ready Material owns Product.", factIds: ["fact.structural"], occurrenceIds: ["occ.state", "occ.object.product"] },
      { id: "sentence.feature", text: "Material exhibits Temperature.", factIds: [], occurrenceIds: ["occ.attribute"] }];
    await flushPromises();
    await wrapper.findAll('[data-testid="p03-opl-sentence"]')[0]!.trigger("click");
    expect(store.highlightedTextNodeIds).toEqual(["element.object.product", "state.material.ready", "element.object"]);
    expect(store.workbench.selectedId).toBe("fact.structural");
    expect(store.isReadonly).toBe(true);
    await wrapper.findAll('[data-testid="p03-opl-sentence"]')[1]!.trigger("click");
    expect(store.highlightedTextNodeIds).toEqual(["feature.attribute", "element.object"]);
    store.selectNodes([]);
    expect(store.highlightedTextNodeIds).toEqual([]);
    store.locateText(store.textLines[1]!);
    await store.selectContext("context.other");
    expect(store.highlightedTextNodeIds).toEqual([]);
    wrapper.unmount();
  });

  it("选择和平移工具互斥，并把当前工具传给画布", async () => {
    const { wrapper } = await mountWorkbench();
    const select = wrapper.get('[data-testid="p03-tool-select"]');
    const pan = wrapper.get('[data-testid="p03-tool-pan"]');
    const canvas = wrapper.get('[data-interaction-tool]');

    expect(select.classes()).toContain("is-active");
    expect(select.attributes("aria-pressed")).toBe("true");
    expect(pan.attributes("aria-pressed")).toBe("false");
    expect(canvas.attributes("data-interaction-tool")).toBe("select");

    await pan.trigger("click");
    expect(select.classes()).not.toContain("is-active");
    expect(pan.classes()).toContain("is-active");
    expect(pan.attributes("aria-pressed")).toBe("true");
    expect(canvas.attributes("data-interaction-tool")).toBe("pan");

    await select.trigger("click");
    expect(select.classes()).toContain("is-active");
    expect(canvas.attributes("data-interaction-tool")).toBe("select");

    await pan.trigger("click");
    await activateRelationCatalogItem(wrapper, "PROCEDURAL", "CAP-ISO-PROC-001");
    expect(select.classes()).toContain("is-active");
    expect(canvas.attributes("data-interaction-tool")).toBe("select");
  });

  it("属性检查器默认不占用画布，右键或工具栏显式打开且关闭后释放空间", async () => {
    const { wrapper } = await mountWorkbench();
    const grid = wrapper.get(".workbench-grid");

    expect(wrapper.find('[data-testid="p03-right-panel"]').exists()).toBe(false);
    expect(grid.classes()).not.toContain("workbench-grid--inspector-open");
    expect(wrapper.get('[data-testid="p03-right-panel-open"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.get('[data-testid="p03-right-panel-open"]').attributes("title")).toBe("打开属性 / Open properties");

    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="p03-right-panel"]').exists()).toBe(false);

    await wrapper.get('[data-testid="p03-canvas-delete-state"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-construct-open-properties"]').text()).toBe("打开属性");
    expect(wrapper.find('[data-testid="p03-construct-add-refinement"]').exists()).toBe(false);
    const capabilityCalls = api.commandCapabilities.mock.calls.length;
    await wrapper.get('[data-testid="p03-construct-open-properties"]').trigger("click");
    await flushPromises();

    expect(api.commandCapabilities).toHaveBeenCalledTimes(capabilityCalls);
    expect(api.executeP0Command).not.toHaveBeenCalled();
    expect(wrapper.get('[data-testid="p03-right-panel"]').exists()).toBe(true);
    expect(grid.classes()).toContain("workbench-grid--inspector-open");

    await wrapper.get('[data-testid="p03-right-panel-close"]').trigger("click");
    expect(wrapper.find('[data-testid="p03-right-panel"]').exists()).toBe(false);
    expect(grid.classes()).not.toContain("workbench-grid--inspector-open");
    expect(wrapper.get('[data-testid="p03-capture-view-state"]').attributes("data-selection-target-id")).toBe("element.object");
  });

  it("关系工具与画布工具同排显示纯图标，并以双语提示访问 Runtime 的 16/8/10 项", async () => {
    const { wrapper } = await mountWorkbench();

    expect(api.relationCatalog).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1");
    const toolchain = wrapper.get('[data-testid="p03-canvas-toolchain"]');
    const palette = wrapper.get('[data-testid="p03-relation-tool-palette"]');
    expect(palette.element.parentElement).toBe(toolchain.element);
    expect(wrapper.get('[data-testid="p03-tool-object"] svg rect').attributes("rx")).toBeUndefined();
    expect(wrapper.get('[data-testid="p03-tool-process"] svg ellipse').exists()).toBe(true);
    expect(wrapper.get('[data-testid="p03-tool-attribute"] svg rect').exists()).toBe(true);
    expect(wrapper.get('[data-testid="p03-tool-operation"] svg ellipse').exists()).toBe(true);
    expect(wrapper.get('[data-testid="p03-tool-state"] svg').findAll("rect")).toHaveLength(2);
    expect(toolchain.find('[data-testid="p03-zoom-controls"]').exists()).toBe(false);
    expect(wrapper.find(".canvas-state").exists()).toBe(false);
    await wrapper.get('[data-testid="p03-zoom-menu-toggle"]').trigger("click");
    expect(wrapper.get('[data-testid="p03-zoom-fit"]').attributes("title")).toBe("适应画布 / Fit to view");
    expect(wrapper.get('[data-testid="p03-zoom-reset"]').attributes("title")).toBe("恢复 100% / Reset zoom to 100%");
    expect(wrapper.find(".relation-tool-palette__heading").exists()).toBe(false);
    expect(wrapper.findAll(".relation-tool-palette__separator")).toHaveLength(2);
    expect(wrapper.findAll('[data-testid^="p03-relation-quick-option-CAP-ISO-PROC-"]')).toHaveLength(4);
    expect(wrapper.findAll('[data-testid^="p03-relation-quick-option-CAP-ISO-CTRL-"]')).toHaveLength(4);
    expect(wrapper.findAll('[data-testid^="p03-relation-quick-option-CAP-ISO-STRUCT-"]')).toHaveLength(5);
    expect(wrapper.findAll(".relation-tool-symbol")).toHaveLength(13);
    expect(wrapper.find('[data-testid="p03-relation-quick-option-CAP-ISO-PROC-002"]').exists()).toBe(false);

    const consumption = wrapper.get('[data-testid="p03-relation-quick-option-CAP-ISO-PROC-001"]');
    expect(consumption.attributes("title")).toBe(`${expectedRelationToolLabels["CAP-ISO-PROC-001"]}\n生成 / Result：过程 → 对象\n消耗 / Consumption：对象 → 过程`);
    expect(consumption.attributes("aria-label")).toBe(consumption.attributes("title"));
    expect(wrapper.get('[data-testid="p03-tool-object"]').attributes("title")).toBe("创建对象 / Create Object");

    const control = wrapper.get('[data-testid="p03-relation-quick-option-CAP-ISO-CTRL-001"]');
    expect(control.attributes("disabled")).toBeDefined();
    expect(control.attributes("title")).toBe(`${expectedRelationToolLabels["CAP-ISO-CTRL-001"]}\n请先选择可附加控制的过程关系 / Select a compatible procedural relation first`);

    const familyCounts = { PROCEDURAL: 16, CONTROL: 8, STRUCTURAL: 10 } as const;
    for (const [family, count] of Object.entries(familyCounts)) {
      const prefix = family === "PROCEDURAL" ? "PROC" : family === "CONTROL" ? "CTRL" : "STRUCT";
      const toggle = wrapper.get(`[data-testid="p03-relation-menu-toggle-${family}"]`);
      expect(toggle.attributes("title")).toMatch(/^展开全部.+关系 \/ Show all .+ relations$/);
      await toggle.trigger("click");
      for (let index = 1; index <= count; index += 1) {
        if (family === "PROCEDURAL" && index === 2) continue;
        const capabilityId = `CAP-ISO-${prefix}-${String(index).padStart(3, "0")}` as keyof typeof expectedRelationToolLabels;
        const option = wrapper.get(`[data-testid="p03-relation-menu-option-${capabilityId}"]`);
        const title = option.attributes("title");
        expect(title?.split("\n")[0]).toBe(expectedRelationToolLabels[capabilityId]);
        expect(option.attributes("aria-label")).toBe(title);
        expect(title).not.toMatch(/ENDPOINT|ELEMENT|STATE|FACT|CONTROL_REQUIRES|MODIFIER_COMBINATION|READ_ONLY_REVISION|REVISION_STALE|CAP-ISO-/);
      }
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flushPromises();
    }

    await wrapper.get('[data-testid="p03-relation-menu-toggle-PROCEDURAL"]').trigger("click");
    expect(wrapper.findAll('[data-testid^="p03-relation-menu-option-CAP-ISO-PROC-"]')).toHaveLength(15);
    expect(wrapper.find('[data-testid="p03-relation-menu-option-CAP-ISO-PROC-002"]').exists()).toBe(false);
    expect(wrapper.findAll(".relation-tool-palette__menu-item > span")).toHaveLength(0);
    expect(wrapper.find(".relation-tool-palette__menu-header").exists()).toBe(false);
    await wrapper.get('[data-testid="p03-relation-menu-toggle-STRUCTURAL"]').trigger("click");
    expect(wrapper.find('[data-testid="p03-relation-menu-PROCEDURAL"]').exists()).toBe(false);
    expect(wrapper.findAll('[data-testid^="p03-relation-menu-option-CAP-ISO-STRUCT-"]')).toHaveLength(10);
    expect(wrapper.find('[data-glyph-kind="state-effect-pair"]').exists()).toBe(true);
    expect(wrapper.find('[data-glyph-kind="filled-circle"]').exists()).toBe(true);
    expect(wrapper.find('[data-glyph-kind="open-circle"]').exists()).toBe(true);
    expect(wrapper.find('[data-glyph-kind="fan-exhibition"]').exists()).toBe(true);
    expect(wrapper.find('[data-glyph-kind="fan-classification"]').exists()).toBe(true);

    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="p03-relation-menu-STRUCTURAL"]').exists()).toBe(false);
    await wrapper.get('[data-testid="p03-relation-menu-toggle-CONTROL"]').trigger("click");
    expect(wrapper.findAll('[data-testid^="p03-relation-menu-option-CAP-ISO-CTRL-"]')).toHaveLength(8);
    document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[data-testid="p03-relation-menu-CONTROL"]').exists()).toBe(false);

    const state = wrapper.get('[data-testid="p03-capture-view-state"]');
    expect(state.attributes("data-catalog-open")).toBe("true");
    expect(state.attributes("data-catalog-procedural-count")).toBe("16");
    expect(state.attributes("data-catalog-control-count")).toBe("8");
    expect(state.attributes("data-catalog-structural-count")).toBe("10");
  });

  it("Capture view state 只通过显式 DOM 表达 inspector、Finding 高亮与 History", async () => {
    api.findings.mockResolvedValueOnce({ data: [{
      finding_id: "finding.1", rule_id: "RULE-1", severity: "WARNING", category: "MODEL_QUALITY", context_id: "context.root", entity_id: "fact.consumption",
    }] });
    api.operationRecords.mockResolvedValueOnce({ data: [
      operationRecord("validation-blocked", "diagnostic.visual.validation-blocked.VALIDATION_BLOCKED"),
      operationRecord("revision-conflict", "diagnostic.visual.revision-conflict.REVISION_CONFLICT"),
      operationRecord("readonly", "diagnostic.visual.readonly.READONLY"),
    ] });
    const { wrapper } = await mountWorkbench();
    const state = () => wrapper.get('[data-testid="p03-capture-view-state"]');

    expect(state().attributes("data-right-open")).toBe("false");
    await wrapper.get('[data-testid="p03-canvas-select-consumption"]').trigger("click");
    await openRightPanel(wrapper);
    expect(state().attributes("data-selection-kind")).toBe("relation");
    expect(state().attributes("data-selection-target-id")).toBe("fact.consumption");
    expect(state().attributes("data-right-open")).toBe("true");
    expect(state().attributes("data-right-mode")).toBe("inspector-relation-fields");

    await wrapper.get('[data-testid="p03-tab-findings"]').trigger("click");
    await wrapper.get('[data-testid="p03-finding-finding.1"]').trigger("click");
    await wrapper.get('[data-testid="p03-finding-locate"]').trigger("click");
    await flushPromises();
    expect(state().attributes("data-finding-selected-id")).toBe("finding.1");
    expect(state().attributes("data-finding-highlighted-target-id")).toBe("fact.consumption");

    await wrapper.get('[data-testid="p03-tab-history"]').trigger("click");
    expect(state().findAll("[data-opm-history-code]").map((item) => item.attributes("data-opm-history-code"))).toEqual([
      "VALIDATION_BLOCKED", "REVISION_CONFLICT", "READONLY",
    ]);
  });

  it("普通 Runtime 不显示受控故障命令，armed descriptor 仅从 History 入口提交 exact command", async () => {
    const normal = await mountWorkbench();
    await normal.wrapper.get('[data-testid="p03-tab-history"]').trigger("click");
    expect(normal.wrapper.find('[data-testid="p03-release-visual-common-fault-command"]').exists()).toBe(false);
    normal.wrapper.unmount();

    const command = releaseVisualCommonFaultCommand();
    api.releaseVisualCommonFaultCommand.mockResolvedValueOnce({ data: command });
    api.executeReleaseVisualCommonFaultCommand.mockRejectedValueOnce(new LocalRuntimeApiError("PERSISTENCE_FAILED", "受控持久化失败"));
    const { wrapper } = await mountWorkbench();
    await wrapper.get('[data-testid="p03-tab-history"]').trigger("click");
    await wrapper.get('[data-testid="p03-release-visual-common-fault-command"]').trigger("click");
    await flushPromises();

    expect(api.executeReleaseVisualCommonFaultCommand).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", command);
    const feedback = wrapper.get('[data-testid="p03-command-feedback"]');
    expect(wrapper.get('[data-testid="p03-command-feedback-code"]').text()).toBe("PERSISTENCE_FAILED");
    expect(feedback.classes()).toContain("editor-command-feedback");
    expect(feedback.element.closest(".canvas-surface")).not.toBeNull();
    expect(feedback.element.closest(".workbench-notices")).toBeNull();
    expect(feedback.attributes("aria-live")).toBe("polite");
    expect(wrapper.get('[data-testid="p03-capture-view-state"]').attributes("data-feedback-current-code")).toBe("PERSISTENCE_FAILED");
  });

  it("Object 命令提交后使用 committed revision 重读投影", async () => {
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", expect.objectContaining({ commandType: "CREATE_ELEMENT" }));
    expect(api.projection).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.2");
  });

  it("Object 拖动只提交受控 occurrence 布局并重读 committed revision", async () => {
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-move-object"]').trigger("click");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "UPDATE_LAYOUT",
      payload: { occurrence_id: "occ.object", layout: { x: 240, y: 180 } },
    });
    expect(api.projection).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.2");
  });

  it("布局提交失败重新下发原坐标并保留父节点和状态身份", async () => {
    const { wrapper } = await mountWorkbench();
    const store = useWorkbenchRuntimeStore();
    const original = store.workbench.nodes;
    api.executeP0Command.mockRejectedValueOnce(new LocalRuntimeApiError("PERSISTENCE_FAILED", "布局保存失败"));
    await wrapper.get('[data-testid="p03-canvas-move-object"]').trigger("click");
    await flushPromises();
    expect(store.workbench.nodes).not.toBe(original);
    expect(store.workbench.nodes).toEqual(original);
    expect(store.workbench.commandFeedback).toContain("布局保存失败");
  });

  it("Attribute 拖动提交 exact occurrence 布局并重读 committed revision", async () => {
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-move-attribute"]').trigger("click");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "UPDATE_LAYOUT",
      payload: { occurrence_id: "occ.attribute", layout: { x: 300, y: 220 } },
    });
    expect(api.projection).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.2");
  });

  it("布局重读期间保持工作台 ready，避免画布 Grid 因加载提示晃动", async () => {
    const { wrapper } = await mountWorkbench();
    let resolveProjection!: (value: unknown) => void;
    const pendingProjection = new Promise<unknown>((resolve) => { resolveProjection = resolve; });
    api.projection.mockImplementationOnce(() => pendingProjection);

    await wrapper.get('[data-testid="p03-canvas-move-object"]').trigger("click");
    await flushPromises();

    expect(wrapper.text()).not.toContain("正在读取 Local Runtime 工作台会话。");

    resolveProjection({ meta: { read_revision: "revision.2" }, data: { context_id: "context.root", constructs: [], suppressed_states: [] } });
    await flushPromises();
    wrapper.unmount();
  });

  it("右侧对象名称直接编辑，复用Runtime授权并移除过时P0提示", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => args[5] === "UPDATE_PROPERTY"
      ? Promise.resolve({ data: nameEditCapabilities() })
      : Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT", "UPDATE_LAYOUT"], forbidden: [], capability_query_id: "query.1", options: [] } }));
    const { wrapper } = await mountWorkbench();
    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await wrapper.get('[data-testid="p03-right-panel-open"]').trigger("click");
    expect(wrapper.text()).not.toContain("属性更新命令不在 P0 范围");
    const field = wrapper.get('[data-testid="p03-inspector-name"]');
    await field.setValue("面板改名"); await field.trigger("keydown", { key: "Enter" }); await flushPromises();
    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "UPDATE_PROPERTY", payload: {
        target_ref: { target_kind: "ELEMENT", target_id: "element.object" }, property_name: "name", value: "面板改名",
        capability_query_id: "query.property.1", selected_option_id: "option.property.1",
      },
    });
    expect(api.projection).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.2");
  });

  it.each([
    ["attribute", "feature.attribute", "CAP-FEAT-ATTRIBUTE-001", "属性改名"],
    ["operation", "feature.operation", "CAP-FEAT-OPERATION-001", "操作改名"],
  ])("右侧原属性面板可编辑 %s 名称", async (kind, targetId, capabilityId, value) => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => args[5] === "UPDATE_PROPERTY"
      ? Promise.resolve({ data: nameEditCapabilities("FEATURE", targetId, capabilityId) })
      : Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT", "UPDATE_LAYOUT"], forbidden: [], capability_query_id: "query.1", options: [] } }));
    const { wrapper } = await mountWorkbench();
    await wrapper.get(`[data-testid="p03-canvas-select-${kind}"]`).trigger("click");
    await wrapper.get('[data-testid="p03-right-panel-open"]').trigger("click");
    expect(wrapper.text()).not.toContain("此类元素暂不支持名称编辑");
    const field = wrapper.get('[data-testid="p03-inspector-name"]');
    await field.setValue(value); await field.trigger("keydown", { key: "Enter" }); await flushPromises();
    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "UPDATE_PROPERTY", payload: {
        target_ref: { target_kind: "FEATURE", target_id: targetId }, property_name: "name", value,
        capability_query_id: "query.property.1", selected_option_id: "option.property.1",
      },
    });
  });

  it("名称编辑采用 Runtime option、封闭 payload 并重读 committed revision", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => args[5] === "UPDATE_PROPERTY"
      ? Promise.resolve({ data: nameEditCapabilities() })
      : Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT", "UPDATE_LAYOUT"], forbidden: [], capability_query_id: "query.1", options: [] } }));
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-begin-name-edit"]').trigger("click");
    await flushPromises();
    expect(api.commandCapabilities).toHaveBeenCalledWith(
      "project.1", "model.1", "context.root", "revision.1", "element.object", "UPDATE_PROPERTY",
    );

    await wrapper.get('[data-testid="p03-canvas-submit-name-edit"]').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "UPDATE_PROPERTY",
      payload: {
        target_ref: { target_kind: "ELEMENT", target_id: "element.object" },
        property_name: "name",
        value: "Renamed Material",
        capability_query_id: "query.property.1",
        selected_option_id: "option.property.1",
      },
    });
    expect(api.projection).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.2");
  });

  it("同名名称不请求 Runtime，提交失败保留反馈", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => args[5] === "UPDATE_PROPERTY"
      ? Promise.resolve({ data: nameEditCapabilities() })
      : Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT", "UPDATE_LAYOUT"], forbidden: [], capability_query_id: "query.1", options: [] } }));
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-submit-same-name"]').trigger("click");
    await flushPromises();
    expect(api.commandCapabilities).not.toHaveBeenCalledWith(
      "project.1", "model.1", "context.root", "revision.1", "element.object", "UPDATE_PROPERTY",
    );
    expect(api.executeP0Command).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="p03-canvas-begin-name-edit"]').trigger("click");
    await flushPromises();
    api.executeP0Command.mockRejectedValueOnce(new LocalRuntimeApiError("DOMAIN_REJECTED", "Element 名称未发生变化"));
    await wrapper.get('[data-testid="p03-canvas-submit-name-edit"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-command-feedback-code"]').text()).toBe("DOMAIN_REJECTED");
    expect(wrapper.get('[data-testid="p03-command-feedback"]').text()).toContain("Element 名称未发生变化");
  });

  it("工具栏提供 Attribute 和 Operation 的受控 Feature 入口", async () => {
    const { wrapper } = await mountWorkbench();

    expect(wrapper.get('[data-testid="p03-tool-attribute"]').attributes("title")).toBe("创建属性 / Create Attribute");
    expect(wrapper.get('[data-testid="p03-tool-operation"]').attributes("title")).toBe("创建操作 / Create Operation");
    expect(wrapper.get('[data-testid="p03-tool-attribute"]').attributes("disabled")).toBeUndefined();

    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-tool-attribute"]').attributes("disabled")).toBeUndefined();
    expect(wrapper.get('[data-testid="p03-tool-operation"]').attributes("disabled")).toBeUndefined();

    api.commandCapabilities.mockImplementation((...args: unknown[]) => args[5] === "CREATE_FEATURE" ? Promise.resolve({ data: {
      allowed: ["CREATE_FEATURE"], forbidden: [], capability_query_id: "query.feature.1", options: [{ capability_query_id: "query.feature.1", option_id: "option.feature.attribute.1", command_type: "CREATE_FEATURE", capability_ref: { capability_id: "CAP-FEAT-ATTRIBUTE-001" }, display_name: "创建属性", group_path: ["Feature", "Attribute"], normalized_endpoints: [], required_fields: [{ field_id: "feature_kind", field_kind: "ENUM", required: true, allowed_values: ["ATTRIBUTE", "OPERATION"] }], allowed_modifiers: [], symbol_descriptor: { id: "symbol.feature.attribute", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1" }],
    } }) : Promise.resolve({ data: { allowed: [], forbidden: [], capability_query_id: "query.other.1", options: [] } }));
    await wrapper.get('[data-testid="p03-tool-attribute"]').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", expect.objectContaining({
      commandType: "CREATE_FEATURE",
      payload: expect.objectContaining({ feature_kind: "ATTRIBUTE", owner_element_id: "element.object", layout: { x: 296, y: 272 } }),
    }));
  });

  it("State 仅在选择 Object 时可用并一次点击直接提交 CREATE_STATE", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => args[5] === "CREATE_STATE" ? Promise.resolve({ data: {
      allowed: ["CREATE_ELEMENT", "CREATE_FACT", "CREATE_STATE"], forbidden: [], capability_query_id: "query.state.1",
      options: [{ capability_query_id: "query.state.1", option_id: "option.state.1", command_type: "CREATE_STATE", capability_ref: { capability_id: "CAP-STATE-001" }, display_name: "创建 Object State", group_path: ["Object", "State"], normalized_endpoints: [], required_fields: [], allowed_modifiers: [], symbol_descriptor: { id: "symbol.state", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1" }],
    } }) : Promise.resolve({ data: { allowed: [], forbidden: [], capability_query_id: "query.other.1", options: [] } }));
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-select-process"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-tool-state"]').attributes("disabled")).toBeDefined();
    expect(api.commandCapabilities).not.toHaveBeenCalledWith(
      "project.1", "model.1", "context.root", "revision.1", "element.process", "CREATE_STATE",
    );

    await wrapper.get('[data-testid="p03-canvas-select-attribute"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-tool-state"]').attributes("disabled")).toBeDefined();
    expect(api.commandCapabilities).not.toHaveBeenCalledWith(
      "project.1", "model.1", "context.root", "revision.1", "feature.attribute", "CREATE_STATE",
    );

    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-tool-state"]').attributes("disabled")).toBeUndefined();
    await wrapper.get('[data-testid="p03-tool-state"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="p03-state-candidate"]').exists()).toBe(false);
    expect(api.executeP0Command).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "CREATE_STATE",
      payload: {
        context_id: "context.root",
        owner_ref: { target_kind: "ELEMENT", target_id: "element.object" },
        capability_ref: { capability_id: "CAP-STATE-001" },
        name_or_value: "State 2",
        state_roles: [],
        occurrence: { ownership: "OWNED", construct_role: "STATE_NODE" },
        layout: { x: 116, y: 154 },
        capability_query_id: "query.state.1",
        selected_option_id: "option.state.1",
      },
    });
  });

  it("State 删除点击 Runtime 菜单项后直接提交 impact token", async () => {
    const { wrapper } = await mountWorkbench();
    api.commandCapabilities.mockResolvedValueOnce({ data: { allowed: ["DELETE_CONSTRUCT"], forbidden: [], capability_query_id: "query.delete.1", options: [{ capability_query_id: "query.delete.1", option_id: "option.delete.1", command_type: "DELETE_CONSTRUCT", capability_ref: { capability_id: "CAP-STATE-001" }, display_name: "删除 State", group_path: ["Object", "State"], normalized_endpoints: [], required_fields: [], allowed_modifiers: [], symbol_descriptor: { id: "symbol.state", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1", delete_mode: "DELETE_TARGET", delete_target: { kind: "STATE", id: "state.material.ready" }, impact_summary: { input_revision: "revision.1", selected_occurrence_id: "occ.state", delete_mode: "DELETE_TARGET", target: { kind: "STATE", id: "state.material.ready" }, items: [], counts: { contexts: 0, occurrences: 1, elements: 0, features: 0, states: 1, facts: 0, opl_sentences: 0, traces: 0, findings: 0 } }, impact_token: "impact.runtime.token.001" }] } });
    await wrapper.get('[data-testid="p03-canvas-delete-state"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-construct-delete-action"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="p03-delete-impact-dialog"]').exists()).toBe(false);
    expect(api.executeP0Command).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.1", { commandType: "DELETE_CONSTRUCT", payload: { selection_id: "occ.state", construct_kind: "STATE", construct_id: "state.material.ready", delete_mode: "DELETE_TARGET", impact_token: "impact.runtime.token.001" } });
  });

  it("键盘删除不显示菜单并按 DELETE_TARGET 优先级直接提交", async () => {
    const { wrapper } = await mountWorkbench();
    api.commandCapabilities.mockResolvedValueOnce({ data: {
      allowed: ["DELETE_CONSTRUCT"], forbidden: [], capability_query_id: "query.delete.direct", options: [
        stateDeleteOption("REMOVE_OCCURRENCE"),
        stateDeleteOption("CASCADE"),
        stateDeleteOption("DELETE_TARGET"),
      ],
    } });

    await wrapper.get('[data-testid="p03-canvas-keyboard-delete-state"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="p03-construct-actions-menu"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="p03-delete-impact-dialog"]').exists()).toBe(false);
    expect(api.executeP0Command).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "DELETE_CONSTRUCT",
      payload: {
        selection_id: "occ.state", construct_kind: "STATE", construct_id: "state.material.ready",
        delete_mode: "DELETE_TARGET", impact_token: "impact.runtime.token.delete_target",
      },
    });
  });

  it("State inspector 提供冻结的根与名称定位标识", async () => {
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-select-state"]').trigger("click");
    await flushPromises();
    await openRightPanel(wrapper);

    expect(wrapper.get('[data-testid="p03-state-inspector"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="p03-state-inspector-name"]').element.tagName).toBe("INPUT");
    expect(wrapper.get(".inspector-panel__body").exists()).toBe(true);
    expect(wrapper.get(".inspector-panel__title").text()).toContain("属性面板");
    expect(wrapper.get('[data-testid="p03-state-inspector"]').findAll(".inspector-section__heading").map(section => section.text())).toEqual([
      "基本信息", "状态角色", "显示方式", "标识信息",
    ]);
    expect(wrapper.get('[data-testid="p03-state-inspector"]').get('button.button--primary').text()).toBe("保存 State");
  });

  it("Object inspector 通过 Projection 清单显式化抑制 State", async () => {
    api.projection.mockResolvedValueOnce({ meta: { read_revision: "revision.1" }, data: { context_id: "context.root",
      constructs: [{ occurrence_id: "occ.object", target_id: "element.object", construct_role: "OBJECT_NODE", label: "Material", layout: { x: 80, y: 80, width: 160, height: 72, z_order: 1 } }],
      suppressed_states: [{ state_id: "state.common.subject", owner_ref: { target_kind: "ELEMENT", target_id: "element.object" }, name_or_value: "draft", state_roles: ["INITIAL"], explicitness: "SUPPRESSED" }],
    } });
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await flushPromises();
    await openRightPanel(wrapper);
    await wrapper.get('[data-testid="p03-suppressed-state-state.common.subject"]').trigger("click");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "STATE_EXPLICIT",
      payload: { context_id: "context.root", state_id: "state.common.subject" },
    });
  });

  it("Fact 删除仅使用 Runtime 返回的 enabled impact token", async () => {
    const { wrapper } = await mountWorkbench();
    api.commandCapabilities.mockResolvedValueOnce({ data: { allowed: ["DELETE_CONSTRUCT"], forbidden: [], capability_query_id: "query.delete.fact.1", options: [{ capability_query_id: "query.delete.fact.1", option_id: "option.delete.fact.1", command_type: "DELETE_CONSTRUCT", capability_ref: { capability_id: "CAP-ISO-PROC-001" }, display_name: "删除关系", group_path: ["Fact"], normalized_endpoints: [], required_fields: [], allowed_modifiers: [], symbol_descriptor: { id: "symbol.fact", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1", delete_mode: "DELETE_TARGET", delete_target: { kind: "FACT", id: "fact.consumption" }, impact_summary: { input_revision: "revision.1", selected_occurrence_id: "occ.fact", delete_mode: "DELETE_TARGET", target: { kind: "FACT", id: "fact.consumption" }, items: [], counts: { contexts: 0, occurrences: 1, elements: 0, features: 0, states: 0, facts: 1, opl_sentences: 1, traces: 1, findings: 0 } }, impact_token: "impact.runtime.token.fact.001" }] } });

    await wrapper.get('[data-testid="p03-canvas-delete-fact"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-construct-delete-action"]').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.1", { commandType: "DELETE_CONSTRUCT", payload: { selection_id: "occ.fact", construct_kind: "FACT", construct_id: "fact.consumption", delete_mode: "DELETE_TARGET", impact_token: "impact.runtime.token.fact.001" } });
  });

  it("Fact 删除在Runtime未启用或未返回impact token时不能提交", async () => {
    const { wrapper } = await mountWorkbench();
    api.commandCapabilities.mockResolvedValueOnce({ data: { allowed: ["DELETE_CONSTRUCT"], forbidden: [], capability_query_id: "query.delete.fact.disabled", options: [{ capability_query_id: "query.delete.fact.disabled", option_id: "option.delete.fact.disabled", command_type: "DELETE_CONSTRUCT", capability_ref: { capability_id: "CAP-ISO-PROC-001" }, display_name: "删除关系", group_path: ["Fact"], normalized_endpoints: [], required_fields: [], allowed_modifiers: [], symbol_descriptor: { id: "symbol.fact", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: false, reason_codes: ["DELETE_DEPENDENCY_EXISTS"], expires_with_revision: "revision.1", delete_mode: "DELETE_TARGET", delete_target: { kind: "FACT", id: "fact.consumption" }, impact_summary: { input_revision: "revision.1", selected_occurrence_id: "occ.fact", delete_mode: "DELETE_TARGET", target: { kind: "FACT", id: "fact.consumption" }, items: [{ kind: "FACT", id: "fact.consumption", effect: "DIRECT" }, { kind: "OCCURRENCE", id: "occ.fact", context_id: "context.root", effect: "BLOCKER" }], counts: { contexts: 0, occurrences: 1, elements: 0, features: 0, states: 0, facts: 1, opl_sentences: 1, traces: 1, findings: 0 } } }] } });

    await wrapper.get('[data-testid="p03-canvas-delete-fact"]').trigger("click");
    await flushPromises();
    const option = wrapper.get('[data-testid="p03-construct-delete-action"]');
    expect(option.attributes("disabled")).toBeDefined();
    expect(wrapper.get('[data-testid="p03-construct-actions-menu"]').text()).toContain("DELETE_DEPENDENCY_EXISTS");
    await option.trigger("click");
    expect(api.executeP0Command).not.toHaveBeenCalled();
  });

  it.each([
    ["object-process", "CAP-ISO-PROC-001"],
    ["process-object", "CAP-ISO-PROC-002"],
  ])("组合工具按 %s 方向匹配 Runtime 候选，不依赖返回顺序", async (gesture, capabilityId) => {
    const options = transformationOptions();
    api.commandCapabilities.mockImplementation((...args: unknown[]) => Promise.resolve({ data: {
      allowed: ["CREATE_FACT"], forbidden: [], capability_query_id: "query.procedural.1",
      options: args[6] ? options : [],
    } }));
    const { wrapper } = await mountWorkbench();
    await activateRelationCatalogItem(wrapper, "PROCEDURAL", "CAP-ISO-PROC-001");
    await wrapper.get(`[data-testid="p03-canvas-drag-${gesture}"]`).trigger("click");
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenCalledTimes(1);
    expect(api.executeP0Command.mock.calls[0]?.[4].payload).toMatchObject({
      capability_ref: { capability_id: capabilityId },
      normalized_endpoints: options.find((option) => option.capability_ref.capability_id === capabilityId)?.normalized_endpoints,
    });
    expect(api.commandCapabilities.mock.calls.filter((args) => args[6])).toHaveLength(2);
  });

  it.each(["disabled", "missing", "symbol"])("组合工具的消耗成员 %s 时仅允许生成方向", async (failure) => {
    const items = relationCatalog().flatMap((item) => {
      if (item.capability_id !== "CAP-ISO-PROC-001") return [item];
      if (failure === "missing") return [];
      return [{ ...item, enabled: failure !== "disabled", reason_codes: ["REVISION_STALE"],
        symbol_descriptor: { ...item.symbol_descriptor, id: failure === "symbol" ? "symbol.unknown" : item.symbol_descriptor.id } }];
    });
    api.relationCatalog.mockResolvedValue({ data: { items } });
    api.commandCapabilities.mockImplementation((...args: unknown[]) => Promise.resolve({ data: {
      allowed: ["CREATE_FACT"], forbidden: [], capability_query_id: "query.procedural.1",
      options: args[6] ? transformationOptions() : [],
    } }));
    const { wrapper } = await mountWorkbench();
    const tool = wrapper.get('[data-testid="p03-relation-quick-option-CAP-ISO-PROC-001"]');
    expect(tool.attributes("disabled")).toBeUndefined();
    expect(tool.attributes("title")).toContain("消耗关系 / Consumption Link：");
    await tool.trigger("click");
    await wrapper.get('[data-testid="p03-canvas-drag-object-process"]').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).not.toHaveBeenCalled();
    await tool.trigger("click");
    await wrapper.get('[data-testid="p03-canvas-drag-process-object"]').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenCalledTimes(1);
    expect(api.executeP0Command.mock.calls[0]?.[4].payload.capability_ref).toEqual({ capability_id: "CAP-ISO-PROC-002" });
  });

  it.each(["opposite", "empty", "stale", "object-object", "process-process"])("组合工具 %s 时不提交或反向回退", async (scenario) => {
    let queries = 0;
    api.commandCapabilities.mockImplementation((...args: unknown[]) => {
      if (args[6]) queries += 1;
      const options = transformationOptions();
      return Promise.resolve({ data: {
        allowed: ["CREATE_FACT"], forbidden: [], capability_query_id: "query.procedural.1",
        options: !args[6] || scenario === "empty" || (scenario === "stale" && queries === 2)
          ? [] : scenario === "opposite" ? options.slice(0, 1) : options,
      } });
    });
    const { wrapper } = await mountWorkbench();
    await activateRelationCatalogItem(wrapper, "PROCEDURAL", "CAP-ISO-PROC-001");
    const gesture = scenario === "object-object" ? "object-product" : scenario === "process-process" ? "process-handler" : "object-process";
    await wrapper.get(`[data-testid="p03-canvas-drag-${gesture}"]`).trigger("click");
    await flushPromises();
    expect(api.executeP0Command).not.toHaveBeenCalled();
    expect(wrapper.get(".revision-tag").text()).toContain("revision.1");
  });

  it.each(["readonly", "disabled"])("组合工具在 %s 时禁用", async (mode) => {
    if (mode === "disabled") api.relationCatalog.mockResolvedValue({ data: { items: relationCatalog().map((item) =>
      ["CAP-ISO-PROC-001", "CAP-ISO-PROC-002"].includes(item.capability_id) ? { ...item, enabled: false } : item) } });
    const { wrapper } = await mountWorkbench(mode === "readonly" ? "?revision=revision.1" : "");
    const tool = wrapper.get('[data-testid="p03-relation-quick-option-CAP-ISO-PROC-001"]');
    expect(tool.attributes("disabled")).toBeDefined();
    await tool.trigger("click");
    await wrapper.get('[data-testid="p03-canvas-drag-object-process"]').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).not.toHaveBeenCalled();
  });

  it("唯一匹配的普通过程关系在端点松开后直接提交", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => {
      const endpointIds = args[6] as string[] | undefined;
      if (endpointIds?.length === 2) return Promise.resolve({ data: {
        allowed: ["CREATE_FACT"], forbidden: [], capability_query_id: "query.procedural.1",
        options: [
          relationOption("CAP-ISO-PROC-002", "Result", [endpoint("RESULT_PROCESS", "ELEMENT", "element.process", 0), endpoint("RESULT_OBJECT", "ELEMENT", "element.object", 1)]),
          relationOption("CAP-ISO-PROC-004", "Agent", [endpoint("AGENT_OBJECT", "ELEMENT", "element.object", 0), endpoint("ENABLED_PROCESS", "ELEMENT", "element.process", 1)]),
          relationOption("CAP-ISO-PROC-005", "Instrument", [endpoint("INSTRUMENT_OBJECT", "ELEMENT", "element.object", 0), endpoint("ENABLED_PROCESS", "ELEMENT", "element.process", 1)]),
        ],
      } });
      return Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } });
    });
    const { wrapper } = await mountWorkbench();

    await activateRelationCatalogItem(wrapper, "PROCEDURAL", "CAP-ISO-PROC-002");
    expect(wrapper.find('[data-testid="p03-right-panel"]').exists()).toBe(false);
    await wrapper.get('[data-testid="p03-canvas-drag-process-object"]').trigger("click");
    await flushPromises();

    expect(wrapper.find('[data-testid="p03-relation-preview"]').exists()).toBe(false);
    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", expect.objectContaining({
      commandType: "CREATE_FACT",
      payload: expect.objectContaining({
        fact_family: "TRANSFORMATION",
        capability_ref: { capability_id: "CAP-ISO-PROC-002" },
        normalized_endpoints: [
          { role: "RESULT_PROCESS", target_ref: { target_kind: "ELEMENT", target_id: "element.process" }, ordinal: 0 },
          { role: "RESULT_OBJECT", target_ref: { target_kind: "ELEMENT", target_id: "element.object" }, ordinal: 1 },
        ],
      }),
    }));
  });

  it("需要参数的候选 preview 将 endpoint 身份作为只读 capture view state 输出", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => {
      const endpointIds = args[6] as string[] | undefined;
      if (endpointIds?.length === 2) return Promise.resolve({ data: {
        allowed: ["CREATE_FACT"], capability_query_id: "query.preview.1",
        options: [relationOption("CAP-ISO-PROC-015", "Overtime Exception", [endpoint("MONITORED_PROCESS", "ELEMENT", "element.process", 0), endpoint("HANDLING_PROCESS", "ELEMENT", "element.process.handler", 1)], true)],
      } });
      return Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } });
    });
    const { wrapper } = await mountWorkbench();

    await activateRelationCatalogItem(wrapper, "PROCEDURAL", "CAP-ISO-PROC-015");
    await wrapper.get('[data-testid="p03-canvas-drag-process-handler"]').trigger("click");
    await flushPromises();

    const state = wrapper.get('[data-testid="p03-capture-view-state"]');
    expect(state.attributes("data-relation-candidate-state")).toBe("preview");
    expect(state.attributes("data-relation-candidate-source-target-id")).toBe("element.process");
    expect(state.attributes("data-relation-candidate-target-target-id")).toBe("element.process.handler");
  });

  it("Exception Link 未填写 duration 时不提交，填写后使用 Runtime option 提交", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => {
      const endpointIds = args[6] as string[] | undefined;
      if (endpointIds?.length === 2) return Promise.resolve({ data: {
        allowed: ["CREATE_FACT"], forbidden: [], capability_query_id: "query.exception.1",
        options: [relationOption("CAP-ISO-PROC-015", "Overtime Exception", [endpoint("MONITORED_PROCESS", "ELEMENT", "element.process", 0), endpoint("HANDLING_PROCESS", "ELEMENT", "element.process.handler", 1)], true)],
      } });
      return Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } });
    });
    const { wrapper } = await mountWorkbench();

    await activateRelationCatalogItem(wrapper, "PROCEDURAL", "CAP-ISO-PROC-015");
    await wrapper.get('[data-testid="p03-canvas-drag-process-handler"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-relation-duration"]').attributes("required")).toBeDefined();
    expect(wrapper.find('[data-testid="p03-relation-preview-confirm"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="p03-right-panel"]').exists()).toBe(false);
    expect(api.executeP0Command).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="p03-relation-duration"]').setValue("PT5M");
    await wrapper.get('[data-testid="p03-relation-candidate"]').trigger("submit");
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", expect.objectContaining({
      commandType: "CREATE_FACT",
      payload: expect.objectContaining({
        fact_family: "PROFILE_FACT",
        capability_ref: { capability_id: "CAP-ISO-PROC-015" },
        modifiers: [{ modifier_id: "duration", value: "PT5M" }],
      }),
    }));
  });

  it("Effect 累计三个端点后才查询并提交 Runtime 规范化候选", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => {
      const endpointIds = args[6] as string[] | undefined;
      if (endpointIds?.length === 3) return Promise.resolve({ data: {
        allowed: ["CREATE_FACT"], forbidden: [], capability_query_id: "query.effect.1",
        options: [relationOption("CAP-ISO-PROC-003", "Effect", [endpoint("AFFECTEE", "ELEMENT", "element.object", 0), endpoint("AFFECTING_PROCESS", "ELEMENT", "element.process", 1), endpoint("AFFECTED", "ELEMENT", "element.object.product", 2)])],
      } });
      return Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } });
    });
    const { wrapper } = await mountWorkbench();

    await activateRelationCatalogItem(wrapper, "PROCEDURAL", "CAP-ISO-PROC-003");
    await wrapper.get('[data-testid="p03-canvas-drag-object-process"]').trigger("click");
    expect(api.commandCapabilities).not.toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", undefined, "CREATE_FACT", ["element.object", "element.process"]);
    await wrapper.get('[data-testid="p03-canvas-drag-process-product"]').trigger("click");
    await flushPromises();
    expect(api.commandCapabilities).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", undefined, "CREATE_FACT", ["element.object", "element.process", "element.object.product"]);
    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", expect.objectContaining({
      commandType: "CREATE_FACT",
      payload: expect.objectContaining({
        capability_ref: { capability_id: "CAP-ISO-PROC-003" },
        normalized_endpoints: [
          { role: "AFFECTEE", target_ref: { target_kind: "ELEMENT", target_id: "element.object" }, ordinal: 0 },
          { role: "AFFECTING_PROCESS", target_ref: { target_kind: "ELEMENT", target_id: "element.process" }, ordinal: 1 },
          { role: "AFFECTED", target_ref: { target_kind: "ELEMENT", target_id: "element.object.product" }, ordinal: 2 },
        ],
      }),
    }));
  });

  it("Control 仅从已选 Fact 的 Runtime option 提交原子 Modifier 对", async () => {
    api.relationCatalog.mockResolvedValue({ data: { items: relationCatalog(true) } });
    api.commandCapabilities.mockImplementation((...args: unknown[]) => {
      if (args[4] === "fact.consumption" && args[5] === "UPDATE_FACT") return Promise.resolve({ data: {
        allowed: ["UPDATE_FACT"], forbidden: [], capability_query_id: "query.control.1",
        options: [{ capability_query_id: "query.control.1", option_id: "option.control.1", command_type: "UPDATE_FACT", capability_ref: { capability_id: "CAP-ISO-CTRL-001" }, base_fact_capability_ref: { capability_id: "CAP-ISO-PROC-001" }, display_name: "Transforming Event", group_path: ["控制关系"], normalized_endpoints: [], required_fields: [], allowed_modifiers: [
          { modifier_id: "control.capability", value_options: ["CAP-ISO-CTRL-001"], min_occurs: 1, max_occurs: 1, atomic_group_id: "iso-control" },
          { modifier_id: "control.segment", value_options: ["PROCESS_INPUT"], min_occurs: 1, max_occurs: 1, atomic_group_id: "iso-control" },
        ], symbol_descriptor: { id: "symbol.control.e", version: "0.1.0", digest: "digest" }, template_family: { id: "opl.control.event.transforming.v1", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1" }],
      } });
      return Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } });
    });
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-select-consumption"]').trigger("click");
    await activateRelationCatalogItem(wrapper, "CONTROL", "CAP-ISO-CTRL-001");
    await flushPromises();
    expect(api.relationCatalog).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", "fact.consumption");
    expect(wrapper.get('[data-testid="p03-control-preview"]').text()).toContain("转换事件 / Transforming Event");
    expect(api.executeP0Command).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="p03-control-preview-confirm"]').trigger("click");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "UPDATE_FACT",
      payload: {
        fact_id: "fact.consumption",
        expected_capability_ref: { capability_id: "CAP-ISO-PROC-001" },
        replacement: { modifiers: [
          { modifier_id: "control.capability", value: "CAP-ISO-CTRL-001" },
          { modifier_id: "control.segment", value: "PROCESS_INPUT" },
        ] },
        capability_query_id: "query.control.1",
        selected_option_id: "option.control.1",
      },
    });
  });

  it("已附加 Control 的 Fact 仅显示移除 Control，并保留基础 Fact 身份", async () => {
    api.projection.mockImplementation((_project, _model, context: string, revision: string) => Promise.resolve({ meta: { read_revision: revision }, data: { context_id: context,
      constructs: [{
        occurrence_id: "occ.fact", target_id: "fact.consumption", target_kind: "FACT", construct_role: "CONSUMPTION_LINK",
        capability_id: "CAP-ISO-PROC-001", layout: { x: 250, y: 116, width: 160, height: 2, z_order: 3 },
        endpoints: [endpoint("CONSUMED_OBJECT", "ELEMENT", "element.object", 0), endpoint("CONSUMING_PROCESS", "ELEMENT", "element.process", 1)],
        modifiers: [{ modifier_id: "control.capability", value: "CAP-ISO-CTRL-001" }, { modifier_id: "control.segment", value: "PROCESS_INPUT" }],
      }],
      suppressed_states: [],
    } }));
    api.commandCapabilities.mockImplementation((...args: unknown[]) => args[4] === "fact.consumption" && args[5] === "UPDATE_FACT"
      ? Promise.resolve({ data: {
        allowed: ["UPDATE_FACT"], forbidden: [], capability_query_id: "query.control.remove.1",
        options: [{ capability_query_id: "query.control.remove.1", option_id: "option.control.remove.1", command_type: "UPDATE_FACT", capability_ref: { capability_id: "CAP-ISO-PROC-001" }, base_fact_capability_ref: { capability_id: "CAP-ISO-PROC-001" }, display_name: "移除 Control", group_path: ["Control", "Remove"], normalized_endpoints: [], required_fields: [{ field_id: "replacement.modifiers", field_kind: "LIST", required: true }], allowed_modifiers: [], symbol_descriptor: { id: "symbol.control.remove", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1" }],
      } })
      : Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } }));
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-delete-fact"]').trigger("click");
    await flushPromises();
    expect(api.commandCapabilities).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", "fact.consumption", "UPDATE_FACT");
    expect(wrapper.get('[data-testid="p03-construct-actions-menu"]').text()).toContain("移除 Control");
    await wrapper.get('[data-testid="p03-construct-delete-action"]').trigger("click");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "UPDATE_FACT",
      payload: {
        fact_id: "fact.consumption",
        expected_capability_ref: { capability_id: "CAP-ISO-PROC-001" },
        replacement: { modifiers: [] },
        capability_query_id: "query.control.remove.1",
        selected_option_id: "option.control.remove.1",
      },
    });
  });

  it("Structural 参数候选使用画布浮层提交，切换工具时静默取消", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => {
      const endpointIds = args[6] as string[] | undefined;
      if (endpointIds?.length === 2) return Promise.resolve({ data: {
        allowed: ["CREATE_FACT"], forbidden: [], capability_query_id: "query.structural.1",
        options: [{
          capability_query_id: "query.structural.1", option_id: "option.structural.1", command_type: "CREATE_FACT", capability_ref: { capability_id: "CAP-ISO-STRUCT-003" },
          display_name: "Bidirectional Tagged", group_path: ["结构关系"],
          normalized_endpoints: [endpoint("STRUCTURAL_SOURCE", "ELEMENT", "element.object", 0), endpoint("STRUCTURAL_TARGET", "ELEMENT", "element.object.product", 1)],
          required_fields: [
            { field_id: "normalized_endpoints", field_kind: "ENDPOINT", required: true },
            { field_id: "direction", field_kind: "ENUM", required: true, allowed_values: ["BIDIRECTIONAL"] },
            { field_id: "labels", field_kind: "LIST", required: true, allowed_values: ["forward_tag", "reverse_tag"] },
          ], allowed_modifiers: [], symbol_descriptor: { id: "symbol.link.structural.tagged.bidirectional", version: "0.1.0", digest: "digest" },
          template_family: { id: "opl.structural.tagged.bidirectional.v1", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1",
        }],
      } });
      return Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } });
    });
    const { wrapper } = await mountWorkbench();

    await activateRelationCatalogItem(wrapper, "STRUCTURAL", "CAP-ISO-STRUCT-003");
    await wrapper.get('[data-testid="p03-canvas-drag-object-product"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-relation-preview"]').exists()).toBe(true);
    expect(wrapper.find('[data-testid="p03-right-panel"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="p03-relation-preview-confirm"]').exists()).toBe(false);
    await activateRelationCatalogItem(wrapper, "STRUCTURAL", "CAP-ISO-STRUCT-007");
    expect(wrapper.find('[data-testid="p03-relation-candidate"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="p03-capture-view-state"]').attributes("data-relation-candidate-capability-id")).toBe("");
    expect(wrapper.get('[data-testid="p03-relation-quick-option-CAP-ISO-STRUCT-007"]').classes()).toContain("is-active");
    expect(wrapper.find('[data-testid="p03-command-feedback"]').exists()).toBe(false);
    expect(api.executeP0Command).not.toHaveBeenCalled();

    await activateRelationCatalogItem(wrapper, "STRUCTURAL", "CAP-ISO-STRUCT-003");
    await wrapper.get('[data-testid="p03-canvas-drag-object-product"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-relation-preview-cancel"]').trigger("click");
    expect(wrapper.find('[data-testid="p03-relation-candidate"]').exists()).toBe(false);

    await activateRelationCatalogItem(wrapper, "STRUCTURAL", "CAP-ISO-STRUCT-003");
    await wrapper.get('[data-testid="p03-canvas-drag-object-product"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-relation-candidate"]').trigger("keydown", { key: "Escape" });
    expect(wrapper.find('[data-testid="p03-relation-candidate"]').exists()).toBe(false);

    await activateRelationCatalogItem(wrapper, "STRUCTURAL", "CAP-ISO-STRUCT-003");
    await wrapper.get('[data-testid="p03-canvas-drag-object-product"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-structural-label-forward_tag"]').setValue("contains");
    await wrapper.get('[data-testid="p03-structural-label-reverse_tag"]').setValue("belongs to");
    await wrapper.get('[data-testid="p03-relation-candidate"]').trigger("submit");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", expect.objectContaining({
      commandType: "CREATE_FACT",
      payload: expect.objectContaining({
        fact_family: "STRUCTURAL",
        direction: "BIDIRECTIONAL",
        labels: [{ slot_id: "forward_tag", text: "contains" }, { slot_id: "reverse_tag", text: "belongs to" }],
      }),
    }));
  });

  it("普通关系直接创建后可切换工具且已提交关系不受影响", async () => {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => {
      const endpointIds = args[6] as string[] | undefined;
      if (endpointIds?.length === 2) return Promise.resolve({ data: {
        allowed: ["CREATE_FACT"], forbidden: [], capability_query_id: "query.consumption.1",
        options: [relationOption("CAP-ISO-PROC-001", "Consumption", [
          endpoint("CONSUMED_OBJECT", "ELEMENT", "element.object", 0),
          endpoint("CONSUMING_PROCESS", "ELEMENT", "element.process", 1),
        ])],
      } });
      return Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } });
    });
    const { wrapper } = await mountWorkbench();
    api.workspaceSession.mockResolvedValue({ meta: { read_revision: "revision.2" }, data: { model: { head_revision: "revision.2", project_id: "project.1", model_id: "model.1", name: "生产模型", profile_id: "profile.iso", profile_version: "0.1.0", access_mode: "EDITABLE_DRAFT" }, root_context_id: "context.root", current_context_id: "context.root" } });

    await activateRelationCatalogItem(wrapper, "PROCEDURAL", "CAP-ISO-PROC-001");
    await wrapper.get('[data-testid="p03-canvas-drag-object-process"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="p03-relation-candidate"]').exists()).toBe(false);
    expect(api.executeP0Command).toHaveBeenCalledTimes(1);

    await activateRelationCatalogItem(wrapper, "PROCEDURAL", "CAP-ISO-PROC-004");
    expect(wrapper.get('[data-testid="p03-relation-quick-option-CAP-ISO-PROC-004"]').classes()).toContain("is-active");
    expect(api.executeP0Command).toHaveBeenCalledTimes(1);
  });

  function configureStructuralUpdateApi() {
    api.commandCapabilities.mockImplementation((...args: unknown[]) => {
      if (args[4] === "fact.structural" && args[5] === "UPDATE_FACT") return Promise.resolve({ data: {
        allowed: ["UPDATE_FACT"], forbidden: [], capability_query_id: "query.structural.update.1",
        options: [{
          capability_query_id: "query.structural.update.1", option_id: "option.structural.update.1", command_type: "UPDATE_FACT", capability_ref: { capability_id: "CAP-ISO-STRUCT-010" },
          display_name: "State-specified Tagged", group_path: ["结构关系"],
          normalized_endpoints: [endpoint("STATE_TAGGED_SOURCE", "STATE", "state.material.ready", 0), endpoint("STATE_TAGGED_TARGET", "ELEMENT", "element.object.product", 1)],
          required_fields: [
            { field_id: "direction", field_kind: "ENUM", required: true, allowed_values: ["DIRECTED", "BIDIRECTIONAL"] },
            { field_id: "labels", field_kind: "LIST", required: true, allowed_values: ["forward_tag", "reverse_tag"] },
          ], allowed_modifiers: [], symbol_descriptor: { id: "symbol.link.structural.tagged.state", version: "0.1.0", digest: "digest" },
          template_family: { id: "opl.structural.tagged.state.v1", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1",
        }],
      } });
      return Promise.resolve({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } });
    });
  }

  it("Structural Fact 编辑采用 Runtime UPDATE_FACT option 提交方向和标签", async () => {
    configureStructuralUpdateApi();
    const { wrapper } = await mountWorkbench();
    await wrapper.get('[data-testid="p03-canvas-select-structural"]').trigger("click");
    await openRightPanel(wrapper);
    await wrapper.get('[data-testid="p03-structural-update-open"]').trigger("click");
    await flushPromises();
    expect(api.commandCapabilities).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", "fact.structural", "UPDATE_FACT");
    await wrapper.get('[data-testid="p03-structural-update-label-forward_tag"]').setValue("owns");
    await wrapper.get('[data-testid="p03-structural-update-label-reverse_tag"]').setValue("belongs to");
    await wrapper.get('[data-testid="p03-structural-update"] select').setValue("BIDIRECTIONAL");
    await wrapper.get('[data-testid="p03-structural-update"]').trigger("submit");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "UPDATE_FACT",
      payload: {
        fact_id: "fact.structural",
        expected_capability_ref: { capability_id: "CAP-ISO-STRUCT-010" },
        replacement: {
          direction: "BIDIRECTIONAL",
          labels: [{ slot_id: "forward_tag", text: "owns" }, { slot_id: "reverse_tag", text: "belongs to" }],
        },
        capability_query_id: "query.structural.update.1",
        selected_option_id: "option.structural.update.1",
      },
    });
  });

  it("连线上改名复核候选并且只提交 labels，失败保留后可以重试", async () => {
    configureStructuralUpdateApi();
    const { wrapper } = await mountWorkbench();
    await wrapper.get('[data-testid="p03-canvas-edit-relation-label"]').trigger("click");
    await flushPromises();
    expect(wrapper.find('[data-testid="p03-right-panel"]').exists()).toBe(false);
    const input = wrapper.get('[data-testid="p03-relation-rename-forward_tag"]');
    expect((input.element as HTMLInputElement).value).toBe("owns");
    await input.setValue("supplies");
    api.executeP0Command.mockRejectedValueOnce(new LocalRuntimeApiError("PERSISTENCE_FAILED", "保存失败"));
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect((input.element as HTMLInputElement).value).toBe("supplies");
    expect(wrapper.text()).toContain("保存失败");
    expect(api.executeP0Command.mock.calls[0][4]).toEqual({ commandType: "UPDATE_FACT", payload: {
      fact_id: "fact.structural", expected_capability_ref: { capability_id: "CAP-ISO-STRUCT-010" },
      replacement: { labels: [{ slot_id: "forward_tag", text: "supplies" }] },
      capability_query_id: "query.structural.update.1", selected_option_id: "option.structural.update.1",
    } });
    await input.trigger("keydown", { key: "Enter" });
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenCalledTimes(2);
    expect(wrapper.find('[data-testid="p03-relation-label-editor"]').exists()).toBe(false);
    expect(api.commandCapabilities.mock.calls.filter((args) => args[4] === "fact.structural" && args[5] === "UPDATE_FACT")).toHaveLength(3);
    wrapper.unmount();
  });

  it("改名提交前复核期间切换选择将取消旧编辑，重复 Enter 不重复写入", async () => {
    configureStructuralUpdateApi();
    const { wrapper } = await mountWorkbench();
    await wrapper.get('[data-testid="p03-canvas-edit-relation-label"]').trigger("click");
    await flushPromises();
    const capabilities = await api.commandCapabilities("project.1", "model.1", "context.root", "revision.1", "fact.structural", "UPDATE_FACT");
    let release!: (value: unknown) => void;
    api.commandCapabilities.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const input = wrapper.get('[data-testid="p03-relation-rename-forward_tag"]');
    await input.setValue("supplies");
    await input.trigger("keydown", { key: "Enter" });
    await input.trigger("keydown", { key: "Enter" });
    expect((input.element as HTMLInputElement).disabled).toBe(true);
    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    release(capabilities);
    await flushPromises();
    expect(api.executeP0Command).not.toHaveBeenCalled();
    expect(wrapper.find('[data-testid="p03-relation-label-editor"]').exists()).toBe(false);
    wrapper.unmount();
  });

  it.each(["same", "blank", "escape", "ime", "stale", "selection", "no-labels", "readonly"])("连线上改名 %s 不产生命令", async (scenario) => {
    configureStructuralUpdateApi();
    if (scenario === "readonly") {
      const session = await api.workspaceSession();
      session.data.model.access_mode = "READ_ONLY_SNAPSHOT";
      api.workspaceSession.mockResolvedValue(session);
    }
    if (scenario === "no-labels") {
      const capabilities = await api.commandCapabilities("project.1", "model.1", "context.root", "revision.1", "fact.structural", "UPDATE_FACT");
      capabilities.data.options[0].required_fields = [];
      api.commandCapabilities.mockResolvedValue(capabilities);
    }
    const { wrapper } = await mountWorkbench();
    await wrapper.get('[data-testid="p03-canvas-edit-relation-label"]').trigger("click");
    await flushPromises();
    if (scenario !== "readonly" && scenario !== "no-labels") {
      const input = wrapper.get('[data-testid="p03-relation-rename-forward_tag"]');
      if (scenario !== "same") await input.setValue(scenario === "blank" ? "   " : "supplies");
      if (scenario === "ime") await input.trigger("compositionstart");
      if (scenario === "stale") api.commandCapabilities.mockResolvedValue({ data: { allowed: [], forbidden: [], options: [] } });
      if (scenario === "selection") await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
      else await input.trigger("keydown", { key: scenario === "escape" ? "Escape" : "Enter" });
      await flushPromises();
      const retained = ["blank", "ime", "stale"].includes(scenario);
      expect(wrapper.find('[data-testid="p03-relation-label-editor"]').exists()).toBe(retained);
    } else expect(wrapper.find('[data-testid="p03-relation-label-editor"]').exists()).toBe(false);
    expect(api.executeP0Command).not.toHaveBeenCalled();
    wrapper.unmount();
  });

  it("冲突显示可恢复提示，State 在未选择 Object 时禁用", async () => {
    api.executeP0Command.mockRejectedValueOnce(new LocalRuntimeApiError("REVISION_CONFLICT", "基础修订不是当前草稿"));
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("基础修订不是当前草稿");

    expect(wrapper.get('[data-testid="p03-tool-state"]').attributes("disabled")).toBeDefined();
  });
});

function endpoint(role: string, targetKind: "ELEMENT" | "STATE" | "FEATURE", targetId: string, ordinal: number) {
  return { role, target_ref: { target_kind: targetKind, target_id: targetId }, ordinal };
}

function stateDeleteOption(mode: "REMOVE_OCCURRENCE" | "DELETE_TARGET" | "CASCADE") {
  const occurrence = mode === "REMOVE_OCCURRENCE";
  return {
    capability_query_id: "query.delete.direct",
    option_id: `option.delete.${mode.toLowerCase()}`,
    command_type: "DELETE_CONSTRUCT",
    capability_ref: { capability_id: "CAP-STATE-001" },
    display_name: "删除 State",
    group_path: ["Object", "State"],
    normalized_endpoints: [],
    required_fields: [],
    allowed_modifiers: [],
    symbol_descriptor: { id: "symbol.state", version: "0.1.0", digest: "digest" },
    template_family: { id: "grammar", version: "0.1.0", digest: "digest" },
    rule_refs: [],
    enabled: true,
    reason_codes: [],
    expires_with_revision: "revision.1",
    delete_mode: mode,
    delete_target: { kind: occurrence ? "OCCURRENCE" : "STATE", id: occurrence ? "occ.state" : "state.material.ready" },
    impact_summary: {
      input_revision: "revision.1", selected_occurrence_id: "occ.state", delete_mode: mode,
      target: { kind: occurrence ? "OCCURRENCE" : "STATE", id: occurrence ? "occ.state" : "state.material.ready" },
      items: [],
      counts: { contexts: 0, occurrences: 1, elements: 0, features: 0, states: occurrence ? 0 : 1, facts: 0, opl_sentences: 0, traces: 0, findings: 0 },
    },
    impact_token: `impact.runtime.token.${mode.toLowerCase()}`,
  };
}

function nameEditCapabilities(targetKind: "ELEMENT" | "FEATURE" = "ELEMENT", targetId = "element.object", capabilityId = "CAP-OBJECT-001") {
  return {
    allowed: ["UPDATE_PROPERTY"],
    forbidden: [],
    capability_query_id: "query.property.1",
    options: [{
      capability_query_id: "query.property.1",
      option_id: "option.property.1",
      command_type: "UPDATE_PROPERTY",
      capability_ref: { capability_id: capabilityId },
      display_name: "编辑 Object 名称",
      group_path: ["Element", "名称"],
      normalized_endpoints: [endpoint("PROPERTY_TARGET", targetKind, targetId, 0)],
      required_fields: [
        { field_id: "target_ref", field_kind: "ENDPOINT", required: true, allowed_values: [] },
        { field_id: "property_name", field_kind: "ENUM", required: true, allowed_values: ["name"] },
        { field_id: "value", field_kind: "TEXT", required: true, allowed_values: [] },
      ],
      allowed_modifiers: [],
      symbol_descriptor: { id: "symbol.object.basic", version: "0.1.0", digest: "digest" },
      template_family: { id: "opl.runtime", version: "0.1.0", digest: "digest" },
      rule_refs: [],
      enabled: true,
      reason_codes: [],
      expires_with_revision: "revision.1",
    }],
  };
}

function releaseVisualCommonFaultCommand() {
  return {
    command_id: "command.visual.blocked-feedback.persistence-failed" as const,
    command_type: "CREATE_FACT" as const,
    payload: {
      kind: "CONSUMPTION" as const,
      fact_id: "fact.visual.blocked-feedback.one-shot" as const,
      object_id: "element.visual.blocked-feedback.input" as const,
      process_id: "element.visual.blocked-feedback.process" as const,
      layout: { x: 340 as const, y: 266 as const },
    },
  };
}

function operationRecord(suffix: string, diagnosticId: string) {
  return {
    operation_record_id: `operation.${suffix}`,
    project_id: "project.1",
    model_id: "model.1",
    operation_id: `operation.${suffix}`,
    aggregate_id: "model.1",
    command_id: `command.${suffix}`,
    input_revision_id: "revision.1",
    result_revision_id: null,
    result_status: "BLOCKED",
    diagnostic_id: diagnosticId,
    occurred_at: "2026-07-28T00:00:00Z",
  };
}

function transformationOptions() {
  return [
    relationOption("CAP-ISO-PROC-002", "Result", [endpoint("RESULT_OBJECT", "ELEMENT", "element.object", 1), endpoint("RESULT_PROCESS", "ELEMENT", "element.process", 0)]),
    relationOption("CAP-ISO-PROC-001", "Consumption", [endpoint("CONSUMED_OBJECT", "ELEMENT", "element.object", 0), endpoint("CONSUMING_PROCESS", "ELEMENT", "element.process", 1)]),
  ];
}

function relationOption(capabilityId: string, displayName: string, normalizedEndpoints: ReturnType<typeof endpoint>[], requiresDuration = false) {
  return {
    capability_query_id: "query.procedural.1",
    option_id: `option.${capabilityId.toLowerCase()}`,
    command_type: "CREATE_FACT",
    capability_ref: { capability_id: capabilityId },
    display_name: displayName,
    group_path: ["Procedural"],
    normalized_endpoints: normalizedEndpoints,
    required_fields: requiresDuration ? [{ field_id: "duration", field_kind: "TEXT", required: true }] : [],
    allowed_modifiers: requiresDuration ? [{ modifier_id: "duration" }] : [],
    symbol_descriptor: { id: "symbol.link.procedural", version: "0.1.0", digest: "digest" },
    template_family: { id: "opl.procedural", version: "0.1.0", digest: "digest" },
    rule_refs: [],
    enabled: true,
    reason_codes: [],
    expires_with_revision: "revision.1",
  };
}

function relationCatalog(controlEnabled = false) {
  const symbolIds = {
    PROCEDURAL: [
      "symbol.link.consumption", "symbol.link.result", "symbol.link.effect", "symbol.link.agent", "symbol.link.instrument",
      "symbol.link.consumption.state", "symbol.link.result.state", "symbol.link.effect.state.input-output", "symbol.link.effect.state.input",
      "symbol.link.effect.state.output", "symbol.link.agent.state", "symbol.link.instrument.state", "symbol.link.invocation",
      "symbol.link.invocation.self", "symbol.link.exception.overtime", "symbol.link.exception.undertime",
    ],
    CONTROL: [
      "symbol.control.event.transforming", "symbol.control.event.enabling", "symbol.control.event.transforming.state", "symbol.control.event.enabling.state",
      "symbol.control.condition.transforming", "symbol.control.condition.enabling", "symbol.control.condition.transforming.state", "symbol.control.condition.enabling.state",
    ],
    STRUCTURAL: [
      "symbol.link.structural.tagged.unidirectional", "symbol.link.structural.null-tagged.unidirectional", "symbol.link.structural.tagged.bidirectional",
      "symbol.link.structural.tagged.reciprocal", "symbol.link.structural.aggregation", "symbol.link.structural.exhibition",
      "symbol.link.structural.generalization", "symbol.link.structural.classification", "symbol.link.structural.exhibition.state",
      "symbol.link.structural.tagged.state",
    ],
  } as const;
  const item = (family: "PROCEDURAL" | "CONTROL" | "STRUCTURAL", index: number) => ({
    family,
    capability_id: `CAP-ISO-${family === "PROCEDURAL" ? "PROC" : family === "CONTROL" ? "CTRL" : "STRUCT"}-${String(index).padStart(3, "0")}`,
    display_name: `${family} ${index}`,
    symbol_id: symbolIds[family][index - 1]!,
    interaction_mode: family === "CONTROL" ? "UPDATE_SELECTED_FACT" : "CREATE_FACT",
    symbol_descriptor: {
      id: symbolIds[family][index - 1]!,
      version: "0.1.0",
      digest: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    },
    endpoint_summary: {
      min_endpoints: family === "CONTROL" ? 1 : family === "PROCEDURAL" && index === 3 ? 3 : 2,
      max_endpoints: family === "CONTROL" ? 1 : family === "PROCEDURAL" && index === 3 ? 3 : 2,
      roles: [{
        role: family === "CONTROL" ? "BASE_PROCEDURAL_FACT" : "ENDPOINT",
        target_kinds: family === "CONTROL" ? ["FACT"] : ["ELEMENT", "STATE"],
        min_occurs: 1,
        max_occurs: 1,
        state_qualification_allowed: family !== "CONTROL",
      }],
    },
    enabled: family !== "CONTROL" || controlEnabled,
    reason_codes: family === "CONTROL" && !controlEnabled ? ["CONTROL_REQUIRES_BASE_FACT"] : [],
  });
  return [
    ...Array.from({ length: 16 }, (_, index) => item("PROCEDURAL", index + 1)),
    ...Array.from({ length: 8 }, (_, index) => item("CONTROL", index + 1)),
    ...Array.from({ length: 10 }, (_, index) => item("STRUCTURAL", index + 1)),
  ];
}
