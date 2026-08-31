import { createPinia, setActivePinia } from "pinia";
import { flushPromises, mount } from "@vue/test-utils";
import { createMemoryHistory, createRouter } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import WorkbenchView from "./WorkbenchView.vue";
import { LocalRuntimeApiError, localRuntimeApi } from "@/shared/api/localRuntimeApi";

vi.mock("@/shared/api/localRuntimeApi", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/shared/api/localRuntimeApi")>();
  return {
    ...actual,
    localRuntimeApi: {
      workspaceSession: vi.fn(),
      getProject: vi.fn(),
      navigation: vi.fn(),
      projection: vi.fn(),
      commandCapabilities: vi.fn(),
      textProjection: vi.fn(),
      revisions: vi.fn(),
      executeP0Command: vi.fn(),
      validate: vi.fn(),
    },
  };
});

const api = localRuntimeApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function configureApi() {
  api.getProject.mockResolvedValue({ project_id: "project.1", name: "仓储项目", archive_state: "ACTIVE", model_count: 1, updated_at: "2026-07-28T00:00:00Z" });
  api.workspaceSession.mockResolvedValue({ meta: { read_revision: "revision.1" }, data: { model: { project_id: "project.1", model_id: "model.1", name: "生产模型", profile_id: "profile.iso", profile_version: "0.1.0", access_mode: "EDITABLE_DRAFT" }, root_context_id: "context.root", current_context_id: "context.root" } });
  api.navigation.mockResolvedValue({ data: { process_tree: [{ context_id: "context.root", label: "SD", context_kind: "SYSTEM_DIAGRAM", has_children: false }], object_forest: [], views: [] } });
  api.projection.mockResolvedValue({ data: { constructs: [
    { occurrence_id: "occ.object", target_id: "element.object", construct_role: "OBJECT_NODE", label: "Material", layout: { x: 80, y: 80, width: 160, height: 72, z_order: 1 } },
    { occurrence_id: "occ.object.product", target_id: "element.object.product", construct_role: "OBJECT_NODE", label: "Product", layout: { x: 80, y: 240, width: 160, height: 72, z_order: 2 } },
    { occurrence_id: "occ.process", target_id: "element.process", construct_role: "PROCESS_NODE", label: "Transform", layout: { x: 420, y: 80, width: 168, height: 84, z_order: 2 } },
    { occurrence_id: "occ.process.handler", target_id: "element.process.handler", construct_role: "PROCESS_NODE", label: "Handle exception", layout: { x: 680, y: 80, width: 168, height: 84, z_order: 3 } },
    { occurrence_id: "occ.state", target_id: "state.material.ready", construct_role: "STATE_NODE", label: "Ready", owner_id: "element.object", state_roles: ["INITIAL"], explicitness: "EXPLICIT", fold_state: "UNFOLDED", layout: { x: 116, y: 118, width: 88, height: 28, z_order: 3 } },
    { occurrence_id: "occ.fact", target_id: "fact.consumption", construct_role: "CONSUMPTION_LINK", layout: { x: 250, y: 116, width: 160, height: 2, z_order: 3 }, source_id: "element.object", process_id: "element.process", source_occurrence_id: "occ.object", target_occurrence_id: "occ.process", symbol_ref: "symbol.link.consumption", layout_ref: "layout.fact", capability_id: "CAP-ISO-PROC-001", endpoints: [endpoint("CONSUMED_OBJECT", "ELEMENT", "element.object", 0), endpoint("CONSUMING_PROCESS", "ELEMENT", "element.process", 1)] },
    { occurrence_id: "occ.fact.structural", target_id: "fact.structural", construct_role: "STRUCTURAL_LINK", layout: { x: 250, y: 272, width: 160, height: 2, z_order: 3 }, symbol_ref: "symbol.link.structural.tagged.state", layout_ref: "layout.fact.structural", capability_id: "CAP-ISO-STRUCT-010", direction: "DIRECTED", labels: [{ slot_id: "forward_tag", text: "owns" }], collection_completeness: "NOT_APPLICABLE", endpoints: [endpoint("STATE_TAGGED_SOURCE", "STATE", "state.material.ready", 0), endpoint("STATE_TAGGED_TARGET", "ELEMENT", "element.object.product", 1)] },
  ], suppressed_states: [] } });
  api.commandCapabilities.mockResolvedValue({ data: { allowed: ["CREATE_ELEMENT", "CREATE_FACT"], forbidden: [], capability_query_id: "query.1", options: [] } });
  api.textProjection.mockResolvedValue({ data: { sentences: [{ sentence_id: "sentence.1", text: "Transform consumes Material.", ordinal: 0 }], traces: [{ sentence_id: "sentence.1", fact_ids: ["fact.consumption"], occurrence_ids: ["occ.object", "occ.process"] }] } });
  api.revisions.mockResolvedValue([{ revision_id: "revision.1", sequence: 1, kind: "DRAFT", created_at: "2026-07-28T00:00:00Z", immutable: true, blocking_count: 0 }]);
  api.executeP0Command.mockResolvedValue({ meta: { committed_revision: "revision.2", status: "COMMITTED", command_id: "command.1", autosave_state: "saved" }, data: { affected_ids: [], text_trace_ids: [], validation_summary: { blocking: 0, warning: 0, suggestion: 0, coverage_state: "INCOMPLETE" } } });
  api.validate.mockResolvedValue({ data: { task_id: "task.1", state: "COMPLETED", progress: 100 } });
}

