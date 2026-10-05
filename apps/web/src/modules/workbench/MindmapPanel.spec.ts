import { mount, flushPromises } from '@vue/test-utils';
import { beforeEach, expect, it, vi } from 'vitest';
import MindmapPanel from './MindmapPanel.vue';
import { importMindmap, mindmapConversionIssues, mindmapLayout } from './mindmapModel';
import { localRuntimeApi } from '@/shared/api/localRuntimeApi';
import type { MindmapDocument, MindmapResult } from '@/shared/api/generated/draftWorkspaceContract';
vi.mock('@/shared/api/localRuntimeApi', () => ({ localRuntimeApi: { draftQuery: vi.fn() } }));
const token = { draft_id: 'draft.test', edit_seq: 0, binding_digest: 'a'.repeat(64) };
const doc: MindmapDocument = { format_version: 1, id: 'mindmap.test', revision: 0, root_id: 'root', nodes: [
  { id: 'root', parent_id: null, order: 0, label: '模型分析', note: '', kind: 'TOPIC', owner_id: null, entity_ref: null, target_id: null, collapsed: false },
  { id: 'beans', parent_id: 'root', order: 0, label: '咖啡豆', note: '', kind: 'OBJECT', owner_id: null, entity_ref: null, target_id: 'element.beans', collapsed: false },
  { id: 'raw', parent_id: 'beans', order: 0, label: '待烘焙', note: '', kind: 'STATE', owner_id: 'beans', entity_ref: null, target_id: null, collapsed: false },
], relations: [] };
const result = (): MindmapResult => ({ request_id: 'request.test', document: structuredClone(doc), digest: 'b'.repeat(64), conversions: [] });
function setup() { return mount(MindmapPanel, { props: { projectId: 'project.test', modelId: 'model.test', token, readonly: false, generating: false, contexts: [{ id: 'context.root', label: 'SD' }], activeContext: 'context.root', targets: [] } }); }
it('属性问题集中展示、定位与明确排除；两个生成入口使用相同目标和排除项', async () => {
  const value = result(); value.document.nodes.push({ ...value.document.nodes[1]!, id: 'dose', label: '目标粉量', kind: 'ATTRIBUTE', owner_id: 'beans', target_id: null });
  vi.mocked(localRuntimeApi.draftQuery).mockImplementation(async (_p, _m, _op, input) => ({ ...value, request_id: (input as { request_id: string }).request_id }) as never);
  const w = setup(); await flushPromises();
  expect(w.get('[data-testid="mindmap-conversion-issues"]').text()).toContain('首版尚不支持属性转换');
  expect(w.get('[data-testid="mindmap-convert"]').attributes('disabled')).toBeDefined();
  await w.get('[data-testid="mindmap-conversion-issues"] button').trigger('click');
  expect(w.get('[data-testid="mindmap-node-label"]').element).toHaveProperty('value', '目标粉量');
  await (w.vm as unknown as { generatePreview: () => Promise<void> }).generatePreview(); expect(w.emitted('convert')).toBeUndefined();
  await w.get('[data-testid="mindmap-conversion-issues"] input').setValue(true);
  expect(w.find('[data-testid="mindmap-conversion-issues"]').exists()).toBe(false);
  await (w.vm as unknown as { generatePreview: () => Promise<void> }).generatePreview();
  expect(w.emitted('convert')?.[0]).toEqual([{ contextId: 'context.root', excludedIds: ['dose'] }]);
  expect(w.text()).toContain('本次未纳入 1 项'); w.unmount();
});
it('状态归属、未分类和已排除关系端点显示具体诊断，不悄悄丢弃依赖', () => {
  const value = structuredClone(doc); value.nodes[2]!.owner_id = null;
  value.nodes.push({ ...value.nodes[1]!, id: 'unknown', kind: 'UNCLASSIFIED' });
  value.relations.push({ id: 'relation.test', label: '关系待明确', capability_id: null, endpoints: ['beans', 'raw'] });
  expect(mindmapConversionIssues(value, []).map(item => item.id)).toEqual(['raw', 'unknown', 'relation.test']);
  value.relations[0]!.capability_id = 'CAP-ISO-PROC-003'; value.nodes[2]!.owner_id = 'beans';
  expect(mindmapConversionIssues(value, ['beans', 'unknown']).map(item => item.id)).toEqual(['raw', 'relation.test']);
});
beforeEach(() => { vi.clearAllMocks(); vi.mocked(localRuntimeApi.draftQuery).mockImplementation(async (_p, _m, _op, input) => {
  const request = input as { document?: MindmapDocument; action: string; request_id: string }; const value = result(); value.request_id = request.request_id;
  if (request.action === 'SAVE') value.document = { ...structuredClone(request.document!), revision: request.document!.revision + 1 }; return value as never;
}); });
it('响应式文档可通过键盘编辑、撤销并保存，分析保存不提交正式命令', async () => {
  const w = setup(); await flushPromises(); await w.get('[data-testid="mindmap-canvas"]').trigger('keydown', { key: 'Tab' }); await flushPromises();
  expect(w.findAll('.mindmap-node')).toHaveLength(4); await w.get('[data-testid="mindmap-node-label"]').setValue('新增过程');
  await w.get('[data-testid="mindmap-node-kind"]').setValue('PROCESS'); await w.get('[data-testid="mindmap-save"]').trigger('click'); await flushPromises();
  expect(w.get('[data-testid="mindmap-save-state"]').text()).toBe('分析已保存');
  const request = vi.mocked(localRuntimeApi.draftQuery).mock.calls.at(-1)![3] as { document: MindmapDocument; expected_revision: number };
  expect(request.expected_revision).toBe(0); expect(request.document.nodes.at(-1)?.label).toBe('新增过程');
  expect(w.emitted('invalidated')?.length).toBeGreaterThan(0);
  await w.get('[data-testid="mindmap-canvas"]').trigger('keydown', { key: 'z', ctrlKey: true }); await flushPromises();
  expect(w.get('[data-testid="mindmap-save-state"]').text()).toBe('分析未保存'); w.unmount();
});
it('保存冲突保留本地内容，可导出备份；生成期间和只读禁止编辑', async () => {
  const w = setup(); await flushPromises(); await w.get('[data-testid="mindmap-add-child"]').trigger('click'); await flushPromises();
  vi.mocked(localRuntimeApi.draftQuery).mockRejectedValueOnce(new Error('DRAFT_CONFLICT'));
  await w.get('[data-testid="mindmap-save"]').trigger('click'); await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain('当前内容已保留'); expect(w.findAll('.mindmap-node')).toHaveLength(4);
  await w.setProps({ generating: true }); expect(w.get('[data-testid="mindmap-add-child"]').attributes('disabled')).toBeDefined();
  await w.get('[data-testid="mindmap-canvas"]').trigger('keydown', { key: 'Tab' }); expect(w.findAll('.mindmap-node')).toHaveLength(4);
  await w.setProps({ readonly: true }); expect(w.get('[data-testid="mindmap-convert"]').attributes('disabled')).toBeDefined(); w.unmount();
});
it('JSON 迁移重建分析身份，保留内部引用，清除环境特定绑定并拒绝坏树', () => {
  const imported = importMindmap({ format: 'opm-mindmap', version: 1, document: doc }, doc);
  expect(imported.id).toBe(doc.id); expect(imported.root_id).not.toBe(doc.root_id); expect(imported.nodes[1]?.target_id).toBeNull();
  expect(imported.nodes[2]?.owner_id).toBe(imported.nodes[1]?.id); expect(mindmapLayout(imported)).toHaveLength(3);
  const invalid = structuredClone(doc); invalid.nodes[1]!.parent_id = 'raw';
  expect(() => importMindmap({ format: 'opm-mindmap', version: 1, document: invalid }, doc)).toThrow('循环');
  expect(() => importMindmap({ format: 'opm-mindmap', version: 2, document: doc }, doc)).toThrow('版本');
});
it('拒绝错配响应并保留本地编辑，不把错误修订显示为保存成功', async () => {
  const w = setup(); await flushPromises(); await w.get('[data-testid="mindmap-node-label"]').setValue('本地分析');
  vi.mocked(localRuntimeApi.draftQuery).mockResolvedValueOnce(result() as never);
  await w.get('[data-testid="mindmap-save"]').trigger('click'); await flushPromises();
  expect(w.get('[role="alert"]').text()).toContain('响应身份或修订不匹配');
  expect(w.get('[data-testid="mindmap-node-label"]').element).toHaveProperty('value', '本地分析');
  expect(w.get('[data-testid="mindmap-save-state"]').text()).toBe('分析未保存'); w.unmount();
});
it('折叠保持语义资料，搜索能展开深层节点，删除只影响分析树', async () => {
  const w = setup(); await flushPromises();
  await w.get('[aria-label="折叠 咖啡豆"]').trigger('click'); expect(w.findAll('.mindmap-node')).toHaveLength(2);
  await w.get('[aria-label="搜索分析节点"]').setValue('待烘焙'); expect(w.findAll('.mindmap-node')).toHaveLength(3);
  await w.get('[data-testid="mindmap-canvas"]').trigger('keydown', { key: 'Delete' });
  const confirm = w.findAll('button').find(button => button.text() === '确认删除分析')!; await confirm.trigger('click');
  expect(w.findAll('.mindmap-node')).toHaveLength(2); w.unmount();
});
it('脑图键盘不冒泡到 OPD 全局监听，输入框保存快捷键只保存分析', async () => {
  const listener = vi.fn(); window.addEventListener('keydown', listener); const w = setup(); document.body.append(w.element); await flushPromises();
  await w.get('[data-testid="mindmap-canvas"]').trigger('keydown', { key: 'Delete' });
  await w.get('[data-testid="mindmap-node-label"]').setValue('分析独立编辑');
  await w.get('[data-testid="mindmap-node-label"]').trigger('keydown', { key: 's', ctrlKey: true }); await flushPromises();
  expect(listener).not.toHaveBeenCalled(); expect(w.get('[data-testid="mindmap-save-state"]').text()).toBe('分析已保存');
  expect(vi.mocked(localRuntimeApi.draftQuery).mock.calls.map(call => call[2])).toEqual(['mindmap', 'mindmap']);
  window.removeEventListener('keydown', listener); w.unmount();
});
