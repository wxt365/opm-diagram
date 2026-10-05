import { check } from './store.mjs';

const semanticNode = node => ({ kind: node.kind, label: node.label, owner_id: node.owner_id, entity_ref: node.entity_ref });
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** 用稳定来源编译增量；类型与关系已在分析阶段明确，不猜测树形连线。 */
export function compileMindmap(data, snapshot, contextId, excludedIds = []) {
  const document = data.document, nodes = new Map(document.nodes.map(node => [node.id, node]));
  const graph = snapshot.projections.find(item => item.context_id === contextId);
  check(graph, 'SCOPE_MISMATCH', '目标 OPD 不存在。');
  const all = new Map([...document.nodes, ...document.relations].map(item => [item.id, item]));
  const excluded = new Set(excludedIds);
  check(excluded.size === excludedIds.length && excludedIds.every(id => all.has(id)), 'INPUT_INVALID', '排除范围无效。');
  const previous = new Map();
  for (const conversion of data.conversions.filter(item => item.context_id === contextId)) for (const mapping of conversion.mappings) previous.set(mapping.source_id, mapping);
  const steps = [], bindings = [], refs = new Map(), active = new Set(); let objectOrdinal = 0, processOrdinal = 0;
  const objectCount = document.nodes.filter(node => node.kind === 'OBJECT' && !node.entity_ref && !excluded.has(node.id)).length;
  const stateCounts = new Map();
  for (const node of document.nodes) if (node.kind === 'STATE' && !node.entity_ref && !excluded.has(node.id)) stateCounts.set(node.owner_id, (stateCounts.get(node.owner_id) ?? 0) + 1);
  const rowHeight = Math.max(180, ...[...stateCounts.values()].map(count => 70 + count * 36 + 80));
  const existingBottom = Math.max(0, ...graph.constructs.filter(item => ['OBJECT_NODE', 'PROCESS_NODE'].includes(item.construct_role)).map(item => (item.layout?.y ?? 0) + (item.layout?.height ?? 72)));
  const startY = existingBottom ? existingBottom + 120 : 100;
  function bind(node) {
    if (refs.has(node.id)) return refs.get(node.id);
    check(!excluded.has(node.id) && !active.has(node.id), 'ANALYSIS_DEPENDENCY', `“${node.label}”的依赖被排除或存在循环。`);
    active.add(node.id);
    check(!['ATTRIBUTE', 'CONSTRAINT'].includes(node.kind), 'ANALYSIS_NEEDS_INPUT', `“${node.label}”属于${node.kind === 'ATTRIBUTE' ? '属性' : '约束 / 问题'}，首版尚不支持转换。请在脑图详情中勾选暂不纳入，原文会保留；无须新建 OPD 或会话。`);
    check(['OBJECT', 'PROCESS', 'STATE'].includes(node.kind), 'ANALYSIS_NEEDS_INPUT', `请明确“${node.label}”的类型，或明确暂不纳入本次转换。`);
    if (node.entity_ref) {
      const canonical = nodes.get(node.entity_ref); check(canonical && canonical.kind === node.kind, 'ANALYSIS_DEPENDENCY', '重复引用的实体类型不一致。');
      const ref = bind(canonical); refs.set(node.id, ref); bindings.push({ source_id: node.id, target_ref: ref }); active.delete(node.id); return ref;
    }
    const historical = previous.get(node.id), boundId = node.target_id ?? historical?.target_id;
    const old = historical?.target_id === boundId ? historical : undefined;
    const target = boundId ? graph.constructs.find(item => item.target_id === boundId) : null;
    if (boundId) check(target, 'SOURCE_BINDING_LOST', `“${node.label}”的模型绑定已删除或不在目标图，请重新绑定。`);
    let owner;
    if (node.kind === 'STATE') {
      const ownerNode = nodes.get(node.owner_id); check(ownerNode?.kind === 'OBJECT', 'ANALYSIS_NEEDS_INPUT', `请为状态“${node.label}”选择所属对象。`); owner = bind(ownerNode);
    }
    if (target) {
      check(node.kind === 'STATE' ? target.target_kind === 'STATE' : target.construct_role === `${node.kind}_NODE`, 'SOURCE_CONFLICT', `“${node.label}”的模型类型不一致。`);
      if (old) {
        const sourceBefore = JSON.parse(old.source_json);
        check(sourceBefore.kind === node.kind && sourceBefore.owner_id === node.owner_id, 'SOURCE_CONFLICT', `“${node.label}”改变了类型或归属，请通过正式模型编辑处理。`);
        if (sourceBefore.label !== node.label) {
          check(target.label === old.target_name || target.label === node.label, 'SOURCE_CONFLICT', `“${node.label}”在脑图和模型中均被改名，请先解决冲突。`);
          if (target.label !== node.label) steps.push({ local_id: `update.${node.id}`, command_type: node.kind === 'STATE' ? 'UPDATE_STATE' : 'UPDATE_PROPERTY', target: boundId, name: node.label });
        }
      } else check(target.label === node.label, 'SOURCE_CONFLICT', `“${node.label}”与所选绑定名称不同，请先核对。`);
      if (node.kind === 'STATE') check(target.owner_id === owner || graph.constructs.some(item => item.occurrence_id === owner && item.target_id === target.owner_id), 'SOURCE_CONFLICT', '状态所属对象与模型不一致。');
      refs.set(node.id, boundId);
    } else {
      const key = `create.${node.id}`;
      if (node.kind === 'STATE') steps.push({ local_id: key, command_type: 'CREATE_STATE', target: owner, name: node.label });
      else {
        // 对象和过程分行，给对象内状态留出空间；增量节点放在已有图元下方。
        const ordinal = node.kind === 'OBJECT' ? objectOrdinal++ : processOrdinal++;
        steps.push({ local_id: key, command_type: 'CREATE_ELEMENT', kind: node.kind, name: node.label,
          layout: { x: (node.kind === 'OBJECT' ? 100 : 225) + (ordinal % 3) * 250,
            y: startY + (Math.floor(ordinal / 3) + (node.kind === 'PROCESS' ? Math.ceil(objectCount / 3) : 0)) * rowHeight } });
      }
      refs.set(node.id, key);
    }
    bindings.push({ source_id: node.id, target_ref: refs.get(node.id) }); active.delete(node.id); return refs.get(node.id);
  }
  for (const node of document.nodes) if (node.kind !== 'TOPIC' && !excluded.has(node.id)) bind(node);
  for (const relation of document.relations) {
    if (excluded.has(relation.id)) continue;
    check(relation.capability_id, 'ANALYSIS_NEEDS_INPUT', `关系“${relation.label}”尚未明确，请补充关系类型。`);
    const endpoints = relation.endpoints.map(id => { check(nodes.has(id), 'ANALYSIS_DEPENDENCY', '关系端点不存在。'); return bind(nodes.get(id)); });
    const old = previous.get(relation.id);
    if (old) {
      check(graph.constructs.some(item => item.target_id === old.target_id && item.target_kind === 'FACT'), 'SOURCE_BINDING_LOST', `关系“${relation.label}”已被删除，请重新核对。`);
      check(equal({ capability_id: JSON.parse(old.source_json).capability_id, endpoints: JSON.parse(old.source_json).endpoints }, { capability_id: relation.capability_id, endpoints: relation.endpoints }), 'SOURCE_CONFLICT', `关系“${relation.label}”的定义已变化，请通过正式关系编辑处理。`);
      const fact = graph.constructs.find(item => item.target_id === old.target_id);
      check(fact.capability_id === relation.capability_id && fact.endpoints?.length === endpoints.length && fact.endpoints.every((endpoint, i) => endpoint.target_id === endpoints[i] || endpoint.state_qualification === endpoints[i]), 'SOURCE_CONFLICT', `关系“${relation.label}”在正式模型中已改变，请核对。`);
      bindings.push({ source_id: relation.id, target_ref: old.target_id });
    } else {
      const key = `create.${relation.id}`; steps.push({ local_id: key, command_type: 'CREATE_FACT', capability_id: relation.capability_id, endpoints });
      bindings.push({ source_id: relation.id, target_ref: key });
    }
  }
  check(steps.length <= 100, 'PLAN_TOO_LARGE', '本次转换超过 100 项修改，请缩小分析范围。');
  return { steps, analysisSource: { mindmap_id: document.id, revision: document.revision, digest: data.digest, bindings, excluded_ids: excludedIds },
    sourceChanged: document.nodes.some(node => previous.has(node.id) && !equal(semanticNode(JSON.parse(previous.get(node.id).source_json)), semanticNode(node))) };
}
