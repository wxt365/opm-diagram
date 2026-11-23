import { describe, expect, it } from "vitest";
import { previewAssistant } from "./assistantPreview";
import type { AssistantProposal } from "@/shared/api/assistantApi";
import type { OpdNode } from "@/shared/types/modeling";
const owner: OpdNode = { id: "beans", occurrenceId: "beans.root", kind: "object", label: "咖啡豆", x: 120, y: 160, width: 160, height: 72, valueDomain: "-", visibility: "public", multiplicity: "1", architectureLayer: "产品", occurrenceRole: "owned" };
function proposal(command: AssistantProposal['command']): AssistantProposal { return { id: "p", summary: "测试", contextId: "root", command, baseToken: { draft_id: "d", edit_seq: 0, binding_digest: "a" }, status: "ready", reason: "", affectedContexts: [] }; }
describe("助手只读画布预览", () => {
  it("父子预览切换复用身份且不修改正式画布", () => {
    const p = proposal({ command_type: 'APPLY_MODEL_PLAN', payload: { context_id: 'root', steps: [{ local_id: 'local.child', command_type: 'REORGANIZE_SUBGRAPH', target: 'parent', name: '细节', members: ['beans.root'] }] } });
    p.previewViews = [
      { context_id: 'root', label: '主图', parent_context_id: null, refinee_element_id: null, data: { context_id: 'root', constructs: [], suppressed_states: [] } },
      { context_id: 'child', label: '细节', parent_context_id: 'root', refinee_element_id: 'parent', data: { context_id: 'child', suppressed_states: [], constructs: [
        { target_id: owner.id, target_kind: 'ELEMENT', occurrence_id: 'beans.child', construct_role: 'OBJECT_NODE', capability_id: 'CAP-OBJECT-001', label: owner.label, layout: { x: 0, y: 0, width: 160, height: 72, z_order: 0 } }
      ] } }
    ];
    expect(previewAssistant(p, [owner], [], 'root').nodes).toHaveLength(0);
    const child = previewAssistant(p, [owner], [], 'child');
    expect(child.nodes[0]!.id).toBe(owner.id); expect(child.nodes[0]!.occurrenceId).toBe('beans.child');
    expect(owner.occurrenceId).toBe('beans.root'); expect(p.previewData).toBeUndefined();
  });
  it("创建状态的预览包含 Runtime 容器扩容，不改源图", () => {
    const p = proposal({ command_type: "CREATE_STATE", payload: { context_id: "root", owner_ref: { target_kind: "ELEMENT", target_id: "beans" }, capability_ref: { capability_id: "CAP-STATE-001" }, name_or_value: "已烘焙", state_roles: [], occurrence: { ownership: "OWNED", construct_role: "STATE_NODE" }, layout: { x: 132, y: 230 } } });
    const result = previewAssistant(p, [owner], []);
    expect(result.nodes[0]?.height).toBe(106); expect(result.nodes[1]?.y).toBe(230); expect(owner.height).toBe(72); expect(previewAssistant(null, [owner], []).nodes).toHaveLength(1);
  });
  it("移动对象时预览状态随父移动，源坐标不变", () => {
    const state: OpdNode = { ...owner, id: 'raw', occurrenceId: 'raw.root', ownerId: 'beans', kind: 'state', label: '待烘焙', x: 132, y: 188, width: 88, height: 28 };
    const result = previewAssistant(proposal({ command_type: 'UPDATE_LAYOUT', payload: { occurrence_id: 'beans.root', layout: { x: 220, y: 260 } } }), [owner, state], []);
    expect(result.nodes[1]?.x).toBe(232); expect(result.nodes[1]?.y).toBe(288); expect(state.x).toBe(132);
  });
  it("整图方案使用 Runtime 投影包含对象和关系，源模型不改写", () => {
    const p = proposal({ command_type: 'APPLY_MODEL_PLAN', payload: { context_id: 'root', steps: [{ local_id: 'local.bean', command_type: 'CREATE_ELEMENT', kind: 'OBJECT', name: '咖啡豆', layout: { x: 20, y: 30 } }] } });
    const layout = { x: 20, y: 30, width: 160, height: 72, z_order: 1 };
    p.previewData = { context_id: 'root', suppressed_states: [], constructs: [
      { target_id: 'beans', target_kind: 'ELEMENT', occurrence_id: 'ob', construct_role: 'OBJECT_NODE', capability_id: 'CAP-OBJECT-001', label: '咖啡豆', layout },
      { target_id: 'roast', target_kind: 'ELEMENT', occurrence_id: 'op', construct_role: 'PROCESS_NODE', capability_id: 'CAP-PROCESS-001', label: '烘焙', layout: { ...layout, x: 300 } },
      { target_id: 'fact', target_kind: 'FACT', occurrence_id: 'of', construct_role: 'PROCEDURAL_LINK', capability_id: 'CAP-ISO-PROC-001', layout, endpoints: [{ role: 'SOURCE', target_kind: 'ELEMENT', target_id: 'beans', ordinal: 0 }, { role: 'TARGET', target_kind: 'ELEMENT', target_id: 'roast', ordinal: 1 }] },
    ] };
    const result = previewAssistant(p, [owner], []); expect(result.nodes).toHaveLength(2); expect(result.relations).toHaveLength(1);
    expect(result.relations[0]!.sourceOccurrenceId).toBe('ob'); expect(result.relations[0]!.targetOccurrenceId).toBe('op'); expect(owner.x).toBe(120);
  });
});
