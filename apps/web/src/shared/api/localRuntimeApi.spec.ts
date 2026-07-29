import { afterEach, describe, expect, it, vi } from "vitest";

import { localRuntimeApi } from "./localRuntimeApi";

describe("localRuntimeApi", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete window.__OPM_LOCAL_SESSION__;
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
});

function project() {
  return { project_id: "project.test", name: "项目", archive_state: "ACTIVE", model_count: 0, updated_at: "2026-07-28T00:00:00Z" };
}

function response(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
