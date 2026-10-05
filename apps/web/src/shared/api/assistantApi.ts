import type { DraftCommand, DraftToken, DraftEditResult, DraftProjectionData, DraftFindingsData } from "./generated/draftWorkspaceContract";

export interface AssistantReview {
  skill_version: string; standard_version: string; coverage: string; source_digest: string; plan_digest: string; snapshot_digest: string; checked_at: string;
  checks: Array<{ rule_id: string; result: "PASS" | "ISSUE" | "NOT_APPLICABLE" | "NEEDS_INPUT"; explanation: string; clauses: string[]; pdf_pages: number[] }>;
  issues: Array<{ rule_id: string; basis: "STANDARD" | "USER_REQUIREMENT"; severity: "ERROR" | "WARNING"; context_id: string; target_ids: string[]; message: string; suggestion: string; clauses: string[]; pdf_pages: number[] }>;
  assumptions: string[];
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
  validation?: DraftFindingsData | null;
  review?: AssistantReview | null;
  quality?: AssistantQuality | null;
  reason: string; affectedContexts: Array<{ context_id: string; label: string }>;
  result?: DraftEditResult;
  analysisSource?: import('./generated/draftWorkspaceContract').AnalysisSource;
}
export interface AssistantConversation extends AssistantScope {
  id: string; title: string; updatedAt: string;
  messages: Array<{ id: string; role: "user" | "assistant"; text: string; contextId: string }>;
  proposals: AssistantProposal[];
  run: { id: string; status: "running" | "completed" | "failed" | "stopped" | "interrupted"; message: string } | null;
  analysisRevision?: number;
}
function headers() {
  const token = window.__OPM_LOCAL_SESSION__;
  if (!token) throw new Error("本地会话未就绪，请刷新页面。");
  return { "Content-Type": "application/json", "X-OPM-Session": token };
}
export async function assistantRequest<T>(operation: string, scope: AssistantScope, extra: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(`/api/assistant/${operation}`, { method: "POST", headers: headers(), body: JSON.stringify({ ...scope, ...extra }) });
  let value;
  try { value = await response.json(); } catch { throw new Error("智能助手服务不可用，请确认服务已启动。"); }
  if (!response.ok) throw new Error(value.message ?? "助手请求失败。");
  return value as T;
}
/** 断开页面订阅只停止接收，后台对话继续运行，可在重新打开后恢复。 */
export async function watchAssistant(scope: AssistantScope, conversationId: string, signal: AbortSignal,
  receive: (value: AssistantConversation) => void): Promise<void> {
  const response = await fetch("/api/assistant/watch", { method: "POST", headers: headers(),
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
        receive(data as AssistantConversation);
      }
    }
  } finally { reader.releaseLock(); }
}
