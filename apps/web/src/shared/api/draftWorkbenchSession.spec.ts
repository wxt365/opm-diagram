import { describe, expect, it, vi } from "vitest";
import vectors from "../../../../../tests/fixtures/hybrid-save/draft-workspace-v02-vectors.json";
import { DraftWorkbenchSession, optionIsCurrent } from "./draftWorkbenchSession";
import type { DraftDelivery } from "./draftDelivery";
import type { DraftCommand, DraftScope, DraftToken } from "./generated/draftWorkspaceContract";
import type { P0Command } from "./localRuntimeApi";
import type { WorkbenchCapabilityOption } from "@/shared/types/workbenchCapability";

const token: DraftToken = { draft_id: "draft.1", edit_seq: 0, binding_digest: "a".repeat(64) };
function message(type: string) { return JSON.parse(vectors.messages.find(item => item.type === type)!.raw); }
function option(scope: DraftScope, current = token) {
  const base = message("DraftCapabilitiesResult").data.options[0];
  return { ...base, command_type: scope.intent, expires_with_token: current,
    required_fields: scope.intent === "CREATE_ELEMENT" ? [{ field_id: "kind", allowed_values: ["OBJECT"], field_kind: "ENUM", required: true }] : [],
    impact_summary: { ...base.impact_summary, input_token: current, selected_occurrence_id: scope.selection_id } };
}
function setup() {
  const submit = vi.fn(async (_p, _m, input) => input.operation === "EDIT" ? { result_token: { ...token, edit_seq: 1 } } : { revision_id: "revision.saved" });
  const delivery = { submit, pending: vi.fn(async () => []), recover: vi.fn(async () => null) } as unknown as DraftDelivery;
  const draftQuery = vi.fn(async (_p, _m, operation, request) => {
    if (operation === "open") return { ...message("OpenDraftResult"), request_id: request.request_id };
    const meta = { request_id: request.request_id, draft_token: request.draft_token, context_id: request.scope?.context_id ?? request.context_id };
    if (operation === "capabilities") return { meta, data: { scope: request.scope, allowed: [request.scope.intent], forbidden: [], capability_query_id: "query.1", options: [option(request.scope, request.draft_token)] } };
    const type = { projection: "DraftProjectionResult", text: "DraftTextResult", navigation: "DraftNavigationResult", findings: "DraftFindingsResult", "relation-catalog": "DraftRelationCatalogResult" }[operation];
    return { ...message(type!), meta };
  });
  const api = { draftQuery, getProject: vi.fn(async () => ({ name: "项目" })), listModels: vi.fn(async () => [{ project_id: "project.1", model_id: "model.1", name: "模型" }]), revisions: vi.fn(async () => []) };
  const session = new DraftWorkbenchSession("project.1", "model.1", delivery, api as never);
  return { session, api, submit, delivery };
}

