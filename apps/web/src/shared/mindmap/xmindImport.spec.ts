import { expect, it } from 'vitest';
import { Blob as NodeBlob } from 'node:buffer';
import { parseXmindSheets, xmindBranch } from './xmindImport';
import { readXmindContent } from './xmindArchive';
import { exportXmind } from './xmindExport';

const root = { id: 'root', parent_id: null, order: 0, label: '原脑图', note: '', collapsed: false };
const destination = { root_id: 'root', nodes: [root] };

it('工作表分别预览，只将选中主题树与纯文本备注映射为新节点', () => {
  const sheets = parseXmindSheets('json', JSON.stringify([
    { title: '需求', rootTopic: { title: '需求分析' } },
    { title: '验收', rootTopic: {
      title: '验收安排', notes: { plain: { content: '需要保留的文字' }, realHTML: { content: '<b>富文本</b>' } },
      children: { attached: [{ title: '确认条件' }, { title: '现场复测' }], detached: [{ title: '独立主题' }] },
    } },
  ]));
  expect(sheets.map(item => item.title)).toEqual(['需求', '验收']);
  let index = 0;
  expect(xmindBranch(sheets[1]!, destination, root.id, () => `new.${++index}`)).toEqual([
    { ...root, id: 'new.1', parent_id: 'root', label: '验收安排', note: '需要保留的文字' },
    { ...root, id: 'new.2', parent_id: 'new.1', label: '确认条件' },
    { ...root, id: 'new.3', parent_id: 'new.1', label: '现场复测', order: 1 },
  ]);
  expect(destination.nodes).toEqual([root]);
});

it('带命名空间的旧版工作表保留主题顺序，忽略独立主题', () => {
  const [sheet] = parseXmindSheets('xml', `<xmap-content xmlns="urn:xmind:xmap:xmlns:content:2.0">
    <sheet><title>旧版工作表</title><topic><title>旧版主题</title><notes><plain>确认日期</plain></notes>
      <children><topics type="attached"><topic><title>第一个子主题</title></topic></topics>
      <topics type="detached"><topic><title>独立主题</title></topic></topics></children>
    </topic></sheet></xmap-content>`);
  expect(sheet?.title).toBe('旧版工作表');
  expect(sheet?.rows).toMatchObject([
    { label: '旧版主题', note: '确认日期', parent: null },
    { label: '第一个子主题', parent: 0 },
  ]);
});

it('超限、无效目标和损坏格式在应用前拒绝', async () => {
  const [sheet] = parseXmindSheets('json', JSON.stringify([{ rootTopic: { title: '新主题' } }]));
  expect(() => xmindBranch(sheet!, { ...destination, nodes: Array.from({ length: 300 }, () => root) }, root.id, () => 'new')).toThrow('300');
  expect(() => xmindBranch(sheet!, destination, 'missing', () => 'new')).toThrow('目标');
  expect(() => parseXmindSheets('xml', '<unrelated/>')).toThrow('XML');
  await expect(readXmindContent({ size: 3, arrayBuffer: async () => new ArrayBuffer(3) })).rejects.toThrow('压缩包');
});

it('XMind 文件包含折叠分支，往返保留主题顺序、层级和中文备注', async () => {
  const document = { root_id: root.id, nodes: [
    { ...root, collapsed: true },
    { ...root, id: 'b', parent_id: root.id, label: '第二个主题', order: 1 },
    { ...root, id: 'a', parent_id: root.id, label: '第一个主题', note: '纯文本 <预算>\n第二行' },
    { ...root, id: 'child', parent_id: 'a', label: '下一级' },
  ] };
  const previousBlob = globalThis.Blob;
  let blob;
  try {
    globalThis.Blob = NodeBlob as typeof Blob;
    blob = exportXmind(document, 'bilateral');
  } finally { globalThis.Blob = previousBlob; }
  const { format, text } = await readXmindContent(blob);
  expect(format).toBe('json');
  const [exportedSheet] = JSON.parse(text);
  expect(exportedSheet.rootTopic.structureClass).toBe('org.xmind.ui.map.clockwise');
  expect(exportedSheet.extensions[0].content.centralTopic).toBe('org.xmind.ui.map.clockwise');
  const [sheet] = parseXmindSheets(format, text);
  expect(sheet?.rows.map(row => [row.label, row.parent, row.note])).toEqual([
    ['原脑图', null, ''],
    ['第一个主题', 0, '纯文本 <预算>\n第二行'],
    ['下一级', 1, ''],
    ['第二个主题', 0, ''],
  ]);
  expect(document.nodes[0]?.collapsed).toBe(true);
});
