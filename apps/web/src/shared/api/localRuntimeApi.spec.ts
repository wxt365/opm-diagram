import { afterEach, describe, expect, it, vi } from "vitest";

import { localRuntimeApi } from "./localRuntimeApi";
import type { DraftQueryContracts } from "./localRuntimeApi";

describe("localRuntimeApi", () => {
  it("V2 查询使用固定路径和会话，旧 V1 envelope 不混入新错误", async () => {
    window.__OPM_LOCAL_SESSION__ = "session.v2";
    const fetchMock = vi.fn(async () => response(200, { request_id: "request.1" }));
    vi.stubGlobal("fetch", fetchMock);
    for (const operation of ["open", "projection", "text", "navigation", "findings", "relation-catalog", "capabilities", "receipts"] as const) {
      await localRuntimeApi.draftQuery("project.1", "model.1", operation, { request_id: "request.1", context_id: null } as DraftQueryContracts[typeof operation][0]);
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`/api/v2/projects/project.1/models/model.1/draft/${operation}`);
      expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({ method: "POST", headers: { "X-OPM-Session": "session.v2" } });
    }
  });

  it("V2 EDIT/SAVE/PIN 保留 exact raw，包括负零", async () => {
    window.__OPM_LOCAL_SESSION__ = "session.v2";
    const fetchMock = vi.fn(async () => response(200, { status: "test" })); vi.stubGlobal("fetch", fetchMock);
    const raw = '{"layout":{"x":-0,"y":0.1}}';
    for (const [operation, path] of [["EDIT", "commands"], ["SAVE", "save"], ["PIN", "pin"]] as const) {
      await localRuntimeApi.draftMutation("project.1", "model.1", operation, raw);
      expect(fetchMock.mock.calls.at(-1)?.[0]).toBe(`/api/v2/projects/project.1/models/model.1/draft/${path}`);
      expect(fetchMock.mock.calls.at(-1)?.[1]).toMatchObject({ body: raw });
    }
  });

  it("V2 顶层错误保留 code/reason/retryable，缺会话零发送", async () => {
    const fetchMock = vi.fn(async () => response(422, { code: "DRAFT_EDIT_REJECTED", message: "输入被阻断", retryable: false, reason_code: "COMMAND_NOT_IMPLEMENTED" }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(localRuntimeApi.draftMutation("project.1", "model.1", "EDIT", "{}")).rejects.toMatchObject({ code: "LOCAL_SESSION_INVALID" });
    expect(fetchMock).not.toHaveBeenCalled();
    window.__OPM_LOCAL_SESSION__ = "session.v2";
    await expect(localRuntimeApi.draftMutation("project.1", "model.1", "EDIT", "{}")).rejects.toMatchObject({ code: "DRAFT_EDIT_REJECTED", reasonCode: "COMMAND_NOT_IMPLEMENTED", retryable: false });
  });

  it.each(["", "<html>错误</html>", "null", "[]", "{}"])("V2 不能将无效 2xx 当成确认：%s", async text => {
    window.__OPM_LOCAL_SESSION__ = "session.v2";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, text: async () => text })));
    await expect(localRuntimeApi.draftMutation("project.1", "model.1", "SAVE", "{}")).rejects.toMatchObject({ code: "DRAFT_RESPONSE_INVALID" });
  });

  it("会话分别发送 HEAD 和精确定位参数，空 Revision 不被转换为 HEAD", async () => {
    const fetchMock = vi.fn(async () => response(200, { meta: {}, data: {} }));
    vi.stubGlobal("fetch", fetchMock);
    await localRuntimeApi.workspaceSession("project.test", "model.test");
    await localRuntimeApi.workspaceSession("project.test", "model.test", "revision.1", "context.root");
    await localRuntimeApi.workspaceSession("project.test", "model.test", "");
    const urls = fetchMock.mock.calls.map(([path]) => new URL(path as string, "http://localhost"));
    expect(urls[0].searchParams.has("revision")).toBe(false);
    expect(urls[1].searchParams.get("revision")).toBe("revision.1");
    expect(urls[1].searchParams.get("context")).toBe("context.root");
    expect(urls[2].searchParams.has("revision")).toBe(true);
    expect(urls[2].searchParams.get("revision")).toBe("");
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__OPM_LOCAL_SESSION__;
    delete window.__OPM_ACTIVE_PROFILE_BINDING__;
  });

  it("为写请求携带启动资源下发的会话令牌", async () => {
    window.__OPM_LOCAL_SESSION__ = "session-from-bootstrap";
    const fetchMock = vi.fn(async () => response(201, { data: project() }));
    vi.stubGlobal("fetch", fetchMock);

    await localRuntimeApi.createProject("项目", "说明");

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(request).toMatchObject({ method: "POST", headers: { "X-OPM-Session": "session-from-bootstrap" } });
  });

  it("没有启动会话时不发出写请求", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(localRuntimeApi.createProject("项目", "说明")).rejects.toMatchObject({ code: "LOCAL_SESSION_INVALID" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("模型创建、编辑和校验使用 Runtime 下发的同一 binding", async () => {
    window.__OPM_LOCAL_SESSION__ = "session-from-bootstrap";
    window.__OPM_ACTIVE_PROFILE_BINDING__ = binding();
    const fetchMock = vi.fn(async () => response(201, { data: model() }));
    vi.stubGlobal("fetch", fetchMock);

    await localRuntimeApi.createModel("project.test", "模型");
    await localRuntimeApi.executeP0Command("project.test", "model.test", "context.root", "revision.initial", {
      commandType: "CREATE_ELEMENT",
      payload: { kind: "OBJECT", name: "订单", layout: { x: 1, y: 2 } },
    });
    await localRuntimeApi.validate("project.test", "model.test", "revision.initial");

    for (const [, request] of fetchMock.mock.calls) {
      const body = JSON.parse((request as RequestInit).body as string) as { binding?: unknown };
      expect(body.binding).toEqual(binding());
    }
  });

  it("Runtime 未下发 binding 时拒绝模型创建且不发请求", async () => {
    window.__OPM_LOCAL_SESSION__ = "session-from-bootstrap";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(localRuntimeApi.createModel("project.test", "模型")).rejects.toMatchObject({ code: "RUNTIME_BINDING_UNAVAILABLE" });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("关系目录查询携带显式 Context 和 revision", async () => {
    const fetchMock = vi.fn(async () => response(200, { meta: {}, data: { items: [] } }));
    vi.stubGlobal("fetch", fetchMock);

    await localRuntimeApi.relationCatalog("project.test", "model.test", "context.root", "revision.1");

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/contexts\/context\.root\/relation-catalog\?request_id=query\.relation-catalog\.[a-f0-9]+&revision=revision\.1$/);
  });

  it("release-only descriptor 查询绑定 Context 和 revision", async () => {
    const fetchMock = vi.fn(async () => response(200, { meta: {}, data: releaseVisualCommonFaultCommand() }));
    vi.stubGlobal("fetch", fetchMock);

    await localRuntimeApi.releaseVisualCommonFaultCommand("project.test", "model.test", "context.root", "revision.1");

    expect(fetchMock.mock.calls[0]?.[0]).toMatch(/contexts\/context\.root\/release-visual-common-fault-command\?request_id=query\.release-visual-common-fault-command\.[a-f0-9]+&revision=revision\.1$/);
  });

  it("release-only command 只透传 Runtime descriptor，不开放通用 command id 覆盖", async () => {
    window.__OPM_LOCAL_SESSION__ = "session-from-bootstrap";
    window.__OPM_ACTIVE_PROFILE_BINDING__ = binding();
    const fetchMock = vi.fn(async () => response(200, { meta: { committed_revision: "revision.2" }, data: {} }));
    vi.stubGlobal("fetch", fetchMock);

    await localRuntimeApi.executeReleaseVisualCommonFaultCommand("project.test", "model.test", "context.root", "revision.1", releaseVisualCommonFaultCommand());

    const [, request] = fetchMock.mock.calls[0] ?? [];
    expect(JSON.parse((request as RequestInit).body as string)).toMatchObject({
      command_id: "command.visual.blocked-feedback.persistence-failed",
      command_type: "CREATE_FACT",
      payload: releaseVisualCommonFaultCommand().payload,
    });
  });
});

function project() {
  return { project_id: "project.test", name: "项目", archive_state: "ACTIVE", model_count: 0, updated_at: "2026-07-28T00:00:00Z" };
}

function model() {
  return { model_id: "model.test", project_id: "project.test", name: "模型", head_revision: "revision.initial", profile_id: "profile.iso19450.2024.draft", profile_version: "0.2.0", rule_version: "0.1.0", access_mode: "EDITABLE_DRAFT" };
}

function binding() {
  return { profile_id: "profile.iso19450.2024.draft", profile_version: "0.2.0", rule_set_id: "rules.iso19450.2024.draft", rule_version: "0.1.0" };
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

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