describe("DraftWorkbenchSession", () => {
  it("同token的导航、画布、文本和问题组成快照，未调用旧投影", async () => {
    const { session, api } = setup();
    const opened = await session.open(); const snapshot = await session.read(opened);
    expect(snapshot.constructs[0]?.layout.x).toBe(0.1);
    expect(snapshot.findings.validation_summary.coverage_state).toBe("INCOMPLETE");
    expect(api.draftQuery.mock.calls.map(call => call[2])).toEqual(["open", "projection", "text", "navigation", "findings", "relation-catalog"]);
  });

  it.each(["request", "token", "context", "projection"])("快照 %s 不一致整批拒绝", async fault => {
    const { session, api } = setup();
    const implementation = api.draftQuery.getMockImplementation()!;
    api.draftQuery.mockImplementation(async (...args) => {
      const result = await implementation(...args);
      if (args[2] === "projection") {
        if (fault === "request") result.meta.request_id = "request.wrong";
        if (fault === "token") result.meta.draft_token = { ...token, edit_seq: 1 };
        if (fault === "context") result.meta.context_id = "context.wrong";
        if (fault === "projection") result.data.constructs[0].endpoints = [{ target_kind: "CONTEXT", target_id: "context.1", role: "X", ordinal: 0 }];
      }
      return result;
    });
    await expect(session.read(await session.open())).rejects.toMatchObject({ code: "DRAFT_RESPONSE_INVALID" });
  });

  it.each(vectors.commands.map(request => [request.command.command_type, request.command] as const))("%s V2 payload 去掉旧授权，引用原 scope/option", async (_type, command) => {
    const { session, submit } = setup();
    // 复用冻结请求中的 command，不增加独立命令语义。
    const typed = command as DraftCommand;
    const scope: DraftScope = { context_id: "context.1", selection_id: typed.command_type === "DELETE_CONSTRUCT" ? String((typed.payload as { selection_id: string }).selection_id) : "occurrence.1", intent: typed.command_type, endpoints: [] };
    const capabilities = await session.capabilities(token, scope.context_id, scope.selection_id!, scope.intent);
    const selected = capabilities.data.options[0]!;
    const payload = { ...typed.payload, capability_query_id: selected.capability_query_id, selected_option_id: selected.option_id };
    if (typed.command_type === "DELETE_CONSTRUCT") Object.assign(payload, { impact_token: (selected as { impact_token: string }).impact_token });
    await session.edit(token, "context.1", { commandType: typed.command_type, payload } as P0Command);
    const request = submit.mock.calls[0]?.[2].request;
    expect(request.scope).toEqual(scope);
    expect(request.authorization).toEqual({ capability_query_id: selected.capability_query_id, selected_option_id: selected.option_id });
    expect(request.command.payload).not.toHaveProperty("capability_query_id");
    expect(request.command.payload).not.toHaveProperty("selected_option_id");
  });

  it("移动先查询 occurrence 的唯一候选，负零不变", async () => {
    const { session, submit, api } = setup();
    await session.edit(token, "context.1", { commandType: "UPDATE_LAYOUT", payload: { occurrence_id: "occurrence.1", layout: { x: -0, y: 0.1 } } });
    expect(api.draftQuery.mock.calls[0]?.[3].scope.selection_id).toBe("occurrence.1");
    expect(Object.is(submit.mock.calls[0]?.[2].request.command.payload.layout.x, -0)).toBe(true);
  });

  it("创建节点按 Runtime kind 字段选择，不手写 query/option", async () => {
    const { session, submit } = setup();
    await session.edit(token, "context.1", { commandType: "CREATE_ELEMENT", payload: { kind: "OBJECT", name: "对象", layout: { x: 0, y: 0 } } });
    expect(submit.mock.calls[0]?.[2].request.authorization.selected_option_id).toBe("option.1");
  });

  it("旧 token 或未知授权拒绝，不发送，不回退 V1", async () => {
    const { session, submit } = setup();
    await session.capabilities(token, "context.1", "element.1", "UPDATE_PROPERTY");
    const command: P0Command = { commandType: "UPDATE_PROPERTY", payload: { target_ref: { target_kind: "ELEMENT", target_id: "element.1" }, property_name: "name", value: "新名", capability_query_id: "query.1", selected_option_id: "option.1" } };
    await expect(session.edit({ ...token, edit_seq: 1 }, "context.1", command)).rejects.toMatchObject({ code: "DRAFT_CONFLICT" });
    command.payload.selected_option_id = "option.unknown";
    await expect(session.edit(token, "context.1", command)).rejects.toMatchObject({ code: "DRAFT_CONFLICT" });
    expect(submit).not.toHaveBeenCalled();
  });

  it("保存/Pin 捕获 token，恢复按 EDIT 再 EXPLICIT 原请求", async () => {
    const { session, submit, delivery } = setup();
    await session.save(token); await session.pin(token); await session.recover();
    expect(submit.mock.calls.map(call => call[2].operation)).toEqual(["SAVE", "PIN"]);
    expect(submit.mock.calls[0]?.[2].request.target_draft_token).toEqual(token);
    expect(delivery.recover).toHaveBeenNthCalledWith(1, "project.1", "model.1", "EDIT");
    expect(delivery.recover).toHaveBeenNthCalledWith(2, "project.1", "model.1", "EXPLICIT");
  });

  it("V2 与 Revision 过期判断不互相冒充", () => {
    const selected = option({ context_id: "context.1", selection_id: null, intent: "CREATE_ELEMENT", endpoints: [] }) as WorkbenchCapabilityOption;
    expect(optionIsCurrent(selected, token, "revision.1")).toBe(true);
    expect(optionIsCurrent(selected, null, "revision.1")).toBe(false);
    expect(optionIsCurrent(selected, { ...token, edit_seq: 1 }, "revision.1")).toBe(false);
  });
});
