import type { MindmapDocument, MindmapNode } from '@/shared/api/generated/draftWorkspaceContract';
export const mindmapKinds: Record<MindmapNode['kind'], string> = { TOPIC: '主题', OBJECT: '对象', PROCESS: '过程', STATE: '状态', ATTRIBUTE: '属性', CONSTRAINT: '约束 / 问题', UNCLASSIFIED: '未分类' };
export const newMindmapId = () => `node.${crypto.randomUUID()}`;
/** 转换前只提示可在分析中修正的问题，正式可执行性仍由 Runtime 校验。 */
export function mindmapConversionIssues(document: MindmapDocument, excludedIds: string[]) {
  const excluded = new Set(excludedIds), nodes = new Map(document.nodes.map(node => [node.id, node]));
  const issues: Array<{ id: string; label: string; message: string }> = [];
  for (const node of document.nodes) {
    if (node.kind === 'TOPIC' || excluded.has(node.id)) continue;
    let message = '';
    if (node.kind === 'ATTRIBUTE') message = '首版尚不支持属性转换；可保留在脑图并勾选暂不纳入。';
    else if (node.kind === 'CONSTRAINT') message = '约束 / 问题尚不能转换；请补充语义或勾选暂不纳入。';
    else if (node.kind === 'UNCLASSIFIED') message = '请明确为对象、过程或状态，或勾选暂不纳入。';
    else if (node.kind === 'STATE' && !node.entity_ref && nodes.get(node.owner_id ?? '')?.kind !== 'OBJECT') message = '请在节点详情选择所属对象。';
    if (!message && [node.entity_ref, node.kind === 'STATE' ? node.owner_id : null].some(id => id && excluded.has(id))) message = '依赖的实体或所属对象已排除；请恢复依赖或一并排除此项。';
    if (message) issues.push({ id: node.id, label: node.label, message });
  }
  for (const relation of document.relations) {
    if (excluded.has(relation.id)) continue;
    const message = !relation.capability_id ? '关系类型尚未明确；请补充或勾选暂不纳入。'
      : relation.endpoints.some(id => excluded.has(id)) ? '关系端点已排除；请恢复端点或一并排除此关系。' : '';
    if (message) issues.push({ id: relation.id, label: relation.label, message });
  }
  return issues;
}
export function descendants(document: MindmapDocument, id: string): Set<string> {
  const ids = new Set([id]);
  for (let changed = true; changed;) { changed = false; for (const node of document.nodes) if (node.parent_id && ids.has(node.parent_id) && !ids.has(node.id)) { ids.add(node.id); changed = true; } }
  return ids;
}
export function mindmapLayout(document: MindmapDocument) {
  const positions: Array<{ node: MindmapNode; x: number; y: number; parent: string | null }> = [];
  let row = 0;
  const visit = (id: string, depth: number): number => {
    const node = document.nodes.find(node => node.id === id)!;
    const children = node.collapsed ? [] : document.nodes.filter(child => child.parent_id === id).sort((a, b) => a.order - b.order);
    const ys = children.map(child => visit(child.id, depth + 1));
    const y = ys.length ? (ys[0]! + ys.at(-1)!) / 2 : 50 + row++ * 84;
    positions.push({ node, x: 50 + depth * 220, y, parent: node.parent_id }); return y;
  };
  visit(document.root_id, 0); return positions;
}
export function importMindmap(value: unknown, current: MindmapDocument): MindmapDocument {
  const pack = value as { format?: string; version?: number; document?: MindmapDocument };
  if (pack?.format !== 'opm-mindmap' || pack.version !== 1 || !pack.document || pack.document.format_version !== 1) throw new Error('不支持的脑图文件或格式版本。');
  const source = pack.document;
  if (!Array.isArray(source.nodes) || !source.nodes.length || source.nodes.length > 300 || !Array.isArray(source.relations) || source.relations.length > 100) throw new Error('脑图节点或关系数量无效。');
  const ids = new Set(source.nodes.map(node => node.id));
  if (ids.size !== source.nodes.length || !ids.has(source.root_id)) throw new Error('脑图身份或根节点无效。');
  for (const node of source.nodes) {
    if (typeof node.id !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(node.id) || typeof node.label !== 'string' || !node.label.trim() || node.label.length > 256 || !Object.hasOwn(mindmapKinds, node.kind)
      || typeof node.note !== 'string' || node.note.length > 4000 || typeof node.collapsed !== 'boolean'
      || !Number.isInteger(node.order) || node.order < 0 || node.order > 300
      || (node.id === source.root_id ? node.parent_id !== null || node.kind !== 'TOPIC' : !ids.has(node.parent_id!))) throw new Error('脑图节点字段无效。');
    const visited = new Set<string>(); let cursor: MindmapNode | undefined = node;
    while (cursor) { if (visited.has(cursor.id)) throw new Error('脑图包含循环。'); visited.add(cursor.id); cursor = source.nodes.find(item => item.id === cursor!.parent_id); }
    for (const reference of [node.owner_id, node.entity_ref]) if (reference !== null && (!ids.has(reference) || reference === node.id)) throw new Error('脑图引用不存在。');
  }
  for (const node of source.nodes) {
    if (node.kind === 'STATE' && node.owner_id && source.nodes.find(item => item.id === node.owner_id)?.kind !== 'OBJECT') throw new Error('状态所属对象无效。');
    const seen = new Set<string>(); let cursor: MindmapNode | undefined = node;
    while (cursor) { if (seen.has(cursor.id)) throw new Error('实体引用包含循环。'); seen.add(cursor.id); if (cursor.kind !== node.kind) throw new Error('实体引用的类型不一致。'); cursor = source.nodes.find(item => item.id === cursor!.entity_ref); }
  }
  const remap = new Map(source.nodes.map(node => [node.id, newMindmapId()])); const relationIds = new Set<string>();
  for (const relation of source.relations) {
    if (typeof relation.id !== 'string' || ids.has(relation.id) || relationIds.has(relation.id) || typeof relation.label !== 'string' || !relation.label.trim()
      || relation.label.length > 256 || !Array.isArray(relation.endpoints) || relation.endpoints.length < 2 || relation.endpoints.length > 3
      || !relation.endpoints.every(id => ids.has(id)) || (relation.capability_id !== null && typeof relation.capability_id !== 'string')) throw new Error('关系说明字段无效。');
    relationIds.add(relation.id);
  }
  return { ...current, root_id: remap.get(source.root_id)!, nodes: source.nodes.map(node => ({ id: remap.get(node.id)!, parent_id: node.parent_id ? remap.get(node.parent_id)! : null,
    order: node.order, label: node.label, note: node.note, kind: node.kind, collapsed: node.collapsed,
    owner_id: node.owner_id ? remap.get(node.owner_id)! : null, entity_ref: node.entity_ref ? remap.get(node.entity_ref)! : null, target_id: null })),
    relations: source.relations.map(relation => ({ id: `relation.${crypto.randomUUID()}`, label: relation.label, capability_id: relation.capability_id, endpoints: relation.endpoints.map(id => remap.get(id)!) })) };
}
