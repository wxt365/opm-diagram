import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkbenchRuntimeApi } from "@/workbench/contracts";
import type { NodeColorPalette } from "@/shared/nodeAppearance";
import { nodeAppearance } from "@/shared/nodeAppearance";
import { createCanvasNodeColors } from "./canvasNodeColors";
import { LocalRuntimeApiError } from "@/shared/api/localRuntimeApi";

afterEach(() => vi.useRealTimers());
describe("跨画布统一类型颜色", () => {
  it("保存同类配色后旧元素、新元素和另一模型一致，其他类型独立", async () => {
    let saved: NodeColorPalette = {};
    const api = { canvasNodeColors: vi.fn(async () => saved), saveCanvasNodeColors: vi.fn(async (kind, colors) => {
      saved = { ...saved, [kind]: colors }; return colors;
    }) } as unknown as WorkbenchRuntimeApi;
    const first = createCanvasNodeColors(api); await first.refresh();
    expect(await first.save("object", { stroke: "#0000ff" })).toBe(true);
    const second = createCanvasNodeColors(api); await second.refresh();
    expect(nodeAppearance({ kind: "object", appearance: { stroke: "#ff0000" } }, first.state.palette).stroke).toBe("#ff0000");
    expect(nodeAppearance({ kind: "object" }, second.state.palette).stroke).toBe("#0000ff");
    expect(nodeAppearance({ kind: "process" }, second.state.palette).stroke).toBe("#14b8a6");
    await first.save("object", {}); await second.refresh();
    expect(nodeAppearance({ kind: "object", appearance: { stroke: "#ff0000" } }, second.state.palette).stroke).toBe("#ff0000");
  });
  it("保存失败保留旧颜色并显示错误，未加载完成不能写入", async () => {
    const write = vi.fn().mockRejectedValue(new LocalRuntimeApiError("PERSISTENCE_FAILED", "保存失败"));
    const state = createCanvasNodeColors({ canvasNodeColors: async () => ({ object: { stroke: "#111111" } }), saveCanvasNodeColors: write } as unknown as WorkbenchRuntimeApi);
    expect(await state.save("object", {})).toBe(false); expect(write).not.toHaveBeenCalled();
    await state.refresh();
    expect(await state.save("object", { stroke: "#222222" })).toBe(false);
    expect(state.state.palette.object?.stroke).toBe("#111111"); expect(state.state.error).toContain("保存失败");
    expect(state.state.saving).toBe(false);
  });
  it("较早的读取响应不能覆盖刚保存的新颜色", async () => {
    let resolve!: (palette: NodeColorPalette) => void;
    const read = vi.fn().mockResolvedValueOnce({}).mockImplementationOnce(() => new Promise<NodeColorPalette>(r => { resolve = r; }));
    const colors = createCanvasNodeColors({ canvasNodeColors: read, saveCanvasNodeColors: async (_kind, value) => value } as WorkbenchRuntimeApi);
    await colors.refresh();
    const pending = colors.refresh(); await colors.save("object", { stroke: "#0000ff" });
    resolve({ object: { stroke: "#ff0000" } }); await pending;
    expect(colors.state.palette.object?.stroke).toBe("#0000ff");
  });
  it("关闭画布后停止后台轮询", async () => {
    vi.useFakeTimers();
    const read = vi.fn().mockResolvedValue({});
    const colors = createCanvasNodeColors({ canvasNodeColors: read } as unknown as WorkbenchRuntimeApi);
    colors.start(); await colors.refresh(); colors.stop();
    const count = read.mock.calls.length;
    await vi.advanceTimersByTimeAsync(60000);
    expect(read).toHaveBeenCalledTimes(count);
  });
});
