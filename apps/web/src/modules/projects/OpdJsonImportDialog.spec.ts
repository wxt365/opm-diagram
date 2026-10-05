import { mount, flushPromises } from "@vue/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import OpdJsonImportDialog from "./OpdJsonImportDialog.vue";
import { localRuntimeApi } from "@/shared/api/localRuntimeApi";
vi.mock("@/shared/api/localRuntimeApi", () => ({ localRuntimeApi: { importOpdJson: vi.fn() } }));
const sample = { format: "OPM-OPD-JSON", format_version: "1.0", entry_context_id: "context.root", semantic_revision: { contexts: [{ context_id: "context.root", name: { local_name: "咖啡烘焙" } }], elements: [{}], states: [], facts: [] } };
afterEach(() => { vi.clearAllMocks(); document.body.innerHTML = ""; });
async function choose(wrapper: ReturnType<typeof mount>, value: string, size = value.length) {
  const file = new File([value], "coffee.opd.json", { type: "application/json" });
  Object.defineProperty(file, "text", { value: async () => value }); Object.defineProperty(file, "size", { value: size });
  Object.defineProperty(wrapper.get("input[type=file]").element, "files", { configurable: true, value: [file] });
  await wrapper.get("input[type=file]").trigger("change"); await flushPromises();
}
describe("OPD JSON 导入", () => {
  it("文件预览与名称确认后只提交一次，失败重试保留命令ID", async () => {
    const wrapper = mount(OpdJsonImportDialog, { props: { projectId: "project.target" } });
    await choose(wrapper, JSON.stringify(sample)); expect(wrapper.get('[data-testid="opd-json-preview"]').text()).toContain("咖啡烘焙 · 1 张图");
    vi.mocked(localRuntimeApi.importOpdJson).mockRejectedValueOnce(new Error("网络断开")).mockResolvedValueOnce({ model_id: "model.import", context_id: "context.root" } as never);
    await wrapper.get("form").trigger("submit"); await flushPromises(); expect(wrapper.get('[role="alert"]').text()).toBe("网络断开");
    const id = vi.mocked(localRuntimeApi.importOpdJson).mock.calls[0]![3];
    await wrapper.get("form").trigger("submit"); await flushPromises(); expect(vi.mocked(localRuntimeApi.importOpdJson).mock.calls[1]![3]).toBe(id);
    expect(wrapper.emitted("imported")).toEqual([["model.import", "context.root"]]); wrapper.unmount();
  });
  it("损坏JSON、未知版本和过大文件均禁止提交且不请求后端", async () => {
    const wrapper = mount(OpdJsonImportDialog, { props: { projectId: "project.target" } });
    for (const value of ["{", JSON.stringify({ ...sample, format_version: "2.0" }), JSON.stringify({ ...sample, entry_context_id: "context.missing" })]) {
      await choose(wrapper, value); expect(wrapper.find('[role="alert"]').exists()).toBe(true); expect(wrapper.get('[data-testid="opd-json-import-confirm"]').attributes("disabled")).toBeDefined();
    }
    await choose(wrapper, JSON.stringify(sample), 10 * 1024 * 1024 + 1); expect(wrapper.get('[role="alert"]').text()).toContain("10 MiB"); expect(localRuntimeApi.importOpdJson).not.toHaveBeenCalled(); wrapper.unmount();
  });
  it("取消关闭且导入中不能重复提交或关闭", async () => {
    const wrapper = mount(OpdJsonImportDialog, { props: { projectId: "project.target" } }); await choose(wrapper, JSON.stringify(sample));
    let complete: (value: never) => void;
    vi.mocked(localRuntimeApi.importOpdJson).mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    await wrapper.get("form").trigger("submit"); await wrapper.get("form").trigger("submit"); await wrapper.get("form").trigger("keydown", { key: "Escape" });
    expect(localRuntimeApi.importOpdJson).toHaveBeenCalledTimes(1); expect(wrapper.emitted("close")).toBeUndefined();
    complete!({ model_id: "model.import", context_id: "context.root" } as never); await flushPromises(); wrapper.unmount();
  });
});
