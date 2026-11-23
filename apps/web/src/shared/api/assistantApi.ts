import type { DraftCommand, DraftToken, DraftEditResult, DraftProjectionData, DraftFindingsData } from "./generated/draftWorkspaceContract";

export interface AssistantReview {
  skill_version: string; standard_version: string; coverage: string; source_digest: string; plan_digest: string; snapshot_digest: string; checked_at: string;
  checks: Array<{ rule_id: string; result: "PASS" | "ISSUE" | "NOT_APPLICABLE" | "NEEDS_INPUT"; explanation: string; clauses: string[]; pdf_pages: number[] }>;
  issues: Array<{ rule_id: string; basis: "STANDARD" | "USER_REQUIREMENT"; severity: "ERROR" | "WARNING"; context_id: string; target_ids: string[]; message: string; suggestion: string; clauses: string[]; pdf_pages: number[]; historical?: boolean }>;
  assumptions: string[];
  review_scope?: { mode: string; current_context_id: string; related_context_ids: string[]; omitted_context_count: number; changed_target_ids: string[] };
}

export interface AssistantQuality {
  policy_version: string; guide_version: string; guide_digest: string; policy_digest: string; plan_digest: string; checked_at: string;
  context_id: string; coverage: string; node_count: number; fact_count: number; omitted: number;
  items: Array<{ rule_id: string; severity: "WARNING"; target_ids: string[]; message: string; suggestion: string }>;
}

export interface AssistantScope { projectId: string; modelId: string; contextId: string; kind?: 'OPD' | 'ANALYSIS'; mindmapId?: string }
export interface AssistantProposal {
  id: string; summary: string; command: DraftCommand; baseToken: DraftToken; contextId: string; symbolRef?: string;
  status: "staging" | "ready" | "blocked" | "cancelled" | "pending" | "applied" | "stale" | "rejected";
  previewData?: DraftProjectionData;
  previewViews?: Array<{ context_id: string; label: string; parent_context_id: string | null; refinee_element_id: string | null; data: DraftProjectionData }>;
  validation?: DraftFindingsData | null;
  review?: AssistantReview | null;
  quality?: AssistantQuality | null;
  failureCode?: string;
  reason: string; affectedContexts: Array<{ context_id: string; label: string }>;
  result?: DraftEditResult;
  autoApply?: boolean;
  analysisSource?: import('./generated/draftWorkspaceContract').AnalysisSource;
}
export interface AssistantConversation extends AssistantScope {
  id: string; title: string; updatedAt: string;
  messages: Array<{ id: string; role: "user" | "assistant"; text: string; contextId: string; attachments?: Array<{ name: string; size: number }> }>;
  proposals: AssistantProposal[];
  run: { id: string; status: "running" | "completed" | "failed" | "stopped" | "interrupted"; message: string; code?: string; saving?: boolean } | null;
  analysisRevision?: number;
}
export function createAssistantClient(baseUrl = "", session = () => window.__OPM_LOCAL_SESSION__, accessToken?: () => Promise<string | undefined>) {
  async function headers() {
    const token = session();
    if (!token) throw new Error("工作台会话未就绪，请重新加载。");
    const access = await accessToken?.();
    return { "Content-Type": "application/json", "X-OPM-Session": token, ...(access ? { Authorization: `Bearer ${access}` } : {}) };
  }
  async function request<T>(operation: string, scope: AssistantScope, extra: Record<string, unknown> = {}): Promise<T> {
    const response = await fetch(`${baseUrl}/api/assistant/${operation}`, {
      method: "POST", headers: await headers(), body: JSON.stringify({ ...scope, ...extra }),
    });
    let value;
    try { value = await response.json(); } catch { throw new Error("智能助手服务不可用，请确认服务已启动。"); }
    if (!response.ok) throw new Error(value.message ?? "助手请求失败。");
    return value as T;
  }
  /** 卸载只终止订阅；后台生成仍由服务管理。 */
  async function watchConversation<T>(scope: AssistantScope, conversationId: string, signal: AbortSignal,
    receive: (value: T) => void): Promise<void> {
    const response = await fetch(`${baseUrl}/api/assistant/watch`, { method: "POST", headers: await headers(),
      body: JSON.stringify({ ...scope, conversationId }), signal });
    if (!response.ok || !response.body) throw new Error("助手事件连接失败，请重试。");
    const reader = response.body.getReader(), decoder = new TextDecoder(); let buffer = "";
    try {
      while (true) {
        const chunk = await reader.read(); if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const frames = buffer.split("\n\n"); buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const line = frame.split("\n").find(x => x.startsWith("data: "));
          if (!line) continue;
          const data = JSON.parse(line.slice(6));
          if (frame.startsWith("event: error")) throw new Error(data.message);
          receive(data as T);
        }
      }
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  return {
    request,
    watch: (scope: AssistantScope, conversationId: string, signal: AbortSignal, receive: (value: AssistantConversation) => void) =>
      watchConversation(scope, conversationId, signal, receive),
  };
}

const defaultAssistantClient = createAssistantClient();
export const assistantRequest = defaultAssistantClient.request;
export const watchAssistant = defaultAssistantClient.watch;
