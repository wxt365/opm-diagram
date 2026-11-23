import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpmClient } from "./client";
import { createAssistantClient } from "@/shared/api/assistantApi";

const profileBinding = { profile_id: "profile.test", profile_version: "1", rule_set_id: "rules.test", rule_version: "1" };
const binding = { projectId: "project.test", modelId: "model.test" };
const source = { projectId: "123-uuid", projectName: "宿主项目", modelId: "456-uuid", modelName: "宿主模型" };
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
afterEach(() => vi.unstubAllGlobals());

describe("instance OPM client", () => {
  it("地址/会话实例隔离，自动初始化 JSON 会话，source 与 binding 分开并保留提交字节", async () => {
    const original = window.__OPM_LOCAL_SESSION__;
    const fetch = vi.fn(async (url: string) => url.endsWith("/session")
      ? json({ sessionToken: url.includes("runtime-a") ? "session-a" : "session-b", profileBinding })
      : url.endsWith("/workspace") ? json(binding) : json({ status: "test" }));
    vi.stubGlobal("fetch", fetch);
    const first = createOpmClient({ backendUrl: "http://runtime-a:17850/base/", assistantUrl: "http://assistant-a:17860", accessToken: async () => "access-a" });
    const second = createOpmClient({ backendUrl: "http://runtime-b:17850" });
    await Promise.all([first.connect(), first.ensureWorkspace(source), second.ensureWorkspace(undefined, binding)]);
    const sessionRequests = fetch.mock.calls.filter(([url]) => url.endsWith("/session"));
    expect(sessionRequests).toHaveLength(2);
    const firstSession = sessionRequests.find(([url]) => url.includes("runtime-a")) as unknown as [string, RequestInit];
    expect(firstSession[0]).toBe("http://runtime-a:17850/base/api/v1/integration/session");
    expect(firstSession[1].headers).toMatchObject({ Authorization: "Bearer access-a" });
    const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(JSON.parse(calls.find(([url]) => url === "http://runtime-a:17850/base/api/v1/integration/workspace")![1].body as string).source).toEqual({ systemId: "default", ...source });
    expect(JSON.parse(calls.find(([url]) => url === "http://runtime-b:17850/api/v1/integration/workspace")![1].body as string).binding).toEqual(binding);
    const raw = '{"layout":{"x":-0,"y":0.1}}';
    await first.services.api.draftMutation("project.test", "model.test", "EDIT", raw);
    expect(calls.at(-1)?.[1]).toMatchObject({ body: raw, headers: { "X-OPM-Session": "session-a", Authorization: "Bearer access-a" } });
    await second.services.api.getProject("project.test");
    expect(calls.at(-1)?.[1].headers).toMatchObject({ "X-OPM-Session": "session-b" });
    await first.services.assistant!.request("list", { ...binding, contextId: "context.root" });
    expect(calls.at(-1)?.[0]).toBe("http://assistant-a:17860/api/assistant/list");
    expect(calls.at(-1)?.[1].headers).toMatchObject({ "X-OPM-Session": "session-a", Authorization: "Bearer access-a" });
    expect(calls.find(([url])=>url.includes("runtime-a")&&url.endsWith("/workspace"))?.[1].headers).toMatchObject({ Authorization: "Bearer access-a" });
    expect(window.__OPM_LOCAL_SESSION__).toBe(original);
  });

  it("相对路径保留前缀，失败会话可重试但错误 binding 不回退新增", async () => {
    let attempts = 0;
    const fetch = vi.fn(async (url: string) => {
      if (url.endsWith("/session")) return ++attempts === 1 ? json({ error: { code: "LOCAL_SESSION_INVALID", message: "凭证无效" } }, 403)
        : json({ sessionToken: "session", profileBinding });
      return json({ error: { code: "NOT_FOUND", message: "关联不存在" } }, 404);
    }); vi.stubGlobal("fetch", fetch);
    const client = createOpmClient({ backendUrl: "/opm" });
    await expect(client.ensureWorkspace(source)).rejects.toThrow("凭证无效");
    await expect(client.ensureWorkspace(source, binding)).rejects.toThrow("关联不存在");
    const calls = fetch.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0]?.[0]).toBe(`${window.location.origin}/opm/api/v1/integration/session`);
    expect(JSON.parse(calls.at(-1)![1].body as string)).toMatchObject({ binding });
    expect(JSON.parse(calls.at(-1)![1].body as string).source).toBeUndefined();
  });

  it("拒绝错误地址和畸形初始化响应", async () => {
    for (const url of ["", "ftp://example.com", "https://user:secret@example.com", "https://example.com?key=x"])
      expect(() => createOpmClient({ backendUrl: url })).toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => json({ sessionToken: "session" })));
    await expect(createOpmClient({ backendUrl: "/opm" }).connect()).rejects.toThrow("会话响应无效");
    vi.stubGlobal("window", { location: { protocol: "https:", origin: "https://host.example.com" } });
    expect(() => createOpmClient({ backendUrl: "http://192.168.1.10:17850" })).toThrow("HTTPS 页面");
    expect(() => createOpmClient({ backendUrl: "/" })).not.toThrow();
  });

  it("助手订阅使用传入地址/令牌并解析流式事件和错误", async () => {
    const encoder = new TextEncoder();
    const fetch = vi.fn(async () => new Response(new ReadableStream({ start(controller) {
      controller.enqueue(encoder.encode('data: {"id":"conversation"}\n\n'));
      controller.enqueue(encoder.encode('event: error\ndata: {"message":"订阅失败"}\n\n')); controller.close();
    } })));
    vi.stubGlobal("fetch", fetch);
    const client = createAssistantClient("http://assistant:17860", () => "instance-session", async () => "host-access");
    const receive = vi.fn();
    await expect(client.watch({ ...binding, contextId: "context.root" }, "conversation", new AbortController().signal, receive)).rejects.toThrow("订阅失败");
    expect(receive).toHaveBeenCalledWith({ id: "conversation" });
    expect(fetch.mock.calls[0]?.[0]).toBe("http://assistant:17860/api/assistant/watch");
    expect((fetch.mock.calls as unknown as Array<[string,RequestInit]>)[0]?.[1].headers).toMatchObject({ Authorization: "Bearer host-access" });
  });
});
