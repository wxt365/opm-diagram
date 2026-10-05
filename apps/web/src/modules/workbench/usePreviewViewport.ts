import { nextTick, watch, type Ref } from "vue";
import type OpdCanvas from "./OpdCanvas.vue";
import type { CanvasViewport } from "./opd/core/canvas-viewport";
import type { AssistantProposal } from "@/shared/api/assistantApi";
import type { OpdNode } from "@/shared/types/modeling";
import type { NodeLayout } from "@/stores/workbench/layoutSelection";

/** 预览开始和退出时恢复视口，不覆盖用户后续的手工平移。 */
export function usePreviewViewport(input: { canvasEditor: Ref<InstanceType<typeof OpdCanvas> | undefined>;
  assistantPreview: Ref<AssistantProposal | null>; autoLayoutPreview: () => { layouts: NodeLayout[] } | null; nodes: () => OpdNode[] }) {
  const { canvasEditor, assistantPreview } = input;
  let previewViewport: CanvasViewport | undefined;
  let assistantViewport: CanvasViewport | undefined;
  watch(assistantPreview, async (preview, previous) => {
    if (preview && !previous) {
      assistantViewport = canvasEditor.value?.captureViewport?.();
      await nextTick();
      // 先适应整图；用户随后平移或缩放会沿既有规则退出自动适应。
      if (assistantPreview.value && canvasEditor.value) canvasEditor.value.fitToView();
    } else if (!preview && previous) {
      const saved = assistantViewport, canvas = canvasEditor.value; assistantViewport = undefined;
      await nextTick();
      if (saved && !assistantPreview.value && canvas === canvasEditor.value) canvas?.restoreViewport?.(saved);
    }
  });
  watch(() => input.autoLayoutPreview(), async (preview, previous) => {
    if (preview && !previous) previewViewport = canvasEditor.value?.captureViewport?.();
    if (preview || !previous) return;
    const saved = previewViewport, canvas = canvasEditor.value;
    previewViewport = undefined;
    // 成功读回的布局与预览一致时保留视口；取消、拒绝和预览失效时还原。
    const byOccurrence = new Map(input.nodes().map(node => [node.occurrenceId, node]));
    const applied = previous.layouts.every(item => {
      const node = byOccurrence.get(item.occurrence_id);
      return node && node.x === item.layout.x && node.y === item.layout.y;
    });
    if (saved && !applied) {
      await nextTick();
      if (!input.autoLayoutPreview() && canvas === canvasEditor.value) canvas?.restoreViewport?.(saved);
    }
  });
}
