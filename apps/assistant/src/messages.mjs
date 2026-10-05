export function safeMessage(error) {
  return String(error.message ?? '助手操作失败。').replace(/sk-[a-zA-Z0-9_-]+/g, '[已隐藏]').slice(0, 1600);
}
export const brief = value => ({ id: value.id, projectId: value.projectId, modelId: value.modelId, contextId: value.contextId, kind: value.kind, mindmapId: value.mindmapId, analysisRevision: value.analysisRevision,
  title: value.title, updatedAt: value.updatedAt, messages: value.messages, proposals: value.proposals, run: value.run });
