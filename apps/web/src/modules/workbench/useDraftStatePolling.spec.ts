/* eslint-disable vue/one-component-per-file -- 生命周期测试需要 KeepAlive 宿主和替换组件。 */
import { defineComponent, h, KeepAlive, nextTick, ref } from "vue";
import { mount, type VueWrapper } from "@vue/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDraftStatePolling } from "./useDraftStatePolling";

describe("草稿状态调度", () => {
  const wrappers: VueWrapper[] = [];
  beforeEach(() => { vi.useFakeTimers(); vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); });
  afterEach(() => { wrappers.splice(0).forEach(wrapper => wrapper.unmount()); vi.useRealTimers(); vi.restoreAllMocks(); });
  function setup(poll = vi.fn(async (): Promise<boolean | void> => true), keepAlive = false) {
    const enabled = ref(true), busy = ref(false), shown = ref(true);
    const child = defineComponent({ setup() { useDraftStatePolling(() => enabled.value, () => busy.value, poll); return () => h("div"); } });
    const other = defineComponent({ render: () => h("span") });
    const wrapper = mount(keepAlive ? defineComponent({ render: () => h(KeepAlive, () => shown.value ? h(child) : h(other)) }) : child);
    wrappers.push(wrapper); return { wrapper, enabled, busy, shown, poll };
  }
  it("空闲15秒，待保存2秒，恢复空闲后降低频率", async () => {
    const { busy, poll } = setup();
    await vi.advanceTimersByTimeAsync(0); expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(14999); expect(poll).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1); expect(poll).toHaveBeenCalledTimes(2);
    busy.value = true; await nextTick();
    await vi.advanceTimersByTimeAsync(1999); expect(poll).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1); expect(poll).toHaveBeenCalledTimes(3);
    busy.value = false; await nextTick();
    await vi.advanceTimersByTimeAsync(14999); expect(poll).toHaveBeenCalledTimes(3);
    await vi.advanceTimersByTimeAsync(1); expect(poll).toHaveBeenCalledTimes(4);
  });
  it("页面隐藏/禁用暂停，恢复立即同步；卸载后不继续调度", async () => {
    const { enabled, wrapper, poll } = setup(); await vi.advanceTimersByTimeAsync(0);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("hidden"); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(60000); expect(poll).toHaveBeenCalledTimes(1);
    vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible"); document.dispatchEvent(new Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0); expect(poll).toHaveBeenCalledTimes(2);
    enabled.value = false; await nextTick(); await vi.advanceTimersByTimeAsync(60000); expect(poll).toHaveBeenCalledTimes(2);
    enabled.value = true; await nextTick(); await vi.advanceTimersByTimeAsync(0); expect(poll).toHaveBeenCalledTimes(3);
    wrapper.unmount(); await vi.advanceTimersByTimeAsync(60000); expect(poll).toHaveBeenCalledTimes(3);
  });
  it("KeepAlive停用暂停，激活一次同步，初次挂载不重复", async () => {
    const { shown, poll } = setup(undefined, true); await vi.advanceTimersByTimeAsync(0);
    expect(poll).toHaveBeenCalledTimes(1); shown.value = false; await nextTick();
    await vi.advanceTimersByTimeAsync(60000); expect(poll).toHaveBeenCalledTimes(1);
    shown.value = true; await nextTick(); await vi.advanceTimersByTimeAsync(0); expect(poll).toHaveBeenCalledTimes(2);
  });
  it("慢请求期间不重叠，迟到完成不会在卸载后重新启动", async () => {
    let complete!: (value: boolean) => void;
    const poll = vi.fn(() => new Promise<boolean>(resolve => { complete = resolve; }));
    const { busy, wrapper } = setup(poll); await vi.advanceTimersByTimeAsync(0);
    busy.value = true; await nextTick(); await vi.advanceTimersByTimeAsync(60000); expect(poll).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("visibilitychange")); await vi.advanceTimersByTimeAsync(0); expect(poll).toHaveBeenCalledTimes(1);
    complete(true); await vi.advanceTimersByTimeAsync(2000); expect(poll).toHaveBeenCalledTimes(2);
    wrapper.unmount(); complete(true); await vi.advanceTimersByTimeAsync(60000); expect(poll).toHaveBeenCalledTimes(2);
  });
  it("连续失败退避到30秒，成功后恢复频率，多实例不互相暂停", async () => {
    const first = setup(vi.fn(async () => false)), second = setup();
    await vi.advanceTimersByTimeAsync(0); first.busy.value = true; await nextTick();
    // 失败间隔 4、8、16、30 秒。
    await vi.advanceTimersByTimeAsync(28000); expect(first.poll).toHaveBeenCalledTimes(4);
    await vi.advanceTimersByTimeAsync(29999); expect(first.poll).toHaveBeenCalledTimes(4);
    first.poll.mockResolvedValueOnce(true); await vi.advanceTimersByTimeAsync(1); expect(first.poll).toHaveBeenCalledTimes(5);
    await vi.advanceTimersByTimeAsync(2000); expect(first.poll).toHaveBeenCalledTimes(6);
    first.wrapper.unmount(); const count = second.poll.mock.calls.length;
    await vi.advanceTimersByTimeAsync(15000); expect(second.poll).toHaveBeenCalledTimes(count + 1);
  });
});
