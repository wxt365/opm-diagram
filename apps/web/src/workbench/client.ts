import { LocalRuntimeApi, LocalRuntimeApiError, type ProfileRuleBinding } from "@/shared/api/localRuntimeApi";
import { createAssistantClient } from "@/shared/api/assistantApi";
import { randomUuid } from "@/shared/platform/browserCrypto";
import { createRuntimeServices } from "./localRuntimeServices";
import { IndexedDbDraftPendingStore } from "@/shared/api/draftPendingStore";
import type { WorkbenchBinding, WorkbenchConnectionOptions, WorkbenchSource } from "./contracts";

function serviceUrl(input: string) {
  const value = input.trim();
  if (!value) throw new Error("后端地址不能为空。");
  const url = new URL(value, window.location.origin);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password || url.search || url.hash)
    throw new Error("服务地址必须为 HTTP(S) 地址或同源路径，不能包含认证信息、查询或片段。");
  if (window.location.protocol === "https:" && url.protocol === "http:")
    throw new Error("HTTPS 页面需要 HTTPS 服务地址或同源代理路径。");
  return url.href.replace(/\/+$/, "");
}

/** 会话与服务地址属于此客户端实例，不写入宿主 window。 */
export function createOpmClient(options: WorkbenchConnectionOptions) {
  const backendUrl = serviceUrl(options.backendUrl);
  const assistantUrl = options.assistantUrl ? serviceUrl(options.assistantUrl) : undefined;
  let sessionToken: string | undefined, profileBinding: ProfileRuleBinding | undefined;
  const api = new LocalRuntimeApi({ baseUrl: backendUrl, session: () => sessionToken, binding: () => {
    if (!profileBinding) throw new Error("OPM 规则尚未初始化。");
    return profileBinding;
  }, accessToken: async () => typeof options.accessToken === "function" ? options.accessToken() : options.accessToken });
  const services = createRuntimeServices(api, assistantUrl ? createAssistantClient(assistantUrl, () => sessionToken,
    async () => typeof options.accessToken === "function" ? options.accessToken() : options.accessToken) : undefined,
    new IndexedDbDraftPendingStore(undefined, `opm-draft-delivery:${backendUrl}`));
  let initializing: Promise<void> | undefined;
  async function read<T>(path: string, body: unknown, headers: Record<string, string> = {}): Promise<T> {
    let response: Response;
    const access = typeof options.accessToken === "function" ? await options.accessToken() : options.accessToken;
    try { response = await fetch(`${backendUrl}${path}`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(access ? { Authorization: `Bearer ${access}` } : {}), ...headers }, body: JSON.stringify(body),
    }); } catch { throw new Error("无法连接 OPM 后端，请检查服务地址、跨域配置和网络。"); }
    let value;
    try { value = await response.json(); } catch { throw new Error("OPM 后端返回了非 JSON 内容，请检查服务地址或代理路径。"); }
    if (!response.ok) {
      const detail = value?.error ?? value;
      throw new LocalRuntimeApiError(detail?.code ?? "REQUEST_FAILED", detail?.message ?? "OPM 接入失败。", detail?.retryable ?? false);
    }
    return value as T;
  }
  function connect() {
    if (sessionToken) return Promise.resolve();
    if (initializing) return initializing;
    initializing = (async () => {
      const access = typeof options.accessToken === "function" ? await options.accessToken() : options.accessToken;
      const result = await read<{ sessionToken: string; profileBinding: ProfileRuleBinding }>("/api/v1/integration/session", {},
        access ? { Authorization: `Bearer ${access}` } : {});
      if (!result || typeof result !== "object") throw new Error("OPM 会话响应无效。");
      const binding = result.profileBinding;
      if (typeof result.sessionToken !== "string" || !result.sessionToken || !binding?.profile_id
        || !binding.profile_version || !binding.rule_set_id || !binding.rule_version) throw new Error("OPM 会话响应无效。");
      sessionToken = result.sessionToken; profileBinding = binding;
    })().finally(() => { initializing = undefined; });
    return initializing;
  }
  async function ensureWorkspace(source?: WorkbenchSource, binding?: WorkbenchBinding) {
    if (!binding && !source) throw new Error("请传入宿主 source 或已保存的 OPM binding。");
    await connect();
    const result = await read<WorkbenchBinding>("/api/v1/integration/workspace", {
      request_id: `request.embedded.${randomUuid()}`, ...(binding ? { binding } : { source: { systemId: "default", ...source } }),
    }, { "X-OPM-Session": sessionToken! });
    if (typeof result.projectId !== "string" || typeof result.modelId !== "string"
      || !/^[A-Za-z][A-Za-z0-9._:-]{2,127}$/.test(result.projectId) || !/^[A-Za-z][A-Za-z0-9._:-]{2,127}$/.test(result.modelId))
      throw new Error("OPM 关联响应缺少有效项目或模型 ID。");
    return result;
  }
  return { connect, ensureWorkspace, services };
}
