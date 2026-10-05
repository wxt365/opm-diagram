import { isDeepStrictEqual } from 'node:util';
import { check } from './store.mjs';

/** 修正暂存转换的来源，不修改脑图；Runtime 最终仍校验归属、端点与完整绑定。 */
export function reconcileMindmapRepair(task, steps) {
  const baseline = task.analysisRepairBaseline ?? { steps: task.plan.steps, source: task.analysisSource };
  const previous = new Map(baseline.steps.map(step => [step.local_id, step]));
  const semantic = step => { const { layout: _layout, ...value } = step; return value; };
  for (const step of steps) {
    const before = previous.get(step.local_id);
    check(before && isDeepStrictEqual(semantic(before), semantic(step)), 'ANALYSIS_REPAIR_SCOPE',
      '脑图转换自动修正只能移除或恢复原方案未提交项及调整布局；不能新增元素、改名、改变类型、归属或关系定义。');
  }
  const kept = new Set(steps.map(step => step.local_id));
  const removed = new Set(baseline.steps.filter(step => step.command_type.startsWith('CREATE') && !kept.has(step.local_id)).map(step => step.local_id));
  for (const step of steps) check([...(step.endpoints ?? []), ...(step.target ? [step.target] : [])].every(ref => !removed.has(ref)),
    'ANALYSIS_DEPENDENCY', '修正仍引用已移除的暂存项，请同时处理依赖关系。');
  const removedSourceIds = baseline.source.bindings.filter(binding => removed.has(binding.target_ref)).map(binding => binding.source_id);
  const source = { ...baseline.source,
    bindings: baseline.source.bindings.filter(binding => !removed.has(binding.target_ref)),
    excluded_ids: [...new Set([...baseline.source.excluded_ids, ...removedSourceIds])] };
  const labels = new Map([...(task.analysisDocument?.nodes ?? []), ...(task.analysisDocument?.relations ?? [])].map(item => [item.id, item.label]));
  return { source, removedSourceIds, removedLabels: removedSourceIds.map(id => labels.get(id) ?? id) };
}
