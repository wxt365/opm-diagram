import { afterEach, describe, expect, it, vi } from 'vitest';
import { listenDesktopPrepare, registerDesktopGuard } from './desktop';
afterEach(() => { delete window.opmDesktop; });
describe('桌面退出桥', () => {
  it('Web 环境无需原生桥', () => { expect(listenDesktopPrepare()).toBeTypeOf('function'); });
  it('等待工作台 guard，拒绝时不向主进程确认', async () => {
    let callback: (nonce: string) => void | Promise<void> = () => {};
    const prepared = vi.fn();
    window.opmDesktop = { openSettings: vi.fn(), onPrepare: value => { callback = value; return vi.fn(); }, prepared };
    const unregister = registerDesktopGuard(async () => false); const stop = listenDesktopPrepare();
    await callback('nonce'); expect(prepared).toHaveBeenLastCalledWith('nonce', false);
    unregister(); await callback('next'); expect(prepared).toHaveBeenLastCalledWith('next', true); stop();
  });
});
