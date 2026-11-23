import { onActivated, onBeforeUnmount, onDeactivated, onMounted, watch } from "vue";

/** 每个工作台独立调度；请求结束后再计时，避免慢请求累积。 */
export function useDraftStatePolling(enabled: () => boolean, busy: () => boolean, poll: () => Promise<boolean | void>) {
  let active = false, running = false, failures = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const visible = () => active && document.visibilityState !== "hidden" && enabled();
  function clear() { clearTimeout(timer); timer = undefined; }
  function schedule(immediate = false) {
    clear();
    if (!visible() || running) return;
    const interval = busy() ? 2000 : 15000;
    const delay = failures ? Math.min(30000, interval * 2 ** Math.min(failures, 4)) : interval;
    timer = setTimeout(() => { void synchronize(); }, immediate ? 0 : delay);
  }
  async function synchronize() {
    if (!visible() || running) return;
    running = true;
    try { failures = await poll() === false ? failures + 1 : 0; }
    catch { failures++; }
    finally { running = false; schedule(); }
  }
  function visibilityChanged() { schedule(true); }
  function activate() {
    if (active) return;
    active = true; schedule(true);
  }
  onMounted(() => { document.addEventListener("visibilitychange", visibilityChanged); activate(); });
  onActivated(activate);
  onDeactivated(() => { active = false; clear(); });
  onBeforeUnmount(() => { active = false; clear(); document.removeEventListener("visibilitychange", visibilityChanged); });
  watch([enabled, busy], ([isEnabled], [wasEnabled]) => {
    if (!isEnabled) failures = 0;
    schedule(isEnabled && !wasEnabled);
  });
}
