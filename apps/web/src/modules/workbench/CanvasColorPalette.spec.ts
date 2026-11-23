import { config, mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import CanvasColorPalette from './CanvasColorPalette.vue';

const defaults = { palette: {}, loaded: true, saving: false, readonly: false };
config.global.stubs.teleport = true;
describe('CanvasColorPalette', () => {
  it('打开五类颜色，分别保存边框和填充，并保留其他颜色覆盖', async () => {
    const wrapper = mount(CanvasColorPalette, { props: { ...defaults, palette: { object: { fill: '#123456' } } } });
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);
    await wrapper.get('[data-testid="canvas-colors-toggle"]').trigger('click');
    expect(wrapper.findAll('input[type="color"]')).toHaveLength(10);
    for (const kind of ['object', 'process', 'attribute', 'operation', 'state']) {
      for (const field of ['stroke', 'fill']) {
        await wrapper.get(`[data-testid="palette-${kind}-${field}"]`).setValue('#abcdef');
        expect(wrapper.emitted('save')!.at(-1)).toEqual([kind, kind === 'object' && field === 'stroke' ? { fill: '#123456', stroke: '#abcdef' } : { [field]: '#abcdef' }]);
      }
    }
    await wrapper.get('[data-testid="palette-object-stroke"]').setValue('#f28c28');
    expect(wrapper.emitted('save')!.at(-1)).toEqual(['object', { fill: '#123456' }]);
    await wrapper.get('[aria-label="恢复对象默认颜色"]').trigger('click');
    expect(wrapper.emitted('save')!.at(-1)).toEqual(['object', {}]);
    wrapper.unmount();
  });

  it.each([{ readonly: true }, { saving: true }, { loaded: false }])('禁止不可编辑状态的修改：%s', async state => {
    const wrapper = mount(CanvasColorPalette, { props: { ...defaults, ...state, error: '保存失败，请重试' } });
    await wrapper.get('[data-testid="canvas-colors-toggle"]').trigger('click');
    expect(wrapper.findAll('input').every(input => input.attributes('disabled') !== undefined)).toBe(true);
    await wrapper.get('[data-testid="palette-object-fill"]').trigger('change');
    expect(wrapper.emitted('save')).toBeUndefined();
    expect(wrapper.get('[role="alert"]').text()).toBe('保存失败，请重试');
    wrapper.unmount();
  });

  it('Escape、关闭按钮和外部点击关闭浮层', async () => {
    const wrapper = mount(CanvasColorPalette, { props: defaults });
    const toggle = wrapper.get('[data-testid="canvas-colors-toggle"]');
    await toggle.trigger('click');
    await wrapper.get('[role="dialog"]').trigger('keydown', { key: 'Escape' });
    expect(toggle.attributes('aria-expanded')).toBe('false');
    await toggle.trigger('click');
    await wrapper.get('[aria-label="关闭调色盘"]').trigger('click');
    expect(toggle.attributes('aria-expanded')).toBe('false');
    await toggle.trigger('click');
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    await wrapper.vm.$nextTick();
    expect(toggle.attributes('aria-expanded')).toBe('false');
    wrapper.unmount();
  });
});
