type PrepareGuard = () => Promise<boolean>;
let guard: PrepareGuard | undefined;

export const isDesktop = () => typeof window !== 'undefined' && !!window.opmDesktop;
export function openDesktopSettings() { return window.opmDesktop?.openSettings(); }
export function registerDesktopGuard(value: PrepareGuard) {
  guard = value;
  return () => { if (guard === value) guard = undefined; };
}

/** 退出、备份和恢复共用工作台的输入提交与保存校验。 */
export function listenDesktopPrepare() {
  return window.opmDesktop?.onPrepare(async nonce => {
    let accepted = false;
    try { accepted = guard ? await guard() : true; }
    finally { window.opmDesktop?.prepared(nonce, accepted); }
  }) ?? (() => {});
}
