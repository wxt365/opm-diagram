import { reactive } from "vue";
import type { WorkbenchRuntimeApi } from "@/workbench/contracts";
import { normalizeNodeAppearance, type NodeColorPalette } from "@/shared/nodeAppearance";
import type { NodeAppearance, OpdNode } from "@/shared/types/modeling";
import { message } from "./runtimeError";

/** 展示设置独立于模型草稿；只在服务端确认后更新所有同类型节点。 */
export function createCanvasNodeColors(api: WorkbenchRuntimeApi) {
  const state = reactive({ palette: {} as NodeColorPalette, loaded: false, saving: false, error: "" });
  let timer: ReturnType<typeof setInterval> | undefined;
  let channel: BroadcastChannel | undefined;
  let reading: Promise<void> | undefined;
  let generation = 0;
  async function refresh() {
    if (!api.canvasNodeColors || state.saving) return;
    if (reading) return reading;
    const current = generation;
    reading = (async () => {
      try {
        const palette = await api.canvasNodeColors!();
        if (current !== generation || state.saving) return;
        if (JSON.stringify(state.palette) !== JSON.stringify(palette)) state.palette = palette;
        state.loaded = true; state.error = "";
      } catch (error) { if (current === generation) state.error = message(error); }
      finally { reading = undefined; }
    })();
    return reading;
  }
  async function save(kind: OpdNode["kind"], colors: NodeAppearance) {
    if (!api.saveCanvasNodeColors || !state.loaded || state.saving) return false;
    generation++; state.saving = true; state.error = "";
    try {
      const saved = await api.saveCanvasNodeColors(kind, colors);
      state.palette = { ...state.palette, [kind]: normalizeNodeAppearance(saved) ?? {} };
      channel?.postMessage("refresh");
      return true;
    } catch (error) { state.error = message(error); return false; }
    finally { state.saving = false; }
  }
  const focus = () => { void refresh(); };
  function start() {
    if (timer || !api.canvasNodeColors) return;
    void refresh();
    window.addEventListener("focus", focus);
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel("opm-canvas-node-colors");
      channel.onmessage = focus;
    }
    timer = setInterval(() => { if (document.visibilityState === "visible") void refresh(); }, 30000);
  }
  function stop() {
    generation++; clearInterval(timer); timer = undefined;
    window.removeEventListener("focus", focus); channel?.close(); channel = undefined;
  }
  return { state, start, stop, refresh, save };
}
