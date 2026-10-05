import { readFile } from 'node:fs/promises';
import { check } from './store.mjs';
import { digest, planDigest } from './review.mjs';

export const modelingGuide = await readFile(new URL('../skills/opm-modeling-guide/SKILL.md', import.meta.url), 'utf8');
export const qualityPolicy = JSON.parse(await readFile(new URL('../skills/opm-modeling-guide/references/quality-policy.json', import.meta.url), 'utf8'));
check(['max_nodes_per_view', 'min_node_gap', 'max_endpoint_span', 'max_report_items'].every(key => Number.isFinite(qualityPolicy[key]) && qualityPolicy[key] > 0)
  && Number.isInteger(qualityPolicy.max_nodes_per_view) && Number.isInteger(qualityPolicy.max_report_items), 'CONFIG_INVALID', '建模质量策略阈值无效。');
export const modelingGuidance = `当前 OPD 生成指导（${qualityPolicy.guide_version}）：\n${modelingGuide}\n质量策略（建议，不是标准阻断规则）：${JSON.stringify(qualityPolicy)}`;
const transformations = new Set(['001', '002', '003', '006', '007', '008', '009', '010'].map(id => `CAP-ISO-PROC-${id}`));
const normalizeName = name => (name ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ');
const box = node => node.layout && ['x', 'y', 'width', 'height'].every(key => Number.isFinite(node.layout[key])) && node.layout.width > 0 && node.layout.height > 0 ? node.layout : null;

/** 对当前图做非阻断质量检查，不把显示偏好或同名现象当成语义错误。 */
export function assessQuality(projection, proposal, policy = qualityPolicy) {
  const nodes = projection.constructs.filter(item => item.target_kind !== 'FACT');
  const facts = projection.constructs.filter(item => item.target_kind === 'FACT');
  const issues = [];
  const add = (rule_id, target_ids, message, suggestion) => issues.push({ rule_id, severity: 'WARNING', target_ids: [...new Set(target_ids)], message, suggestion });
  if (nodes.length > policy.max_nodes_per_view) add('QUALITY-DENSITY', [projection.context_id], `当前图有 ${nodes.length} 个节点，超过建议的 ${policy.max_nodes_per_view} 个。`, '可按业务过程拆分阅读范围；保留必要内容，不为满足数量删减模型。');
  const names = new Map();
  for (const node of nodes) {
    const name = normalizeName(node.label);
    if (!name || /^(?:未命名(?:对象|过程|属性)?|(?:对象|过程|属性|状态)[ _-]?\d+)$/.test(name)) add('QUALITY-NAME', [node.occurrence_id], '图元名称为空或仍是占位名称。', '使用明确的业务实体、活动或状态名称。');
    if (node.target_kind !== 'ELEMENT' || !name) continue;
    const key = `${node.construct_role}:${name}`, group = names.get(key) ?? new Map();
    group.set(node.target_id, node); names.set(key, group);
  }
  for (const group of names.values()) if (group.size > 1) {
    const sameName = [...group.values()];
    add('QUALITY-IDENTITY', sameName.map(node => node.occurrence_id), `「${sameName[0].label}」对应多个独立语义身份。`, '确认是否代表不同实例；若角色不同可补充命名。同名不自动合并，保留有意区分的身份。');
  }
  for (const process of nodes.filter(node => node.construct_role === 'PROCESS_NODE')) {
    const connected = facts.filter(fact => (fact.endpoints ?? []).some(endpoint => endpoint.target_id === process.target_id));
    if (!connected.some(fact => transformations.has(fact.capability_id))) add('QUALITY-PROCESS', [process.occurrence_id], `过程「${process.label ?? ''}」在当前图未显示常见变换关系。`, '检查生成、消耗或状态变化对象；抽象占位或行为在子图说明时可保留，不为消除提示编造关系。');
  }
  // 属性、状态在对象内部显示；不能把它们与所有者的正常包含当作节点重叠。
  const top = nodes.filter(node => node.target_kind === 'ELEMENT' && box(node));
  for (let left = 0; left < top.length; left++) for (let right = left + 1; right < top.length; right++) {
    const a = box(top[left]), b = box(top[right]);
    const dx = Math.max(0, a.x - b.x - b.width, b.x - a.x - a.width);
    const dy = Math.max(0, a.y - b.y - b.height, b.y - a.y - a.height);
    if (Math.hypot(dx, dy) >= policy.min_node_gap) continue;
    const overlapping = a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
    add('QUALITY-SPACING', [top[left].occurrence_id, top[right].occurrence_id], overlapping ? '两个对象或过程的布局边界存在重叠。' : `两个对象或过程的间距小于建议的 ${policy.min_node_gap} 像素。`, '适当移动节点，保持相关节点靠近并留出空白；用户指定的布局可以保留。');
  }
  const byTarget = new Map(nodes.map(node => [node.target_id, node]));
  for (const fact of facts) {
    const endpoints = (fact.endpoints ?? []).map(endpoint => byTarget.get(endpoint.state_qualification ?? endpoint.target_id) ?? byTarget.get(endpoint.target_id)).filter(node => node && box(node));
    const centers = endpoints.map(node => { const b = box(node); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; });
    if (centers.some((a, i) => centers.slice(i + 1).some(b => Math.hypot(a.x - b.x, a.y - b.y) > policy.max_endpoint_span))) {
      add('QUALITY-LINK-SPAN', [fact.occurrence_id], `关系端点跨度超过建议的 ${policy.max_endpoint_span} 像素。`, '可把相关对象与过程组成局部阅读组；这是端点距离提示，不是关系方向或执行顺序校验。');
    }
  }
  return { policy_version: policy.policy_version, guide_version: policy.guide_version, guide_digest: digest(modelingGuide), policy_digest: digest(policy),
    plan_digest: planDigest(proposal), checked_at: new Date().toISOString(), context_id: projection.context_id, coverage: policy.coverage,
    node_count: nodes.length, fact_count: facts.length, items: issues.slice(0, policy.max_report_items), omitted: Math.max(0, issues.length - policy.max_report_items) };
}
