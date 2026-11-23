import { ref } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import type { Graph } from '@antv/x6';
import { useCanvasNameEditor } from './useCanvasNameEditor';

function setup() {
  const node = { id: 'element', kind: 'OBJECT', label: '原名称', x: 10, y: 20, width: 160, height: 72, nameY: 22 };
  let editable = true;
  const submit = vi.fn(async () => true);
  const input = document.createElement('input'), host = document.createElement('div');
  const editor = useCanvasNameEditor({ nodes: [node], selectedId: node.id, editable: () => editable,
    beginNameEdit: async () => true, submitNameEdit: submit }, ref(host), ref(input),
  () => ({ localToClient: (r: unknown) => r }) as Graph, () => {});
  return { ...editor, node, submit, readonly: () => { editable = false; } };
}
describe('共用图上名称编辑生命周期', () => {
  it('中文组合输入不提前提交，失焦后等最终文本，只提交一次', async () => {
    const e = setup(); await e.openNameEditor(e.node);
    e.nameEditor.composing = true; e.nameEditor.value = 'zhong';
    e.handleNameKeydown(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true }));
    e.handleNameBlur(); expect(e.submit).not.toHaveBeenCalled();
    e.nameEditor.value = '中文名称'; await e.handleNameCompositionEnd();
    expect(e.submit).toHaveBeenCalledExactlyOnceWith('element', '中文名称');
    expect(e.nameEditor.active).toBe(false);
  });
  it('Esc 与关闭取消输入，未改名不提交', async () => {
    const e = setup(); await e.openNameEditor(e.node); e.nameEditor.value = '取消';
    e.handleNameKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(e.nameEditor.active).toBe(false); expect(e.submit).not.toHaveBeenCalled();
    await e.openNameEditor(e.node); await e.finishNameEdit(); expect(e.submit).not.toHaveBeenCalled();
  });
  it('失败保留输入；异步开始期间切到只读不打开编辑器', async () => {
    const e = setup(); e.submit.mockResolvedValue(false); await e.openNameEditor(e.node);
    e.nameEditor.value = '无效'; expect(await e.finishNameEdit()).toBe(false);
    expect(e.nameEditor.value).toBe('无效'); e.closeNameEditor();
    const opening = e.openNameEditor(e.node); e.readonly(); await opening;
    expect(e.nameEditor.active).toBe(false);
  });
});