async function mountWorkbench() {
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: "/projects/:projectId/models/:modelId/workbench", component: WorkbenchView }] });
  await router.push("/projects/project.1/models/model.1/workbench");
  await router.isReady();
  const wrapper = mount(WorkbenchView, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), router],
      stubs: {
        OpdCanvas: {
          emits: ["select", "placeState"],
          template: '<div><button data-testid="p03-canvas-select-object" type="button" @click="$emit(\'select\', \'element.object\')" /><button data-testid="p03-canvas-select-product" type="button" @click="$emit(\'select\', \'element.object.product\')" /><button data-testid="p03-canvas-select-process" type="button" @click="$emit(\'select\', \'element.process\')" /><button data-testid="p03-canvas-select-handler-process" type="button" @click="$emit(\'select\', \'element.process.handler\')" /><button data-testid="p03-canvas-select-state" type="button" @click="$emit(\'select\', \'state.material.ready\')" /><button data-testid="p03-canvas-select-consumption" type="button" @click="$emit(\'select\', \'fact.consumption\')" /><button data-testid="p03-canvas-select-structural" type="button" @click="$emit(\'select\', \'fact.structural\')" /><button data-testid="p03-canvas-place-state" type="button" @click="$emit(\'placeState\', \'element.object\')" /></div>',
        },
      },
    },
  });
  await flushPromises();
  return { wrapper, router };
}

