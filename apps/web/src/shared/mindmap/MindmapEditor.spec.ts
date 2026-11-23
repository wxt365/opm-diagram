import { mount, flushPromises } from '@vue/test-utils';
import { afterEach, expect, it, vi } from 'vitest';
import MindmapEditor from './MindmapEditor.vue';
import { layoutMindmap, type MindmapTreeNode } from './mindmapTree';
import { applyMindmapMove } from './mindmapTree';
import { markdownBranch } from './mindmapFiles';

let wrapper: ReturnType<typeof mount>;
const nodes = (): MindmapTreeNode[] => [
  { id:'root', parent_id:null, label:'业务主题', note:'保留说明', order:0, collapsed:false },
  { id:'a', parent_id:'root', label:'审批', note:'', order:0, collapsed:false },
  { id:'b', parent_id:'a', label:'财务复核', note:'', order:0, collapsed:false },
  { id:'c', parent_id:'root', label:'归档', note:'', order:1, collapsed:false },
];
async function open() {
  wrapper = mount(MindmapEditor, { attachTo:document.body, props:{ label:'验收脑图', documentId:'analysis.1', rootId:'root', nodes:nodes(), selectedId:'a', locked:false, saveBlocked:false, loading:false, saving:false, canUndo:true, canRedo:true, saveLabel:'分析已保存', saveConfirmed:true, generationTitle:'生成模型' } });
  await flushPromises();
}
afterEach(() => { wrapper?.unmount(); vi.restoreAllMocks(); });
it('键盘新增、删除确认、历史与保存共用事件，输入和中文选字不触发树操作', async () => {
  await open();
  const canvas = wrapper.get('[data-testid="mindmap-canvas"]');
  await canvas.trigger('keydown',{key:'Tab'}); await canvas.trigger('keydown',{key:'Enter'});
  expect(wrapper.emitted('add')).toEqual([[true],[false]]);
  for(const options of [{isComposing:true},{keyCode:229},{repeat:true},{altKey:true}]) await canvas.trigger('keydown',{key:'Enter',...options});
  await wrapper.get('[data-testid="mindmap-node-label"]').trigger('keydown',{key:'Enter'});
  expect(wrapper.emitted('add')).toHaveLength(2);
  await canvas.trigger('keydown',{key:'Delete'});
  expect(wrapper.emitted('remove')).toBeUndefined();
  await wrapper.findAll('button').find(b=>b.text()==='确认删除分析')!.trigger('click');
  expect(wrapper.emitted('remove')).toHaveLength(1);
  await canvas.trigger('keydown',{key:'z',ctrlKey:true}); await canvas.trigger('keydown',{key:'z',metaKey:true,shiftKey:true});
  expect(wrapper.emitted('history')).toEqual([[false],[true]]);
  await wrapper.get('[data-testid="mindmap-node-label"]').trigger('keydown',{key:'s',ctrlKey:true});
  expect(wrapper.emitted('save')).toHaveLength(1);
});
it('只读禁止编辑、拖动、折叠和删除确认，保留搜索与缩放',async()=>{
  await open(); await wrapper.get('[data-testid="mindmap-canvas"]').trigger('keydown',{key:'Delete'});
  await wrapper.setProps({locked:true,saveBlocked:true});
  await wrapper.findAll('button').find(b=>b.text()==='确认删除分析')!.trigger('click');
  await wrapper.get('[data-testid="mindmap-canvas"]').trigger('keydown',{key:'Tab'});
  expect(wrapper.emitted('remove')).toBeUndefined(); expect(wrapper.emitted('add')).toBeUndefined();
  expect(wrapper.get('[data-testid="mindmap-node-label"]').attributes('disabled')).toBeDefined();
  expect(wrapper.get('[aria-label="折叠 审批"]').attributes('disabled')).toBeDefined();
  expect(wrapper.get('[data-testid="mindmap-node-a"]').attributes('draggable')).toBe('false');
  await wrapper.get('[aria-label="搜索分析节点"]').setValue('财务');await flushPromises();
  expect(wrapper.emitted('update:selectedId')?.at(-1)).toEqual(['b']);
  expect(wrapper.emitted('expand')).toBeUndefined();
});
it('拖动合法节点发出身份，拒绝根节点、自己和后代作为父级',async()=>{
  await open();
  await wrapper.get('[data-testid="mindmap-node-a"]').trigger('dragstart');
  await wrapper.get('[data-testid="mindmap-node-b"]').trigger('drop');
  expect(wrapper.emitted('reparent')).toBeUndefined();
  await wrapper.get('[data-testid="mindmap-node-a"]').trigger('dragstart');
  await wrapper.get('[data-testid="mindmap-node-c"]').trigger('drop');
  expect(wrapper.emitted('reparent')).toEqual([['a','c']]);
  await wrapper.get('[data-testid="mindmap-node-root"]').trigger('dragstart');
  await wrapper.get('[data-testid="mindmap-node-c"]').trigger('drop');
  expect(wrapper.emitted('reparent')).toHaveLength(1);
});
it('折叠与搜索只通过适配事件修改文档，换文档清除搜索和视口状态',async()=>{
  await open();
  await wrapper.get('[aria-label="折叠 审批"]').trigger('click');
  expect(wrapper.emitted('updateNode')).toEqual([['a',{collapsed:true}]]);
  await wrapper.setProps({nodes:nodes().map(n=>n.id==='a'?{...n,collapsed:true}:n)});
  expect(wrapper.find('[data-testid="mindmap-node-b"]').exists()).toBe(false);
  await wrapper.get('[aria-label="搜索分析节点"]').setValue('财务'); await flushPromises();
  expect(wrapper.emitted('expand')?.at(-1)?.[0]).toEqual(['a','root']);
  await wrapper.setProps({documentId:'analysis.2',nodes:nodes(),selectedId:'root'});await flushPromises();
  expect(wrapper.get<HTMLInputElement>('[aria-label="搜索分析节点"]').element.value).toBe('');
});
it('右侧栏关闭后F2重新打开并聚焦名称，键盘不冒泡到正式画布',async()=>{
  await open(); const listener=vi.fn();window.addEventListener('keydown',listener);
  try {
    await wrapper.get('[aria-label="切换脑图右侧栏"]').trigger('click');
    expect(wrapper.find('.mindmap-details').exists()).toBe(false);
    await wrapper.get('[data-testid="mindmap-canvas"]').trigger('keydown',{key:'F2'});await flushPromises();
    expect(wrapper.get('[data-testid="mindmap-node-label"]').element).toBe(document.activeElement);
    expect(listener).not.toHaveBeenCalled();
  } finally { window.removeEventListener('keydown',listener); }
});
it('全屏时按需提供助手挂载位置，回到普通画布时收起', async () => {
  await open();
  const mindmap = wrapper.get('[data-testid="mindmap-panel"]').element;
  const fullscreenDescriptor = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
  const toggle = () => wrapper.findAll('[aria-label="智能助手"]')[0];
  const host = wrapper.get('[aria-label="脑图全屏智能助手"]');
  const change = async (element: Element | null) => {
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: element });
    document.dispatchEvent(new Event('fullscreenchange'));
    await flushPromises();
  };

  try {
    expect(toggle()).toBeUndefined();
    await change(mindmap);
    expect(host.isVisible()).toBe(false);
    await toggle()!.trigger('click');
    expect(host.isVisible()).toBe(true);
    expect(wrapper.emitted('assistant-target')?.at(-1)).toEqual([host.get('.assistant-window-content').element]);

    const workspace = wrapper.get<HTMLElement>('.mindmap-workspace').element;
    Object.defineProperties(workspace, { clientWidth: { value: 900 }, clientHeight: { value: 700 } });
    vi.spyOn(workspace, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 45, 900, 700));
    const measureHost = vi.spyOn(host.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(498, 57, 390, 636));
    const leftResize = host.get('[aria-label="从左下角调整助手窗口大小"]');
    await leftResize.trigger('keydown', { key: 'ArrowLeft' });
    expect(host.attributes('style')).toContain('left: 482px; top: 12px; width: 406px; height: 636px;');
    measureHost.mockReturnValue(new DOMRect(482, 57, 406, 636));

    const moveHandle = host.get('[aria-label="移动助手窗口"]');
    moveHandle.element.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, isPrimary: true, clientX: 680, clientY: 60 }));
    moveHandle.element.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 20, clientY: 680 }));
    moveHandle.element.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1 }));
    await flushPromises();
    expect(host.attributes('style')).toContain('left: 0px; top: 64px; width: 406px; height: 636px;');
    await toggle()!.trigger('click');
    await toggle()!.trigger('click');
    expect(host.attributes('style')).toContain('left: 0px; top: 64px; width: 406px; height: 636px;');
    await change(null);
    expect(toggle()).toBeUndefined();
    expect(host.isVisible()).toBe(false);
    expect(wrapper.emitted('assistant-target')?.at(-1)).toEqual([null]);
  } finally {
    if (fullscreenDescriptor) Object.defineProperty(document, 'fullscreenElement', fullscreenDescriptor);
    else Reflect.deleteProperty(document, 'fullscreenElement');
  }
});
it('两种文档使用同一布局，折叠隐藏子节点但不改变输入',()=>{
  const source=nodes(), tree={root_id:'root',nodes:source};
  const semantic={root_id:'root',nodes:source.map(node=>({...node,kind:'OBJECT'}))};
  expect(layoutMindmap(tree).map(({x,y})=>({x,y}))).toEqual(layoutMindmap(semantic).map(({x,y})=>({x,y})));
  expect(layoutMindmap({...tree,nodes:source.map(node=>node.id==='a'?{...node,collapsed:true}:node)})).toHaveLength(3);
  expect(tree.nodes).toHaveLength(4);
});
it('小地图只移动视口，框线随缩放更新并跟随折叠后的画布范围', async () => {
  await open();
  const canvas = wrapper.get('[data-testid="mindmap-canvas"]');
  Object.defineProperties(canvas.element, { clientWidth: { value: 420 }, clientHeight: { value: 240 } });
  const toggle = wrapper.get('[aria-label="小地图"]');
  expect(wrapper.find('[data-testid="mindmap-minimap"]').exists()).toBe(false);
  await toggle.trigger('click');
  const map = wrapper.get('[data-testid="mindmap-minimap"]');
  expect(map.findAll('.mindmap-minimap__node')).toHaveLength(4);
  const frame = map.get('.mindmap-minimap__frame');
  const initialFrame = frame.attributes('style');
  await map.trigger('keydown', { key: 'ArrowRight' });
  expect(wrapper.get('.mindmap-scene').attributes('style')).toContain('translate(-38px, 10px)');
  expect(frame.attributes('style')).not.toBe(initialFrame);
  const movedFrame = frame.attributes('style');
  await wrapper.get('[data-testid="p03-zoom-output"]').setValue('125%');
  await wrapper.get('[data-testid="p03-zoom-output"]').trigger('keydown', { key: 'Enter' });
  expect(frame.attributes('style')).not.toBe(movedFrame);
  expect(wrapper.emitted('add')).toBeUndefined();
  expect(wrapper.emitted('updateNode')).toBeUndefined();
  await wrapper.setProps({ nodes: nodes().map(node => ({ ...node, collapsed: node.id === 'a' })) });
  expect(map.findAll('.mindmap-minimap__node')).toHaveLength(3);
  await toggle.trigger('click');
  expect(wrapper.find('[data-testid="mindmap-minimap"]').exists()).toBe(false);
});
it('左右展开镜像左侧连线，切换回原布局不修改节点', async () => {
  await open();
  const picker = wrapper.get<HTMLSelectElement>('[aria-label="脑图布局"]');
  const left = (id: string) => parseFloat(wrapper.get<HTMLElement>(`[data-testid="mindmap-node-${id}"]`).element.style.left);
  const defaultPaths = wrapper.findAll('.mindmap-connectors path').map(path => path.attributes('d'));
  expect(picker.element.value).toBe('right');
  expect(left('c')).toBeGreaterThan(left('root'));
  await picker.setValue('bilateral');
  expect(left('c')).toBeLessThan(left('root'));
  expect(left('a')).toBeGreaterThan(left('root'));
  expect(left('b')).toBeGreaterThan(left('a'));
  expect(wrapper.findAll('.mindmap-connectors path').some(path => path.attributes('d')?.startsWith(`M ${left('root')} `))).toBe(true);
  expect(wrapper.get('[data-testid="mindmap-node-a"]').classes()).toContain('is-selected');
  expect(wrapper.emitted('updateNode')).toBeUndefined();
  expect(wrapper.emitted('save')).toBeUndefined();
  await picker.setValue('right');
  expect(wrapper.findAll('.mindmap-connectors path').map(path => path.attributes('d'))).toEqual(defaultPaths);
});
it('纵向布局向下连接并按横向落点排序，分支仍保留原层级样式', async () => {
  await open();
  const node = (id: string) => wrapper.get<HTMLElement>(`[data-testid="mindmap-node-${id}"]`);
  const root = node('root'), first = node('a'), detail = node('b'), sibling = node('c');
  await wrapper.get('[aria-label="脑图布局"]').setValue('down');
  expect(parseFloat(first.element.style.top)).toBeGreaterThan(parseFloat(root.element.style.top));
  expect(first.element.style.top).toBe(sibling.element.style.top);
  expect(parseFloat(first.element.style.left)).toBeLessThan(parseFloat(sibling.element.style.left));
  expect(parseFloat(detail.element.style.top)).toBeGreaterThan(parseFloat(first.element.style.top));
  expect(wrapper.findAll('.mindmap-connectors path').some(path => path.attributes('d')?.endsWith('133 152'))).toBe(true);
  expect(new Set([root, first, detail].map(item => item.element.style.getPropertyValue('--mindmap-node-fill'))).size).toBe(3);

  vi.spyOn(first.element, 'getBoundingClientRect').mockReturnValue(new DOMRect(0, 0, 202, 64));
  await sibling.trigger('dragstart');
  first.element.dispatchEvent(new MouseEvent('dragover', { bubbles: true, cancelable: true, clientX: 4, clientY: 32 }));
  await flushPromises();
  expect(first.classes()).toContain('mindmap-drop--before');
  await first.trigger('drop');
  expect(wrapper.emitted('reparent')).toEqual([['c', 'a', 'before']]);

  const fill = first.element.style.getPropertyValue('--mindmap-node-fill');
  await wrapper.findAll('button').find(button => button.text() === '聚焦分支')!.trigger('click');
  expect(wrapper.find('[data-testid="mindmap-node-root"]').exists()).toBe(false);
  expect(node('a').element.style.getPropertyValue('--mindmap-node-fill')).toBe(fill);
});
it('调整层级宽高后按新尺寸排列三种布局并保持选择，恢复按钮还原默认值', async () => {
  await open();
  const node = (id: string) => wrapper.get<HTMLElement>(`[data-testid="mindmap-node-${id}"]`);
  const picker = wrapper.get('[aria-label="脑图布局"]');
  const width = wrapper.get<HTMLInputElement>('[aria-label="根主题宽度"]');
  const height = wrapper.get<HTMLInputElement>('[aria-label="一级分支高度"]');
  await width.setValue('320');
  await height.setValue('95');
  expect(node('root').element.style.width).toBe('320px');
  expect(node('a').element.style.height).toBe('95px');
  expect(node('c').element.style.height).toBe('95px');
  expect(node('b').element.style.height).toBe('64px');
  expect(node('a').element.style.left).toBe('396px');
  expect(node('a').classes()).toContain('is-selected');
  await picker.setValue('bilateral');
  expect(parseFloat(node('c').element.style.left)).toBeLessThan(parseFloat(node('root').element.style.left));
  expect(parseFloat(node('a').element.style.left) - parseFloat(node('root').element.style.left)).toBe(364);
  await picker.setValue('down');
  expect(node('b').element.style.top).toBe('295px');
  expect(parseFloat(node('c').element.style.left) - parseFloat(node('a').element.style.left)).toBeGreaterThan(202);
  await wrapper.findAll('button').find(button => button.text() === '恢复默认尺寸')!.trigger('click');
  expect(width.element.value).toBe('202');
  expect(height.element.value).toBe('64');
  expect(node('b').element.style.top).toBe('264px');
  expect(wrapper.emitted('updateNode')).toBeUndefined();
});
it('缩放时按画布距离拖动选中节点，保留同级尺寸和对侧锚点', async () => {
  await open();
  const node = (id: string) => wrapper.get<HTMLElement>(`[data-testid="mindmap-node-${id}"]`);
  const selected = node('a');
  const scene = wrapper.get('.mindmap-scene');
  const zoom = wrapper.get('[data-testid="p03-zoom-output"]');
  await zoom.setValue('200%');
  await zoom.trigger('keydown', { key: 'Enter' });
  const rightEdge = () => {
    const translateX = Number(scene.attributes('style')?.match(/translate\((-?[\d.]+)px/)?.[1]);
    return translateX + 2 * (parseFloat(selected.element.style.left) + parseFloat(selected.element.style.width));
  };
  const right = rightEdge();
  const handle = selected.get('.mindmap-node__resize--left').element;
  const initial = { pointerId: 1, isPrimary: true, clientX: 300, clientY: 200 };
  handle.dispatchEvent(new PointerEvent('pointerdown', { ...initial, bubbles: true }));
  handle.dispatchEvent(new PointerEvent('pointermove', { ...initial, clientX: 220, bubbles: true }));
  handle.dispatchEvent(new PointerEvent('pointerup', initial));
  await flushPromises();
  expect(selected.element.style.width).toBe('242px');
  expect(selected.element.style.height).toBe('64px');
  expect(rightEdge()).toBe(right);
  expect(node('c').element.style.width).toBe('202px');
  expect(wrapper.emitted('updateNode')).toBeUndefined();
  expect(wrapper.emitted('reparent')).toBeUndefined();

  await wrapper.get('[aria-label="一级分支高度"]').setValue('90');
  expect(selected.element.style.height).toBe('90px');
  await wrapper.findAll('button').find(button => button.text() === '恢复选中节点的层级尺寸')!.trigger('click');
  expect(selected.element.style.width).toBe('202px');
  expect(selected.element.style.height).toBe('90px');
  await wrapper.setProps({ locked: true });
  expect(selected.find('.mindmap-node__resize').exists()).toBe(false);
});
it('大纲定位与画布原地改名共用节点，搜索支持遍历备注中的匹配', async () => {
  await open();
  await wrapper.get('[aria-label="大纲"]').trigger('click');
  const outline = wrapper.get('[aria-label="脑图大纲"]');
  await outline.findAll('button').find(button => button.text() === '归档')!.trigger('click');
  expect(wrapper.emitted('update:selectedId')?.at(-1)).toEqual(['c']);
  await wrapper.get('[data-testid="mindmap-node-c"] button').trigger('dblclick');
  const name = wrapper.get('[aria-label="编辑画布节点名称"]');
  await name.setValue('资料归档');
  await name.trigger('keydown', { key: 'Enter' });
  expect(wrapper.emitted('updateNode')?.at(-1)).toEqual(['c', { label: '资料归档' }]);
  await wrapper.setProps({ nodes: nodes().map(node => ({ ...node, note: ['a', 'c'].includes(node.id) ? '要核实' : node.note })) });
  await wrapper.get('[aria-label="搜索分析节点"]').setValue('核实');
  expect(wrapper.emitted('update:selectedId')?.at(-1)).toEqual(['a']);
  await wrapper.get('[aria-label="下一个结果"]').trigger('click');
  expect(wrapper.emitted('update:selectedId')?.at(-1)).toEqual(['c']);
});
it('移动分支保持身份并重排原同级，Markdown 层级作为新增节点追加', () => {
  const tree = { root_id: 'root', nodes: nodes() };
  applyMindmapMove(tree, 'c', 'a', 'before');
  expect(tree.nodes.find(node => node.id === 'a')?.order).toBe(1);
  applyMindmapMove(tree, 'a', 'c', 'child');
  expect(tree.nodes.find(node => node.id === 'b')?.parent_id).toBe('a');
  applyMindmapMove(tree, 'c', 'b', 'child');
  expect(tree.nodes.find(node => node.id === 'c')?.parent_id).toBe('root');
  let id = 0;
  const source = '# 会议\n讨论内容\n- 核实\n  - 确认\n## 其他';
  const imported = markdownBranch(source, 'root', 1, 4, () => `md.${++id}`);
  expect(imported.map(node => [node.label, node.parent_id, node.order])).toEqual([
    ['会议', 'root', 1], ['核实', 'md.1', 0], ['确认', 'md.2', 0], ['其他', 'md.1', 1],
  ]);
  expect(imported[0]?.note).toBe('讨论内容');
  expect(() => markdownBranch(source, 'root', 0, 3, () => `md.${++id}`)).toThrow('300');
});
it('滚轮以鼠标为中心缩放，百分比和预设使用同一个视口',async()=>{
  await open();
  const canvas=wrapper.get<HTMLElement>('[data-testid="mindmap-canvas"]');
  vi.spyOn(canvas.element,'getBoundingClientRect').mockReturnValue({left:0,top:0} as DOMRect);
  canvas.element.dispatchEvent(new WheelEvent('wheel',{deltaY:-Math.log(2)/.0015,clientX:100,clientY:100,bubbles:true,cancelable:true}));await flushPromises();
  expect(wrapper.get('.mindmap-scene').attributes('style')).toContain('translate(-80px, -80px) scale(2)');
  const percent=wrapper.get('[data-testid="p03-zoom-output"]'); await percent.setValue('125%');await percent.trigger('keydown',{key:'Enter'});
  expect(wrapper.get('.mindmap-scene').attributes('style')).toContain('scale(1.25)');
  await wrapper.get('[data-testid="p03-zoom-menu-toggle"]').trigger('click');await wrapper.get('[data-testid="p03-zoom-preset-400"]').trigger('click');
  expect(wrapper.get('.mindmap-scene').attributes('style')).toContain('scale(4)');
});
