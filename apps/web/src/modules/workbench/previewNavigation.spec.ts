import { describe, expect, it } from "vitest";
import { previewNavigation } from "./previewNavigation";
import type { AssistantProposal } from "@/shared/api/assistantApi";

describe("暂存子图导航", () => {
  it("父子图合并去重，名称层级保留，正式数据不修改", () => {
    const contexts = [{ id: 'root', label: 'SD', kind: 'SYSTEM_DIAGRAM', depth: 0 }, { id: 'existing', label: '历史', kind: 'PROCESS_REFINEMENT', depth: 1, parentId: 'root' }];
    const proposal = { previewViews: [{ context_id: 'root', label: 'SD' }, { context_id: 'child', label: '查询规划', parent_context_id: 'root', refinee_element_id: 'process.parent' }] } as AssistantProposal;
    const result = previewNavigation(contexts, proposal);
    expect(result.map(item => item.id)).toEqual(['root', 'existing', 'child']);
    expect(result.find(item => item.id === 'child')).toMatchObject({ label: '查询规划', depth: 1, parentId: 'root', preview: true });
    expect(contexts).toHaveLength(2); expect(previewNavigation(contexts, null).every(item => !item.preview)).toBe(true);
    const committed = [...contexts, { id: 'child', label: '查询规划', kind: 'PROCESS_REFINEMENT', depth: 1, parentId: 'root' }];
    const formal = previewNavigation(committed, null);
    expect(formal.filter(item => item.id === 'child')).toHaveLength(1);
    expect(formal.find(item => item.id === 'child')).toMatchObject({ label: '查询规划', preview: false });
  });
});