describe("WorkbenchView", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    configureApi();
  });

  it("读取真实 P03 投影、OPL 和稳定修订定位", async () => {
    const { wrapper, router } = await mountWorkbench();

    expect(wrapper.get('[data-testid="p03-opl-sentence"]').text()).toBe("Transform consumes Material.");
    expect(wrapper.get('[data-testid="p03-context-context.root"]').text()).toContain("SD");
    expect(router.currentRoute.value.query).toMatchObject({ revision: "revision.1", context: "context.root" });

    await wrapper.get('[data-testid="p03-opl-sentence"]').trigger("click");
    expect(wrapper.text()).toContain("fact.consumption");
  });

  it("Object 命令提交后使用 committed revision 重读投影", async () => {
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", expect.objectContaining({ commandType: "CREATE_ELEMENT" }));
    expect(api.projection).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.2");
  });

  it("工具栏提供 Attribute 和 Operation 的受控 Feature 入口", async () => {
    const { wrapper } = await mountWorkbench();

    expect(wrapper.get('[data-testid="p03-tool-attribute"]').attributes("title")).toBe("创建 Attribute");
    expect(wrapper.get('[data-testid="p03-tool-operation"]').attributes("title")).toBe("创建 Operation");
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
      payload: expect.objectContaining({ feature_kind: "ATTRIBUTE", owner_element_id: "element.object" }),
    }));
  });

  it("State 候选采用 Runtime option 后提交 CREATE_STATE", async () => {
    const { wrapper } = await mountWorkbench();
    api.commandCapabilities.mockResolvedValueOnce({ data: {
      allowed: ["CREATE_ELEMENT", "CREATE_FACT", "CREATE_STATE"], forbidden: [], capability_query_id: "query.state.1",
      options: [{ capability_query_id: "query.state.1", option_id: "option.state.1", command_type: "CREATE_STATE", capability_ref: { capability_id: "CAP-STATE-001" }, display_name: "创建 Object State", group_path: ["Object", "State"], normalized_endpoints: [], required_fields: [], allowed_modifiers: [], symbol_descriptor: { id: "symbol.state", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1" }],
    } });

    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-tool-state"]').attributes("disabled")).toBeUndefined();
    await wrapper.get('[data-testid="p03-tool-state"]').trigger("click");
    await wrapper.get('[data-testid="p03-canvas-place-state"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-state-name"]').setValue("Ready");
    await wrapper.get('[data-testid="p03-state-candidate"]').trigger("submit");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.1", expect.objectContaining({ commandType: "CREATE_STATE", payload: expect.objectContaining({ name_or_value: "Ready", owner_ref: { target_kind: "ELEMENT", target_id: "element.object" } }) }));
  });

  it("State 删除仅采用 Runtime impact token", async () => {
    const { wrapper } = await mountWorkbench();
    api.commandCapabilities.mockResolvedValueOnce({ data: { allowed: ["DELETE_CONSTRUCT"], forbidden: [], capability_query_id: "query.delete.1", options: [{ capability_query_id: "query.delete.1", option_id: "option.delete.1", command_type: "DELETE_CONSTRUCT", capability_ref: { capability_id: "CAP-STATE-001" }, display_name: "删除 State", group_path: ["Object", "State"], normalized_endpoints: [], required_fields: [], allowed_modifiers: [], symbol_descriptor: { id: "symbol.state", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1", impact_summary: { affected_construct_count: 2, affected_context_count: 1, affected_sentence_count: 0, affected_finding_count: 0 }, impact_token: "impact.runtime.token.001" }] } });
    await wrapper.get('[data-testid="p03-canvas-select-state"]').trigger("click");
    await flushPromises();
    expect(wrapper.get('[data-testid="p03-state-delete-impact"]').text()).toContain("构造 2");
    await wrapper.get('[data-testid="p03-state-delete-impact"] button').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.1", { commandType: "DELETE_CONSTRUCT", payload: { construct_kind: "STATE", construct_id: "state.material.ready", impact_token: "impact.runtime.token.001" } });
  });

  it("State inspector 提供冻结的根与名称定位标识", async () => {
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-select-state"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="p03-state-inspector"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="p03-state-inspector-name"]').element.tagName).toBe("INPUT");
  });

  it("Object inspector 通过 Projection 清单显式化抑制 State", async () => {
    api.projection.mockResolvedValueOnce({ data: {
      constructs: [{ occurrence_id: "occ.object", target_id: "element.object", construct_role: "OBJECT_NODE", label: "Material", layout: { x: 80, y: 80, width: 160, height: 72, z_order: 1 } }],
      suppressed_states: [{ state_id: "state.common.subject", owner_ref: { target_kind: "ELEMENT", target_id: "element.object" }, name_or_value: "draft", state_roles: ["INITIAL"], explicitness: "SUPPRESSED" }],
    } });
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-suppressed-state-state.common.subject"]').trigger("click");
    await flushPromises();

    expect(api.executeP0Command).toHaveBeenCalledWith("project.1", "model.1", "context.root", "revision.1", {
      commandType: "STATE_EXPLICIT",
      payload: { context_id: "context.root", state_id: "state.common.subject" },
    });
  });

  it("Fact 删除仅使用Runtime返回的enabled impact token", async () => {
    const { wrapper } = await mountWorkbench();
    api.commandCapabilities.mockResolvedValueOnce({ data: { allowed: ["DELETE_CONSTRUCT"], forbidden: [], capability_query_id: "query.delete.fact.1", options: [{ capability_query_id: "query.delete.fact.1", option_id: "option.delete.fact.1", command_type: "DELETE_CONSTRUCT", capability_ref: { capability_id: "CAP-ISO-PROC-001" }, display_name: "删除关系", group_path: ["Fact"], normalized_endpoints: [], required_fields: [], allowed_modifiers: [], symbol_descriptor: { id: "symbol.fact", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: true, reason_codes: [], expires_with_revision: "revision.1", impact_summary: { affected_construct_count: 1, affected_context_count: 1, affected_sentence_count: 1, affected_finding_count: 0 }, impact_token: "impact.runtime.token.fact.001" }] } });

    await wrapper.get('[data-testid="p03-canvas-select-consumption"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="p03-fact-delete-impact"]').text()).toContain("构造 1");
    await wrapper.get('[data-testid="p03-fact-delete-impact"] button').trigger("click");
    await flushPromises();
    expect(api.executeP0Command).toHaveBeenLastCalledWith("project.1", "model.1", "context.root", "revision.1", { commandType: "DELETE_CONSTRUCT", payload: { construct_kind: "FACT", construct_id: "fact.consumption", impact_token: "impact.runtime.token.fact.001" } });
  });

  it("Fact 删除在Runtime未启用或未返回impact token时不能提交", async () => {
    const { wrapper } = await mountWorkbench();
    api.commandCapabilities.mockResolvedValueOnce({ data: { allowed: ["DELETE_CONSTRUCT"], forbidden: [], capability_query_id: "query.delete.fact.disabled", options: [{ capability_query_id: "query.delete.fact.disabled", option_id: "option.delete.fact.disabled", command_type: "DELETE_CONSTRUCT", capability_ref: { capability_id: "CAP-ISO-PROC-001" }, display_name: "删除关系", group_path: ["Fact"], normalized_endpoints: [], required_fields: [], allowed_modifiers: [], symbol_descriptor: { id: "symbol.fact", version: "0.1.0", digest: "digest" }, template_family: { id: "grammar", version: "0.1.0", digest: "digest" }, rule_refs: [], enabled: false, reason_codes: ["READ_ONLY_REVISION"], expires_with_revision: "revision.1", impact_summary: { affected_construct_count: 1, affected_context_count: 1, affected_sentence_count: 1, affected_finding_count: 0 } }] } });

    await wrapper.get('[data-testid="p03-canvas-select-consumption"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="p03-fact-delete-impact"] button').attributes("disabled")).toBeDefined();
    await wrapper.get('[data-testid="p03-fact-delete-impact"] button').trigger("click");
    expect(api.executeP0Command).not.toHaveBeenCalled();
  });

  it("过程关系等待用户从 Runtime 候选中明确选择后才提交", async () => {
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

    await wrapper.get('[data-testid="p03-canvas-select-process"]').trigger("click");
    await wrapper.get('[data-testid="p03-tool-procedural-relation"]').trigger("click");
    expect(wrapper.get('[data-testid="p03-relation-target"]').exists()).toBe(true);
    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await wrapper.get('[data-testid="p03-relation-resolve"]').trigger("click");
    await flushPromises();

    expect(wrapper.get('[data-testid="p03-relation-catalog"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="p03-relation-option-CAP-ISO-PROC-002"]').text()).toBe("ResultRESULT_PROCESS -> RESULT_OBJECT");
    expect(wrapper.get('[data-testid="p03-relation-option-CAP-ISO-PROC-004"]').exists()).toBe(true);
    expect(api.executeP0Command).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="p03-relation-option-CAP-ISO-PROC-002"]').trigger("click");
    await flushPromises();
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

    await wrapper.get('[data-testid="p03-canvas-select-process"]').trigger("click");
    await wrapper.get('[data-testid="p03-tool-procedural-relation"]').trigger("click");
    await wrapper.get('[data-testid="p03-canvas-select-handler-process"]').trigger("click");
    await wrapper.get('[data-testid="p03-relation-resolve"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-relation-duration"]').setValue("");
    await wrapper.get('[data-testid="p03-relation-option-CAP-ISO-PROC-015"]').trigger("click");

    expect(wrapper.text()).toContain("必须填写 duration");
    expect(api.executeP0Command).not.toHaveBeenCalled();

    await wrapper.get('[data-testid="p03-relation-duration"]').setValue("PT5M");
    await wrapper.get('[data-testid="p03-relation-option-CAP-ISO-PROC-015"]').trigger("click");
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

    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await wrapper.get('[data-testid="p03-tool-procedural-relation"]').trigger("click");
    await wrapper.get('[data-testid="p03-canvas-select-process"]').trigger("click");
    await wrapper.get('[data-testid="p03-canvas-select-product"]').trigger("click");
    await wrapper.get('[data-testid="p03-relation-resolve"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-relation-option-CAP-ISO-PROC-003"]').trigger("click");
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
    await wrapper.get('[data-testid="p03-control-open"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-control-option-CAP-ISO-CTRL-001"]').trigger("click");
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

  it("Structural 候选使用 Runtime 标签槽位和方向提交", async () => {
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

    await wrapper.get('[data-testid="p03-canvas-select-object"]').trigger("click");
    await wrapper.get('[data-testid="p03-tool-structural-relation"]').trigger("click");
    await wrapper.get('[data-testid="p03-canvas-select-product"]').trigger("click");
    await wrapper.get('[data-testid="p03-relation-resolve"]').trigger("click");
    await flushPromises();
    await wrapper.get('[data-testid="p03-relation-option-CAP-ISO-STRUCT-003"]').trigger("click");
    await wrapper.get('[data-testid="p03-structural-label-forward_tag"]').setValue("contains");
    await wrapper.get('[data-testid="p03-structural-label-reverse_tag"]').setValue("belongs to");
    await wrapper.get('[data-testid="p03-structural-candidate"]').trigger("submit");
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

  it("Structural Fact 编辑采用 Runtime UPDATE_FACT option 提交方向和标签", async () => {
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
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-canvas-select-structural"]').trigger("click");
    await wrapper.get('[data-testid="p03-structural-update-open"]').trigger("click");
    await flushPromises();
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

  it("冲突显示可恢复提示，State 在未选择 Object 时禁用", async () => {
    api.executeP0Command.mockRejectedValueOnce(new LocalRuntimeApiError("REVISION_CONFLICT", "基础修订不是当前草稿"));
    const { wrapper } = await mountWorkbench();

    await wrapper.get('[data-testid="p03-tool-object"]').trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("基础修订不是当前草稿");

    expect(wrapper.get('[data-testid="p03-tool-state"]').attributes("disabled")).toBeDefined();
  });
});

function endpoint(role: string, targetKind: "ELEMENT" | "STATE", targetId: string, ordinal: number) {
  return { role, target_ref: { target_kind: targetKind, target_id: targetId }, ordinal };
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
