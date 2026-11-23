import { randomUuid } from '@/shared/platform/browserCrypto';
import type { MindmapLayout, MindmapTree, MindmapTreeNode } from './mindmapTree';
import { xmindArchive } from './xmindArchive';

interface XmindTopic {
  id: string;
  class: 'topic';
  title: string;
  structureClass?: string;
  notes?: { plain: { content: string } };
  children?: { attached: XmindTopic[] };
}

export function exportXmind(tree: MindmapTree, layout: MindmapLayout = 'right') {
  const root = tree.nodes.find(node => node.id === tree.root_id);
  if (!root) throw new Error('脑图缺少根主题，无法导出。');
  const groups = new Map<string, MindmapTreeNode[]>();
  for (const node of tree.nodes) {
    if (!node.parent_id) continue;
    const siblings = groups.get(node.parent_id) ?? [];
    siblings.push(node);
    groups.set(node.parent_id, siblings);
  }
  const visited = new Set<string>();
  function topic(node: MindmapTreeNode): XmindTopic {
    if (visited.has(node.id)) throw new Error('脑图包含重复主题，无法导出。');
    visited.add(node.id);
    const result: XmindTopic = { id: randomUuid(), class: 'topic', title: node.label };
    if (node.note) result.notes = { plain: { content: node.note } };
    const children = groups.get(node.id);
    if (children?.length) result.children = { attached: children.sort((a, b) => a.order - b.order).map(topic) };
    return result;
  }
  const rootTopic = topic(root);
  if (visited.size !== tree.nodes.length) throw new Error('脑图存在未连接到根主题的节点，无法导出。');
  const structureClass = {
    bilateral: 'org.xmind.ui.map.clockwise',
    right: 'org.xmind.ui.logic.right',
    down: 'org.xmind.ui.org-chart.down',
  }[layout];
  rootTopic.structureClass = structureClass;
  const id = randomUuid();
  const contents = [{
    id, class: 'sheet', title: root.label, rootTopic,
    extensions: [{ provider: 'org.xmind.ui.skeleton.structure.style', content: { centralTopic: structureClass } }],
    topicPositioning: 'fixed', topicOverlapping: 'overlap', coreVersion: '2.100.0',
  }];
  const metadata = { dataStructureVersion: '2', creator: { name: 'OPM Diagram' }, layoutEngineVersion: '3', activeSheetId: id };
  const manifest = { 'file-entries': { 'content.json': {}, 'metadata.json': {} } };
  return xmindArchive({
    'content.json': JSON.stringify(contents),
    'metadata.json': JSON.stringify(metadata),
    'manifest.json': JSON.stringify(manifest),
  });
}
