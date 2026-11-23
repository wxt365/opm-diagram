import { check } from './store.mjs';
import { safeMessage } from './messages.mjs';

export const analysisReadParameters = {
  compact: { type: 'boolean', description: '局部调整先设为 true，读取节点结构、关联和修订，省略长备注。' },
  note_node_id: { type: 'string', description: '在精简读取时仅返回指定节点的完整备注。' },
};
export const analysisEditParameters = {
  expected_revision: { type: 'number', required: true, description: '读取时返回的脑图修订。' },
  edits_json: { type: 'string', required: true, description: '包含 1 至 100 条局部编辑的 JSON 数组，字段见读取结果中的 local_edit_contract。' },
};
const operationFields = {
  add_node: ['parent_id', 'index', 'label', 'note', 'kind', 'owner_id', 'entity_ref'],
  update_node: ['label', 'note', 'kind', 'owner_id', 'entity_ref'],
  move_node: ['parent_id', 'index'],
  add_relation: ['label', 'endpoints', 'capability_id'],
  update_relation: ['label', 'endpoints', 'capability_id'],
  remove_relation: [],
};

export function analysisLocalEditContract(opm) {
  return {
    read: '局部编辑先用 compact=true；需要读取原备注时给 note_node_id。',
    operations: Object.fromEntries(Object.entries(operationFields).map(([op, fields]) => [op, {
      required: ['op', 'id', ...({ add_node: ['parent_id', 'label'], add_relation: ['label', 'endpoints'], move_node: ['parent_id', 'index'] }[op] ?? [])],
      optional: fields.filter(field => (opm || !['kind', 'owner_id', 'entity_ref', 'capability_id'].includes(field))
        && !({ add_node: ['parent_id', 'label'], add_relation: ['label', 'endpoints'], move_node: ['parent_id', 'index'] }[op] ?? []).includes(field)),
    }])),
    rules: '索引 index 从 0 开始，移动时按移走该节点后的位置计算。新节点使用唯一稳定 ID。修改仅传本轮要变更的字段，按数组顺序执行全部操作并一次保存。',
  };
}

export function analysisReadDocument(document, { compact, note_node_id: noteNodeId }) {
  if (!compact) return document;
  check(!noteNodeId || document.nodes.some(node => node.id === noteNodeId), 'INPUT_INVALID', '要读取备注的节点不存在。');
  return {
    ...document,
    nodes: document.nodes.map(({ note, ...node }) => node.id === noteNodeId ? { ...node, note } : { ...node, has_note: !!note }),
  };
}

function reorderSiblings(document, node, parentId, index) {
  const oldParent = node.parent_id;
  const siblings = parent => document.nodes.filter(item => item.parent_id === parent).sort((a, b) => a.order - b.order);
  const ordered = siblings(parentId);
  const target = ordered.filter(item => item !== node);
  check(index === undefined || Number.isInteger(index) && index >= 0 && index <= target.length,
    'INPUT_INVALID', '同级位置超出范围，请按当前分支顺序指定索引。');
  if (oldParent === parentId && ordered[index] === node) return;
  if (oldParent !== parentId && oldParent !== null) siblings(oldParent).filter(item => item !== node).forEach((item, order) => { item.order = order; });
  node.parent_id = parentId;
  target.splice(index ?? target.length, 0, node);
  target.forEach((item, order) => { item.order = order; });
}

export function applyAnalysisEdits(before, args, opm) {
  check(args.expected_revision === before.revision, 'ANALYSIS_CONFLICT', '脑图修订已变化，请重新读取后继续。', 409);
  check(typeof args.edits_json === 'string' && Buffer.byteLength(args.edits_json) <= 128000, 'INPUT_INVALID', '脑图编辑参数过大。');
  let edits;
  try { edits = JSON.parse(args.edits_json); } catch { check(false, 'INPUT_INVALID', '局部编辑必须为合法 JSON。'); }
  check(Array.isArray(edits) && edits.length >= 1 && edits.length <= 100, 'INPUT_INVALID', '局部编辑批次须含 1 至 100 条操作。');

  const document = structuredClone(before);
  const nodes = new Map(document.nodes.map(node => [node.id, node]));
  const relations = new Map((document.relations ?? []).map(relation => [relation.id, relation]));
  const semanticFields = new Set(['kind', 'owner_id', 'entity_ref', 'capability_id']);
  for (const edit of edits) {
    const fields = edit && Object.hasOwn(operationFields, edit.op) ? operationFields[edit.op] : null;
    check(fields && typeof edit.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(edit.id)
      && Object.keys(edit).every(key => key === 'id' || key === 'op' || fields.includes(key) && (opm || !semanticFields.has(key))),
    'INPUT_INVALID', '局部编辑包含无效操作、身份或字段。');
    const { op, id, ...update } = edit;
    const node = nodes.get(id);
    if (op === 'add_node') {
      check(!node && !relations.has(id) && nodes.has(update.parent_id) && typeof update.label === 'string',
        'INPUT_INVALID', '新增节点需要唯一 ID、现有父节点和名称。');
      const { parent_id: parentId, index, ...content } = update;
      const added = { id, parent_id: null, order: 0, collapsed: false, note: '',
        ...(opm ? { kind: 'UNCLASSIFIED', owner_id: null, entity_ref: null, target_id: null } : {}), ...content };
      reorderSiblings(document, added, parentId, index);
      document.nodes.push(added);
      nodes.set(id, added);
    } else if (op === 'update_node') {
      check(node && Object.keys(update).length, 'INPUT_INVALID', '修改节点需要现有节点和变更字段。');
      Object.assign(node, update);
    } else if (op === 'move_node') {
      check(node && id !== before.root_id && nodes.has(update.parent_id) && Number.isInteger(update.index),
        'INPUT_INVALID', '移动节点需要非根节点、现有父节点和同级位置。');
      let parent = nodes.get(update.parent_id);
      while (parent) {
        check(parent.id !== id, 'INPUT_INVALID', '节点不能移动到自身或下级节点。');
        parent = nodes.get(parent.parent_id);
      }
      reorderSiblings(document, node, update.parent_id, update.index);
    } else if (op === 'add_relation') {
      check(!node && !relations.has(id) && typeof update.label === 'string' && Array.isArray(update.endpoints),
        'INPUT_INVALID', '新增关联需要唯一 ID、名称和端点。');
      relations.set(id, { id, ...(opm ? { capability_id: null } : {}), ...update });
      document.relations = [...relations.values()];
    } else {
      const relation = relations.get(id);
      check(relation, 'INPUT_INVALID', '要修改的关联不存在。');
      if (op === 'remove_relation') {
        relations.delete(id);
        document.relations = [...relations.values()];
      } else {
        check(Object.keys(update).length, 'INPUT_INVALID', '请指定关联的变更字段。');
        Object.assign(relation, update);
      }
    }
  }
  return document;
}

export function analysisSaveMessage(task) {
  const saved = task.analysisSavedRevision === undefined ? '' : `脑图已保存（修订 ${task.analysisSavedRevision}）。`;
  if (task.analysisSaveError) return `${saved ? saved + '后续修改未确认保存' : '脑图修改未确认保存'}：${safeMessage(task.analysisSaveError)}`;
  return saved || '本轮未修改脑图。';
}
