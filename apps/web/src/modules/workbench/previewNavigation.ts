import type { AssistantProposal } from "@/shared/api/assistantApi";

export interface PreviewNavigationContext { id: string; label: string; kind: string; depth: number; parentId?: string; refineeId?: string }

export function previewNavigation<T extends PreviewNavigationContext>(contexts: T[], proposal: AssistantProposal | null) {
  const result: Array<PreviewNavigationContext & { preview: boolean }> = contexts.map(context => ({ ...context, preview: false }));
  for (const view of proposal?.previewViews ?? []) {
    const known = result.find(context => context.id === view.context_id);
    if (known) { known.preview = true; continue; }
    const parent = result.find(context => context.id === view.parent_context_id);
    const item = { id: view.context_id, label: view.label, kind: 'PREVIEW', depth: (parent?.depth ?? 0) + 1,
      parentId: view.parent_context_id ?? undefined, refineeId: view.refinee_element_id ?? undefined, preview: true };
    const parentIndex = result.findIndex(context => context.id === view.parent_context_id);
    let insert = parentIndex + 1;
    while (insert < result.length && result[insert]!.depth > (parent?.depth ?? 0)) insert++;
    result.splice(parentIndex < 0 ? result.length : insert, 0, item);
  }
  return result;
}
