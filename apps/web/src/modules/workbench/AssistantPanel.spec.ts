import { mount, flushPromises } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AssistantPanel from "./AssistantPanel.vue";
import { assistantRequest, watchAssistant, type AssistantConversation, type AssistantProposal } from "@/shared/api/assistantApi";
vi.mock("@/shared/api/assistantApi", () => ({ assistantRequest: vi.fn(), watchAssistant: vi.fn() }));
const scope = { projectId: "project.test", modelId: "model.test", contextId: "context.root" };
const token = { draft_id: "draft.test", edit_seq: 0, binding_digest: "a".repeat(64) };
const conversation: AssistantConversation = { ...scope, id: "session.test", title: "咖啡建模", updatedAt: "1", messages: [], proposals: [], run: null };
function setup() { return mount(AssistantPanel, { props: { scope, contextName: "SD", token, readonly: false, selectedIds: [] } }); }
describe("智能助手范围与提交交互", () => {
  beforeEach(() => {
    vi.clearAllMocks(); vi.mocked(assistantRequest).mockImplementation(async op => op === "list" ? [structuredClone(conversation)] : structuredClone(conversation));
    vi.mocked(watchAssistant).mockImplementation(() => new Promise(() => {}));
  });
  it('最新脑图阻断报告展开具体问题，修正入口只填入请求且不覆盖草稿', async () => {
    const analysisScope = { ...scope, kind: 'ANALYSIS' as const, mindmapId: 'mindmap.test' };
    const proposal: AssistantProposal = { id: 'blocked', summary: '脑图转换', status: 'blocked', reason: '语义检查发现问题', contextId: scope.contextId, baseToken: token, affectedContexts: [],
      command: { command_type: 'APPLY_MODEL_PLAN', payload: { context_id: scope.contextId, steps: [] } },
      analysisSource: { mindmap_id: 'mindmap.test', revision: 2, digest: 'b'.repeat(64), bindings: [], excluded_ids: [] },
      previewData: { context_id: scope.contextId, constructs: [], suppressed_states: [] },
      review: { skill_version: '1', standard_version: 'ISO 19450:2024', coverage: 'PARTIAL_SEMANTIC_REVIEW', source_digest: 'a', plan_digest: 'b', snapshot_digest: 'c', checked_at: 'today', checks: [], assumptions: [],
        issues: [{ rule_id: 'OPM-EFFECT', basis: 'STANDARD', severity: 'ERROR', context_id: scope.contextId, target_ids: [scope.contextId], message: '同一物料被消耗并改变状态', suggestion: '核对对象身份后保留一种表达', clauses: ['9.3.3'], pdf_pages: [35] }] } };
    vi.mocked(assistantRequest).mockResolvedValueOnce([{ ...conversation, ...analysisScope, proposals: [{ ...proposal, id: 'old' }, proposal] }]);
    const w = mount(AssistantPanel, { props: { scope: analysisScope, contextName: 'SD', token, readonly: false, selectedIds: [], analysisRevision: 2 } }); await flushPromises();
    const reports = w.findAll('[data-testid="assistant-standard-review"]');
    expect(reports[0]!.attributes('open')).toBeUndefined(); expect(reports[1]!.attributes('open')).toBeDefined();
    expect(reports[1]!.get('summary').text()).toContain('1 个阻断问题');
    expect(w.emitted('preview')!.at(-1)![0]).toEqual(proposal);
    expect(w.findAll('[data-testid="assistant-apply"]').at(-1)!.attributes('disabled')).toBeDefined();
    await w.get('[data-testid="assistant-analysis-retry"]').trigger('click');
    expect(w.emitted('requestConversion')).toEqual([[]]);
    const button = w.get('[data-testid="assistant-analysis-repair"]'); await button.trigger('click');
    expect((w.get('textarea').element as HTMLTextAreaElement).value).toContain('核对');
    expect(assistantRequest).toHaveBeenCalledTimes(1);
    await w.get('textarea').setValue('自己的业务选择'); expect(button.attributes('disabled')).toBeDefined();
    await button.trigger('click'); expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('自己的业务选择');
    await w.get('textarea').setValue(''); await w.setProps({ readonly: true }); expect(button.attributes('disabled')).toBeDefined();
    await w.setProps({ readonly: false, analysisRevision: 3 }); expect(w.find('[data-testid="assistant-analysis-repair"]').exists()).toBe(false);
    w.unmount();
  });
  it('分析助手可直接请求现有脑图转换，不创建 OPD 会话；业务错误不误显示重连', async () => {
    const w = setup(); await w.setProps({ scope: { ...scope, kind: 'ANALYSIS', mindmapId: 'mindmap.test' } }); await flushPromises();
    const button = w.get('[data-testid="assistant-analysis-convert"]'); await button.trigger('click');
    expect(w.emitted('requestConversion')).toEqual([[]]); expect(w.text()).toContain('无须新建图或会话');
    vi.mocked(assistantRequest).mockRejectedValueOnce(new Error('属性尚不支持转换，请明确排除'));
    await (w.vm as unknown as { convert: (ids: string[]) => Promise<void> }).convert(['dose']); await flushPromises();
    // convert 会先重读；读取失败仍属于连接错误。
    expect(w.find('[data-testid="assistant-reconnect"]').exists()).toBe(true);
    vi.mocked(assistantRequest).mockResolvedValueOnce([conversation]).mockRejectedValueOnce(new Error('属性尚不支持转换，请明确排除'));
    await (w.vm as unknown as { convert: (ids: string[]) => Promise<void> }).convert(['dose']); await flushPromises();
    expect(w.get('[role="alert"]').text()).toContain('属性尚不支持');
    expect(w.find('[data-testid="assistant-reconnect"]').exists()).toBe(false);
    const blocked: AssistantConversation = { ...conversation, proposals: [{ id: 'blocked', status: 'blocked', summary: '转换被阻断', reason: '请修改分析', contextId: scope.contextId, baseToken: token, affectedContexts: [], command: { command_type: 'CREATE_ELEMENT', payload: { kind: 'OBJECT', name: '咖啡豆' } } }] };
    vi.mocked(assistantRequest).mockResolvedValueOnce([blocked]).mockResolvedValueOnce(blocked);
    await (w.vm as unknown as { convert: (ids: string[]) => Promise<void> }).convert(['dose']); await flushPromises();
    expect(button.attributes('disabled')).toBeUndefined();
    await w.setProps({ readonly: true }); expect(button.attributes('disabled')).toBeDefined(); w.unmount();
  });
  it("中文输入法确认回车不发送，普通回车发送且保留多轮身份", async () => {
    const w = setup(); await flushPromises(); await w.get('textarea').setValue("添加咖啡豆");
    await w.get('textarea').trigger('keydown', { key: 'Enter', isComposing: true });
    expect(assistantRequest).toHaveBeenCalledTimes(1);
    await w.get('textarea').trigger('keydown', { key: 'Enter' }); await flushPromises();
    expect(assistantRequest).toHaveBeenLastCalledWith('prompt', scope, { conversationId: conversation.id, text: '添加咖啡豆', selectedIds: [], draftToken: token }); w.unmount();
  });
  it("助手 Markdown 表格按行列显示，用户输入保留原文以便编辑", async () => {
    const text = '| 方案 | 做法 | 适用 |\n|---|---|---|\n| A（推荐） | 删除两个悬空对象 | 同一对象的状态 |\n| B | **保留对象** | 不同库存 |';
    vi.mocked(assistantRequest).mockResolvedValueOnce([{ ...conversation, messages: [
      { id: 'u1', role: 'user', text, contextId: scope.contextId },
      { id: 'a1', role: 'assistant', text, contextId: scope.contextId },
    ] }]);
    const w = setup(); await flushPromises();
    expect(w.findAll('.assistant-message--assistant table')).toHaveLength(1);
    expect(w.findAll('thead th').map(cell => cell.text())).toEqual(['方案', '做法', '适用']);
    expect(w.findAll('tbody tr')).toHaveLength(2); expect(w.get('tbody strong').text()).toBe('保留对象');
    expect(w.get('.assistant-message--user p').text()).toBe(text);
    await w.get('[data-testid="assistant-edit-message"]').trigger('click');
    expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe(text); w.unmount();
  });
  it("已应用方案与对话分开，历史报告默认折叠，不把最新追问回复压在旧卡片上方", async () => {
    const history: AssistantConversation = { ...conversation,
      messages: [{ id: 'u1', role: 'user', text: '生咖啡豆还有用吗？', contextId: scope.contextId },
        { id: 'a1', role: 'assistant', text: '已读取模型，这个对象目前未连接任何关系。', contextId: scope.contextId }],
      proposals: [{ id: 'old', summary: '已创建咖啡豆', status: 'applied', reason: '', contextId: scope.contextId,
        baseToken: token, affectedContexts: [], command: { command_type: 'CREATE_ELEMENT', payload: { kind: 'OBJECT', name: '咖啡豆' } } }] };
    vi.mocked(assistantRequest).mockResolvedValueOnce([history]);
    const w = setup(); await flushPromises();
    const log = w.get('[role="log"]');
    expect(log.text()).toContain('这个对象目前未连接任何关系');
    expect(log.find('[data-testid="assistant-proposal"]').exists()).toBe(false);
    expect(w.get('[data-testid="assistant-proposals"]').attributes('open')).toBeUndefined();
    expect(w.get('[data-testid="assistant-proposal"]').text()).toContain('已应用'); w.unmount();
  });
  it("主动发送追问回到最新消息，之后手动上翻历史不被事件抢走；失败保留输入与阅读位置", async () => {
    let receive: (v: AssistantConversation) => void = () => {};
    vi.mocked(watchAssistant).mockImplementation((_s, _id, _signal, next) => { receive = next; return new Promise(() => {}); });
    const w = setup(); await flushPromises();
    const area = w.get('[role="log"]').element as HTMLElement;
    Object.defineProperties(area, { scrollHeight: { configurable: true, value: 1000 }, clientHeight: { configurable: true, value: 200 } });
    area.scrollTop = 0;
    const pending: AssistantConversation = { ...conversation, messages: [{ id: 'u1', role: 'user', text: '继续解释', contextId: scope.contextId }], run: { id: 'r1', status: 'running', message: '正在读取模型' } };
    vi.mocked(assistantRequest).mockResolvedValueOnce(pending);
    await w.get('textarea').setValue('继续解释'); await w.get('form').trigger('submit'); await flushPromises();
    expect(area.scrollTop).toBe(1000);
    area.scrollTop = 0;
    receive({ ...pending, run: { id: 'r1', status: 'running', message: '正在查询能力' } }); await flushPromises();
    expect(area.scrollTop).toBe(0);
    receive({ ...pending, run: { id: 'r1', status: 'completed', message: '' }, messages: [...pending.messages, { id: 'a1', role: 'assistant', text: '这是只读解释', contextId: scope.contextId }] }); await flushPromises();
    expect(area.scrollTop).toBe(0);
    vi.mocked(assistantRequest).mockRejectedValueOnce(new Error('暂时无法发送'));
    await w.get('textarea').setValue('再次追问'); await w.get('form').trigger('submit'); await flushPromises();
    expect(area.scrollTop).toBe(0); expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('再次追问'); w.unmount();
  });
  it("只读不能发送；旧版本提案不能预览和应用", async () => {
    vi.mocked(assistantRequest).mockResolvedValue([{ ...conversation, proposals: [{ id: 'p', summary: '对象', command: { command_type: 'CREATE_ELEMENT', payload: { kind: 'OBJECT', name: '豆子', layout: { x: 0, y: 0 } } }, contextId: scope.contextId, baseToken: token, affectedContexts: [], status: 'ready', reason: '' }] }]);
    const w = setup(); await flushPromises(); await w.setProps({ token: { ...token, edit_seq: 1 } });
    expect(w.get('[data-testid="assistant-apply"]').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="assistant-preview"]').attributes('disabled')).toBeDefined();
    await w.setProps({ readonly: true }); expect(w.get('textarea').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="assistant-send"]').attributes('disabled')).toBeDefined();
    expect(w.find('select').exists()).toBe(false); expect(w.find('[data-testid="assistant-new"]').exists()).toBe(false); w.unmount();
  });
  it("切图中断接收，旧图晚到响应不能覆盖新图会话", async () => {
    let oldReceive: (v: AssistantConversation) => void = () => {};
    vi.mocked(watchAssistant).mockImplementation((_s, _id, _signal, receive) => { oldReceive = receive; return new Promise(() => {}); });
    const w = setup(); await flushPromises(); const previous = oldReceive;
    await w.setProps({ scope: { ...scope, contextId: 'context.child' } }); await flushPromises();
    previous({ ...conversation, title: '旧图晚到', messages: [{ id: 'm', role: 'assistant', text: '旧图内容', contextId: scope.contextId }] }); await flushPromises();
    expect(w.text()).not.toContain('旧图内容'); w.unmount();
  });
  it("固定会话自动恢复；加载失败仅显示重连，重连后继续使用同一身份", async () => {
    vi.mocked(assistantRequest).mockRejectedValueOnce(new Error('服务暂不可用'));
    const w = setup(); await flushPromises(); expect(w.get('textarea').attributes('disabled')).toBeDefined();
    expect(w.get('[data-testid="assistant-reconnect"]').text()).toBe('重新连接');
    await w.get('[data-testid="assistant-reconnect"]').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="assistant-reconnect"]').exists()).toBe(false);
    expect(w.find('select').exists()).toBe(false); expect(w.text()).not.toContain('新对话'); expect(w.text()).not.toContain('刷新');
    await w.get('textarea').setValue('继续补充设备'); await w.get('form').trigger('submit'); await flushPromises();
    expect(assistantRequest).toHaveBeenLastCalledWith('prompt', scope, { conversationId: conversation.id, text: '继续补充设备', selectedIds: [], draftToken: token });
    expect(vi.mocked(assistantRequest).mock.calls.some(([op]) => op === 'create')).toBe(false); w.unmount();
  });
  it("事件连接正常关闭也显示重新连接，保留当前会话", async () => {
    vi.mocked(watchAssistant).mockResolvedValueOnce(); const w = setup(); await flushPromises();
    expect(w.get('[data-testid="assistant-reconnect"]').exists()).toBe(true);
    await w.get('[data-testid="assistant-reconnect"]').trigger('click'); await flushPromises();
    expect(w.find('[data-testid="assistant-reconnect"]').exists()).toBe(false); w.unmount();
  });
  it("图标身份与正文分开，编辑取消恢复原输入且不改写历史", async () => {
    const history = { ...conversation, messages: [{ id: 'u1', role: 'user' as const, text: '手工开发', contextId: scope.contextId }, { id: 'a1', role: 'assistant' as const, text: '请说明开发目标', contextId: scope.contextId }] };
    vi.mocked(assistantRequest).mockResolvedValue([history]);
    const w = setup(); await flushPromises(); await w.get('textarea').setValue('未发送的其他需求');
    expect(w.get('.assistant-message--user .assistant-avatar').attributes('aria-label')).toBe('用户');
    expect(w.get('.assistant-message--assistant .assistant-avatar').attributes('aria-label')).toBe('智能助手');
    expect(w.get('.assistant-message--user p').text()).toBe('手工开发'); expect(w.find('.assistant-message strong').exists()).toBe(false);
    await w.get('[data-testid="assistant-edit-message"]').trigger('click');
    expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('手工开发');
    expect(w.get('[data-testid="assistant-send"]').text()).toBe('发送更正');
    await w.get('textarea').setValue('手工咖啡'); await w.get('[data-testid="assistant-edit-cancel"]').trigger('click');
    expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('未发送的其他需求');
    expect(w.find('[data-testid="assistant-editing"]').exists()).toBe(false); expect(assistantRequest).toHaveBeenCalledTimes(1);
    expect(history.messages[0]!.text).toBe('手工开发'); w.unmount();
  });
  it("发送更正在原会话追加，失败保留输入可重试，成功恢复未发送草稿", async () => {
    const history = { ...conversation, messages: [{ id: 'u1', role: 'user' as const, text: '手工开发', contextId: scope.contextId }] };
    vi.mocked(assistantRequest).mockResolvedValueOnce([history]).mockRejectedValueOnce(new Error('暂时无法发送')).mockResolvedValueOnce(history);
    const w = setup(); await flushPromises(); await w.get('textarea').setValue('未发送草稿');
    await w.get('[data-testid="assistant-edit-message"]').trigger('click'); await w.get('textarea').setValue('手工咖啡');
    await w.get('form').trigger('submit'); await flushPromises();
    expect(w.get('[data-testid="assistant-editing"]').exists()).toBe(true);
    expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('手工咖啡');
    await w.get('form').trigger('submit'); await flushPromises();
    expect(assistantRequest).toHaveBeenLastCalledWith('prompt', scope, { conversationId: conversation.id, text: '更正我之前的问题「手工开发」；请以本次更正为准，结合当前模型继续：\n手工咖啡', selectedIds: [], draftToken: token });
    expect(w.find('[data-testid="assistant-editing"]').exists()).toBe(false);
    expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('未发送草稿');
    expect(w.get('.assistant-message--user p').text()).toBe('手工开发'); w.unmount();
  });
  it("只读和生成期间禁止编辑，切图清理编辑状态", async () => {
    let receive: (v: AssistantConversation) => void = () => {};
    const history = { ...conversation, messages: [{ id: 'u1', role: 'user' as const, text: '旧图问题', contextId: scope.contextId }] };
    vi.mocked(assistantRequest).mockResolvedValue([history]);
    vi.mocked(watchAssistant).mockImplementation((_s, _id, _signal, next) => { receive = next; return new Promise(() => {}); });
    const w = setup(); await flushPromises(); await w.setProps({ readonly: true });
    expect(w.get('[data-testid="assistant-edit-message"]').attributes('disabled')).toBeDefined();
    await w.setProps({ readonly: false }); receive({ ...history, run: { id: 'r1', status: 'running', message: '生成中' } }); await flushPromises();
    expect(w.get('[data-testid="assistant-edit-message"]').attributes('disabled')).toBeDefined();
    receive(history); await flushPromises(); await w.get('[data-testid="assistant-edit-message"]').trigger('click');
    await w.setProps({ scope: { ...scope, contextId: 'context.child' } }); await flushPromises();
    expect(w.find('[data-testid="assistant-editing"]').exists()).toBe(false); expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe(''); w.unmount();
  });
  it("切图后旧更正发送晚到，不清空新图输入", async () => {
    const history = { ...conversation, messages: [{ id: 'u1', role: 'user' as const, text: '旧图问题', contextId: scope.contextId }] };
    let finish: (v: AssistantConversation) => void = () => {};
    vi.mocked(assistantRequest).mockImplementation(async op => op === 'prompt' ? new Promise<AssistantConversation>(resolve => { finish = resolve; }) : [history]);
    const w = setup(); await flushPromises(); await w.get('[data-testid="assistant-edit-message"]').trigger('click');
    await w.get('textarea').setValue('旧图更正'); await w.get('form').trigger('submit');
    expect(w.get('[data-testid="assistant-edit-message"]').attributes('disabled')).toBeDefined();
    await w.setProps({ scope: { ...scope, contextId: 'context.child' } }); await flushPromises(); await w.get('textarea').setValue('新图输入');
    finish(history); await flushPromises(); expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('新图输入');
    expect(w.find('[data-testid="assistant-editing"]').exists()).toBe(false); w.unmount();
  });
  it("更正前缀计入发送字数，超限不会发送", async () => {
    vi.mocked(assistantRequest).mockResolvedValue([{ ...conversation, messages: [{ id: 'u1', role: 'user', text: '原问题', contextId: scope.contextId }] }]);
    const w = setup(); await flushPromises(); await w.get('[data-testid="assistant-edit-message"]').trigger('click');
    const limit = Number(w.get('textarea').attributes('maxlength')); expect(limit).toBeLessThan(12000);
    await w.get('textarea').setValue('文'.repeat(limit + 1)); await w.get('form').trigger('submit'); await flushPromises();
    expect(w.get('[data-testid="assistant-send"]').attributes('disabled')).toBeDefined(); expect(assistantRequest).toHaveBeenCalledTimes(1); w.unmount();
  });
  it("暂存方案自动实时预览，生成中不可确认，完成后只确认一次", async () => {
    let receive: (v: AssistantConversation) => void = () => {};
    vi.mocked(watchAssistant).mockImplementation((_s, _id, _signal, next) => { receive = next; return new Promise(() => {}); });
    const w = setup(); await flushPromises();
    const plan = { id: 'plan.1', summary: '咖啡流程', contextId: scope.contextId, baseToken: token, affectedContexts: [], reason: '', status: 'staging' as const,
      command: { command_type: 'APPLY_MODEL_PLAN' as const, payload: { context_id: scope.contextId, steps: [{ local_id: 'local.beans', command_type: 'CREATE_ELEMENT' as const, kind: 'OBJECT' as const, name: '咖啡豆', layout: { x: 10, y: 10 } }] } },
      previewData: { context_id: scope.contextId, constructs: [], suppressed_states: [] } };
    receive({ ...conversation, proposals: [plan], run: { id: 'r1', status: 'running', message: '生成中' } }); await flushPromises();
    expect(w.get('[data-testid="assistant-proposals"]').attributes('open')).toBeDefined();
    expect(w.get('[role="log"]').find('[data-testid="assistant-proposal"]').exists()).toBe(false);
    expect(w.emitted('preview')!.at(-1)![0]).toEqual(plan); expect(w.get('[data-testid="assistant-apply"]').attributes('disabled')).toBeDefined();
    const emissions = w.emitted('preview')!.length;
    receive({ ...conversation, proposals: [plan], run: { id: 'r1', status: 'running', message: '生成中' } }); await flushPromises();
    expect(w.emitted('preview')!.length).toBe(emissions);
    expect(w.get('[data-testid="assistant-cancel"]').text()).toBe('停止并取消');
    const ready = { ...plan, status: 'ready' as const, validation: { validation_scope: 'MODEL' as const, items: [], validation_summary: { blocking: 0, warning: 0 as const, suggestion: 0 as const, coverage_state: 'INCOMPLETE' as const } }, review: { skill_version: '1.0.0', standard_version: 'ISO 19450:2024', coverage: 'PARTIAL_SEMANTIC_REVIEW', source_digest: 'a'.repeat(64), plan_digest: 'b'.repeat(64), snapshot_digest: 'c'.repeat(64), checked_at: '2026-10-05', checks: [], issues: [], assumptions: ['咖啡粉作为独立对象'] } };
    receive({ ...conversation, proposals: [ready] }); await flushPromises(); expect(w.get('[data-testid="assistant-apply"]').text()).toBe('确认整图修改');
    expect(w.get('[data-testid="assistant-validation"]').text()).toContain('当前规则通过');
    expect(w.get('[data-testid="assistant-standard-review"]').text()).toContain('部分条款审查');
    expect(w.get('[data-testid="assistant-standard-review"]').text()).toContain('咖啡粉作为独立对象');
    expect(w.get('[data-testid="assistant-apply"]').attributes('disabled')).toBeUndefined();
    const advisory = { ...ready, quality: { policy_version: '1.0.0', guide_version: '1.0.0', guide_digest: 'd'.repeat(64), policy_digest: 'e'.repeat(64), plan_digest: 'b'.repeat(64), checked_at: '2026-10-05', context_id: scope.contextId, coverage: 'CURRENT_OPD_HEURISTICS', node_count: 13, fact_count: 0, omitted: 1,
      items: [{ rule_id: 'QUALITY-DENSITY', severity: 'WARNING' as const, target_ids: [scope.contextId], message: '超过建议数量', suggestion: '可按业务过程拆分' }] } };
    receive({ ...conversation, proposals: [advisory] }); await flushPromises();
    expect(w.get('[data-testid="assistant-quality"]').text()).toContain('2 条建议');
    expect(w.get('[data-testid="assistant-quality"]').text()).toContain('建议不影响确认');
    expect(w.get('[data-testid="assistant-quality"]').text()).toContain('超过建议数量（SD）');
    expect(w.get('[data-testid="assistant-apply"]').attributes('disabled')).toBeUndefined();
    receive({ ...conversation, proposals: [{ ...advisory, review: { ...advisory.review, issues: [{ rule_id: 'OPM-THING', basis: 'STANDARD', severity: 'ERROR', context_id: scope.contextId, target_ids: [scope.contextId], message: '类型错误', suggestion: '修正类型', clauses: ['6.2.3'], pdf_pages: [21] }] } }] }); await flushPromises();
    expect(w.get('[data-testid="assistant-apply"]').attributes('disabled')).toBeDefined();
    receive({ ...conversation, proposals: [advisory] }); await flushPromises();
    vi.mocked(assistantRequest).mockResolvedValueOnce({ ...conversation, proposals: [{ ...advisory, status: 'applied' }] });
    await w.get('[data-testid="assistant-apply"]').trigger('click'); await flushPromises();
    expect(assistantRequest).toHaveBeenLastCalledWith('apply', scope, { conversationId: conversation.id, draftToken: token, proposalId: plan.id });
    expect(w.emitted('preview')!.at(-1)![0]).toBeNull(); w.unmount();
  });
  it("停止、过期或只读清除自动方案预览", async () => {
    const plan = { id: 'plan.1', summary: '咖啡流程', contextId: scope.contextId, baseToken: token, affectedContexts: [], reason: '', status: 'ready' as const,
      command: { command_type: 'APPLY_MODEL_PLAN' as const, payload: { context_id: scope.contextId, steps: [{ local_id: 'local.beans', command_type: 'CREATE_ELEMENT' as const, kind: 'OBJECT' as const, name: '咖啡豆', layout: { x: 10, y: 10 } }] } },
      previewData: { context_id: scope.contextId, constructs: [], suppressed_states: [] } };
    let receive: (v: AssistantConversation) => void = () => {};
    vi.mocked(assistantRequest).mockResolvedValue([ { ...conversation, proposals: [plan] } ]);
    vi.mocked(watchAssistant).mockImplementation((_s, _id, _signal, next) => { receive = next; return new Promise(() => {}); });
    const w = setup(); await flushPromises(); expect(w.emitted('preview')!.at(-1)![0]).toEqual(plan);
    await w.setProps({ token: { ...token, edit_seq: 1 } }); expect(w.emitted('preview')!.at(-1)![0]).toBeNull();
    await w.setProps({ token }); receive({ ...conversation, proposals: [plan] }); await flushPromises();
    await w.setProps({ readonly: true }); expect(w.emitted('preview')!.at(-1)![0]).toBeNull();
    await w.setProps({ readonly: false }); receive({ ...conversation, proposals: [{ ...plan, status: 'cancelled' }] }); await flushPromises();
    expect(w.emitted('preview')!.at(-1)![0]).toBeNull(); w.unmount();
  });
  it("模型分析保存和切换目标图保留输入与会话；未保存或来源过期清除预览并禁止确认", async () => {
    const analysisScope = { ...scope, kind: 'ANALYSIS' as const, mindmapId: 'mindmap.test' };
    const plan = { id: 'plan.analysis', summary: '分析转换', contextId: scope.contextId, baseToken: token, affectedContexts: [], reason: '', status: 'ready' as const,
      analysisSource: { mindmap_id: 'mindmap.test', revision: 2, digest: 'b'.repeat(64), bindings: [{ source_id: 'beans', target_ref: 'local.beans' }], excluded_ids: [] },
      command: { command_type: 'APPLY_MODEL_PLAN' as const, payload: { context_id: scope.contextId, steps: [{ local_id: 'local.beans', command_type: 'CREATE_ELEMENT' as const, kind: 'OBJECT' as const, name: '咖啡豆', layout: { x: 10, y: 10 } }] } },
      validation: { validation_scope: 'MODEL' as const, items: [], validation_summary: { blocking: 0, warning: 0 as const, suggestion: 0 as const, coverage_state: 'INCOMPLETE' as const } },
      review: { skill_version: '1.0.0', standard_version: 'ISO 19450:2024', coverage: 'PARTIAL_SEMANTIC_REVIEW', source_digest: 'a'.repeat(64), plan_digest: 'b'.repeat(64), snapshot_digest: 'c'.repeat(64), checked_at: '2026-10-05', checks: [], issues: [], assumptions: [] },
      previewData: { context_id: scope.contextId, constructs: [], suppressed_states: [] } };
    vi.mocked(assistantRequest).mockResolvedValueOnce([{ ...conversation, ...analysisScope, proposals: [plan] }]);
    const w = mount(AssistantPanel, { props: { scope: analysisScope, contextName: 'SD', token, readonly: false, selectedIds: [], analysisRevision: 2, analysisDirty: false } });
    await flushPromises(); await w.get('textarea').setValue('还未发送的补充');
    expect(w.get('[data-testid="assistant-apply"]').attributes('disabled')).toBeUndefined();
    await w.setProps({ scope: { ...analysisScope }, analysisDirty: true }); await flushPromises();
    expect(w.get('[data-testid="assistant-apply"]').attributes('disabled')).toBeDefined();
    expect(w.emitted('preview')!.at(-1)![0]).toBeNull();
    await w.setProps({ scope: { ...analysisScope }, analysisDirty: false, analysisRevision: 3 }); await flushPromises();
    expect(w.get('[data-testid="assistant-apply"]').attributes('disabled')).toBeDefined();
    await w.setProps({ scope: { ...analysisScope, contextId: 'context.child' } }); await flushPromises();
    expect((w.get('textarea').element as HTMLTextAreaElement).value).toBe('还未发送的补充');
    expect(assistantRequest).toHaveBeenCalledTimes(1); expect(w.text()).toContain('分析转换'); w.unmount();
  });
});
