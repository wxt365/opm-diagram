import { afterEach, describe, expect, it, vi } from "vitest";

import { localRuntimeApi } from "./localRuntimeApi";

describe("localRuntimeApi", () => {
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

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
