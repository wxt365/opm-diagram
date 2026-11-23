import { effectScope, nextTick, ref } from "vue";
import { describe, expect, it, vi } from "vitest";
import type OpdCanvas from "./OpdCanvas.vue";
import type { AssistantProposal } from "@/shared/api/assistantApi";
import { usePreviewViewport } from "./usePreviewViewport";

describe("确认与取消的预览视口", () => {
  it("确认成功保留新视口，取消恢复原视口", async () => {
    for (const applied of [true, false]) {
      const captureViewport = vi.fn(() => ({ zoom: 1, x: 0, y: 0 }));
      const restoreViewport = vi.fn(), fitToView = vi.fn();
      const canvasEditor = ref({ captureViewport, restoreViewport, fitToView } as unknown as InstanceType<typeof OpdCanvas>);
      const assistantPreview = ref<AssistantProposal | null>(null);
      const scope = effectScope();
      scope.run(() => usePreviewViewport({ canvasEditor, assistantPreview, autoLayoutPreview: () => null, nodes: () => [], preserveAssistantViewportOnExit: () => applied }));
      assistantPreview.value = { id: 'preview' } as AssistantProposal;
      await nextTick(); await nextTick(); expect(fitToView).toHaveBeenCalledOnce();
      assistantPreview.value = null; await nextTick(); await nextTick();
      expect(restoreViewport).toHaveBeenCalledTimes(applied ? 0 : 1); scope.stop();
    }
  });
});
