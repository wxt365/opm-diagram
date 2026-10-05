import { expect, test, type Page } from '@playwright/test';
import { writeFile, readFile } from 'node:fs/promises';
import type { MindmapResult } from '../../apps/web/src/shared/api/generated/draftWorkspaceContract';

async function createWorkbench(page: Page, title: string) {
  await page.goto('/projects'); await page.getByTestId('p01-create-project').click();
  await page.getByTestId('ov01-project-name').fill(`${title}-${Date.now()}`);
  await page.getByTestId('ov01-create-project').getByRole('button', { name: '创建并继续' }).click();
  await page.getByTestId('p02-create-model').click(); await page.getByTestId('ov02-model-name').fill('咖啡分析');
  await page.getByRole('button', { name: '创建并打开工作台', exact: true }).click(); await expect(page.getByTestId('hs-save')).toBeEnabled();
  await page.getByTestId('p03-bottom-toggle').click();
  const parts = new URL(page.url()).pathname.split('/'), projectId = parts[2]!, modelId = parts[4]!;
  const headers = { Origin: new URL(page.url()).origin, 'X-OPM-Session': (await page.evaluate(() => window.__OPM_LOCAL_SESSION__))! };
  const runtime = async (operation: string, extra = {}) => {
    const response = await page.request.post(`/api/v2/projects/${projectId}/models/${modelId}/draft/${operation}`, { headers, data: { request_id: `request.proof.${crypto.randomUUID()}`, ...extra } });
    expect(response.status(), await response.text()).toBe(200); return response.json();
  };
  const opened = await runtime('open', { context_id: null }), contextId = opened.context_id;
  const brain = async (): Promise<MindmapResult> => runtime('mindmap', { action: 'OPEN', draft_token: (await runtime('open', { context_id: contextId })).draft_token });
  return { projectId, modelId, contextId, runtime, brain, headers };
}
test('真实脑图编辑、键盘、拖动、缩放、独立保存、JSON 迁移和四屏宽', async ({ page }, info) => {
  await page.setViewportSize({ width: 1600, height: 1000 }); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const f = await createWorkbench(page, '脑图交互验证'); const token = (await f.runtime('open', { context_id: f.contextId })).draft_token;
  await page.getByTestId('editor-mode-analysis').click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  const brain = page.getByTestId('mindmap-panel'), canvas = page.getByTestId('mindmap-canvas');
  await canvas.focus(); await page.keyboard.press('Tab'); await page.getByTestId('mindmap-node-label').fill('咖啡豆'); await page.getByTestId('mindmap-node-kind').selectOption('OBJECT');
  await page.getByTestId('mindmap-save').click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  const first = await f.brain(), beans = first.document.nodes.find(node => node.label === '咖啡豆')!;
  expect(beans.kind).toBe('OBJECT'); expect((await f.runtime('open', { context_id: f.contextId })).draft_token).toEqual(token);
  await canvas.focus(); await page.keyboard.press('Tab'); await page.getByTestId('mindmap-node-label').fill('待烘焙'); await page.getByTestId('mindmap-node-kind').selectOption('STATE'); await page.getByTestId('mindmap-node-owner').selectOption(beans.id);
  await page.getByTestId('mindmap-save').click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  const saved = await f.brain(); expect(saved.document.nodes.find(node => node.label === '待烘焙')?.owner_id).toBe(beans.id);
  await brain.getByTestId(`mindmap-node-${saved.document.root_id}`).click(); await canvas.focus(); await page.keyboard.press('Tab');
  await page.getByTestId('mindmap-node-label').fill('烘焙'); await page.getByTestId('mindmap-node-kind').selectOption('PROCESS');
  await page.getByTestId('mindmap-save').click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  await brain.getByTestId(`mindmap-node-${beans.id}`).click(); await canvas.focus(); await page.keyboard.press('Tab');
  await page.getByTestId('mindmap-node-label').fill('已烘焙'); await page.getByTestId('mindmap-node-kind').selectOption('STATE'); await page.getByTestId('mindmap-node-owner').selectOption(beans.id);
  await page.getByTestId('mindmap-save').click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  const states = await f.brain(), rawId = states.document.nodes.find(node => node.label === '待烘焙')!.id, roastId = states.document.nodes.find(node => node.label === '烘焙')!.id, doneId = states.document.nodes.find(node => node.label === '已烘焙')!.id;
  await brain.getByRole('button', { name: '添加关系说明', exact: true }).click(); await brain.getByTestId('mindmap-relation-label').fill('咖啡豆烘焙状态变化');
  await brain.getByTestId('mindmap-relation-kind').selectOption('CAP-ISO-PROC-008');
  for (const [index, id] of [rawId, roastId, doneId].entries()) await brain.getByTestId(`mindmap-relation-endpoint-${index + 1}`).selectOption(id);
  await brain.getByRole('button', { name: '保存关系说明', exact: true }).click(); await page.getByTestId('mindmap-save').click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  expect((await f.brain()).document.relations[0]?.endpoints).toEqual([rawId, roastId, doneId]);
  await brain.getByRole('button', { name: '折叠 咖啡豆', exact: true }).click(); await expect(brain.locator('.mindmap-node').filter({ hasText: '待烘焙' })).toHaveCount(0);
  await brain.getByRole('textbox', { name: '搜索分析节点' }).fill('待烘焙'); await expect(brain.locator('.mindmap-node').filter({ hasText: '待烘焙' })).toBeVisible();
  await brain.getByRole('textbox', { name: '搜索分析节点' }).fill('');
  const group = saved.document.nodes.find(node => node.label === '对象')!;
  await brain.getByTestId(`mindmap-node-${beans.id}`).dragTo(brain.getByTestId(`mindmap-node-${group.id}`));
  await expect.poll(async () => (await f.brain()).document.nodes.find(node => node.id === beans.id)?.parent_id).toBe(group.id);
  const zoom = await brain.locator('.mindmap-zoom span').innerText(); await canvas.hover(); await page.mouse.wheel(0, -250); await expect(brain.locator('.mindmap-zoom span')).not.toHaveText(zoom);
  await brain.getByRole('button', { name: '适应', exact: true }).click(); await brain.getByTestId(`mindmap-node-${beans.id}`).click(); await canvas.focus(); await page.keyboard.press('F2'); await expect(page.getByTestId('mindmap-node-label')).toBeFocused();
  await page.getByTestId('mindmap-node-label').fill('生咖啡豆'); await page.getByTestId('mindmap-node-label').press('Tab'); await canvas.focus(); await page.keyboard.press('Control+z');
  await expect(page.getByTestId('mindmap-node-label')).toHaveValue('咖啡豆'); await page.keyboard.press('Control+Shift+z'); await expect(page.getByTestId('mindmap-node-label')).toHaveValue('生咖啡豆');
  await brain.getByRole('button', { name: '保存分析', exact: true }).click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  const download = page.waitForEvent('download'); await brain.getByRole('button', { name: '导出 JSON', exact: true }).click(); const file = await download; const pack = JSON.parse(await readFile((await file.path())!, 'utf8'));
  await page.getByTestId('mindmap-import').setInputFiles({ name: 'analysis.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(pack)) });
  await brain.getByRole('button', { name: '保存分析', exact: true }).click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  const imported = await f.brain(); expect(imported.document.id).toBe(pack.document.id); expect(imported.document.nodes.find(node => node.label === '生咖啡豆')?.id).not.toBe(beans.id);
  await page.reload(); await expect(page.getByTestId('hs-save')).toBeEnabled(); await page.getByTestId('editor-mode-analysis').click(); await expect(brain).toContainText('生咖啡豆');
  for (const width of [1600, 1280, 820, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await expect(brain).toBeVisible();
    await brain.getByRole('button', { name: '适应', exact: true }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.screenshot({ path: info.outputPath(`mindmap-${width}.png`), fullPage: true });
  }
  await writeFile(info.outputPath('mindmap-ui-proof.json'), JSON.stringify({ projectId: f.projectId, modelId: f.modelId, beforeToken: token, afterToken: (await f.runtime('open', { context_id: f.contextId })).draft_token, saved: imported }));
  expect(errors).toEqual([]);
});

test('真实 DeepSeek 多轮脑图分析、实时单图预览、一次确认、来源恢复和增量', async ({ page }, info) => {
  test.skip(process.env.OPM_MINDMAP_LIVE !== 'true', '需要独立 DeepSeek 服务'); test.setTimeout(600000);
  await page.setViewportSize({ width: 1600, height: 1100 }); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const f = await createWorkbench(page, '脑图真实模型验证'), token = (await f.runtime('open', { context_id: f.contextId })).draft_token;
  await page.getByTestId('editor-mode-analysis').click(); const panel = page.locator('.assistant-panel:visible');
  const ask = async (text: string) => { await expect(panel.getByTestId('assistant-input')).toBeEnabled(); await panel.getByTestId('assistant-input').fill(text); await panel.getByTestId('assistant-send').click(); await expect(panel.getByTestId('assistant-running')).toBeVisible(); await expect(panel.getByTestId('assistant-running')).toHaveCount(0, { timeout: 180000 }); };
  await ask('请整理咖啡豆烘焙的脑图分析。范围仅咖啡豆对象、烘焙过程、咖啡豆的待烘焙与已烘焙两个状态和一条输入输出指定状态变化关系，明确状态所属咖啡豆。保留分析分组，不新增其他业务节点或问题，保存到脑图，不生成正式模型。');
  await expect.poll(async () => (await f.brain()).document.nodes.some(node => node.kind === 'STATE' && node.label === '待烘焙')).toBe(true);
  const first = await f.brain(), brainScope = { projectId: f.projectId, modelId: f.modelId, contextId: f.contextId, kind: 'ANALYSIS', mindmapId: first.document.id };
  const assistant = async (op: string, extra = {}) => { const r = await page.request.post(`/api/assistant/${op}`, { headers: f.headers, data: { ...brainScope, ...extra } }); expect(r.status(), await r.text()).toBe(200); return r.json(); };
  const conversation = (await assistant('list'))[0];
  await ask('在上轮已保存的脑图上补充烘焙机对象和它作为工具支持烘焙的关系说明（Instrument）。保留此前节点与关系的稳定 ID，不改名不生成 OPD。');
  await expect.poll(async () => (await f.brain()).document.nodes.some(node => node.label === '烘焙机')).toBe(true);
  const second = await f.brain(); expect(second.document.revision).toBeGreaterThan(first.document.revision);
  for (const node of first.document.nodes.filter(node => node.kind !== 'TOPIC')) expect(second.document.nodes.some(item => item.id === node.id)).toBe(true);
  expect((await assistant('list'))[0].id).toBe(conversation.id); expect((await f.runtime('open', { context_id: f.contextId })).draft_token).toEqual(token);
  const opdConversations = await page.request.post('/api/assistant/list', { headers: f.headers, data: { projectId: f.projectId, modelId: f.modelId, contextId: f.contextId } }); expect((await opdConversations.json())[0].messages).toEqual([]);
  // 分析资料可包含未转为正式语义的说明，用户显式排除，不静默丢弃。
  const omitted = second.document.nodes.filter(node => !['TOPIC', 'OBJECT', 'PROCESS', 'STATE'].includes(node.kind));
  if (omitted.length) { await page.getByTestId('mindmap-panel').getByText('暂不纳入本次转换', { exact: true }).click(); for (const node of omitted) await page.getByTestId('mindmap-panel').getByRole('checkbox', { name: node.label, exact: true }).check(); }
  await page.getByTestId('mindmap-convert').click(); await expect(page.getByTestId('assistant-canvas-preview')).toContainText('实时生成预览', { timeout: 30000 });
  await expect(panel.getByTestId('assistant-apply').last()).toBeDisabled(); expect((await f.runtime('open', { context_id: f.contextId })).draft_token).toEqual(token);
  await page.screenshot({ path: info.outputPath('mindmap-conversion-progress.png') });
  await expect(panel.getByTestId('assistant-running')).toHaveCount(0, { timeout: 180000 }); await expect(panel.getByTestId('assistant-apply').last()).toBeEnabled();
  const proposal = (await assistant('list'))[0].proposals.at(-1); expect(proposal.status).toBe('ready'); expect(proposal.validation.validation_summary.blocking).toBe(0); expect(proposal.review.issues.filter((x: { severity: string }) => x.severity === 'ERROR')).toEqual([]);
  expect(await page.locator('.x6-edge').count()).toBeGreaterThanOrEqual(3); await page.screenshot({ path: info.outputPath('mindmap-conversion-ready.png') });
  await panel.getByTestId('assistant-apply').last().click(); await expect(page.getByTestId('assistant-canvas-preview')).toHaveCount(0);
  await expect.poll(async () => (await f.runtime('open', { context_id: f.contextId })).draft_token.edit_seq).toBe(1);
  const applied = await f.brain(); expect(applied.conversions).toHaveLength(1); expect(applied.conversions[0]?.mappings.length).toBe(7);
  await page.getByTestId('hs-save').click(); await expect(page.getByTestId('hs-save-state')).toHaveText('已手动保存'); await page.reload(); await expect(page.getByTestId('hs-save')).toBeEnabled();
  const beansMapping = applied.conversions[0]!.mappings.find(item => item.target_name === '咖啡豆')!;
  await page.locator(`.x6-node[data-cell-id="${beansMapping.target_id}"]`).click({ position: { x: 20, y: 10 } });
  await expect(page.getByTestId('mindmap-locate-source')).toContainText('咖啡豆'); await page.getByTestId('mindmap-locate-source').click();
  await expect(page.getByTestId('mindmap-node-label')).toHaveValue('咖啡豆');
  await page.getByTestId('mindmap-convert').click(); await expect(panel).toContainText('未创建重复元素'); expect((await f.brain()).conversions).toHaveLength(1);
  await page.getByTestId('mindmap-node-label').fill('烘焙咖啡豆'); await page.getByTestId('mindmap-node-label').press('Tab'); await page.getByTestId('mindmap-save').click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  await page.getByTestId('mindmap-convert').click(); await expect(panel.getByTestId('assistant-running')).toBeVisible(); await expect(panel.getByTestId('assistant-running')).toHaveCount(0, { timeout: 180000 });
  const increment = (await assistant('list'))[0].proposals.at(-1); expect(increment.command.payload.steps).toHaveLength(1); expect(increment.command.payload.steps[0].command_type).toBe('UPDATE_PROPERTY');
  await expect(panel.getByTestId('assistant-apply').last()).toBeEnabled();
  await page.getByTestId('editor-mode-analysis').click(); await page.getByTestId('mindmap-node-label').fill('另一名称'); await page.getByTestId('mindmap-node-label').press('Tab');
  await expect(panel.getByTestId('assistant-apply').last()).toBeDisabled(); await page.getByTestId('mindmap-save').click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  const stale = await page.request.post('/api/assistant/apply', { headers: f.headers, data: { ...brainScope, conversationId: conversation.id, proposalId: increment.id, draftToken: increment.baseToken } }); expect(stale.status()).toBe(409);
  await panel.getByTestId('assistant-cancel').last().click();
  await writeFile(info.outputPath('mindmap-live-proof.json'), JSON.stringify({ ...brainScope, conversationId: conversation.id, first, second, applied, proposal, increment }));
  expect(errors).toEqual([]);
});

test('重启后分析续聊、增量确认、来源删除、目标子图与停止只读边界', async ({ page }, info) => {
  test.skip(!process.env.OPM_MINDMAP_RESUME_PROOF, '需要前一次隔离真实模型的证据，重启助手后执行'); test.setTimeout(600000);
  const proof = JSON.parse(await readFile(process.env.OPM_MINDMAP_RESUME_PROOF!, 'utf8'));
  await page.setViewportSize({ width: 1600, height: 1000 }); const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`/projects/${proof.projectId}/models/${proof.modelId}/workbench?context=${proof.contextId}`);
  await expect(page.getByTestId('hs-save')).toBeEnabled(); await page.getByTestId('editor-mode-analysis').click();
  const headers = { Origin: new URL(page.url()).origin, 'X-OPM-Session': (await page.evaluate(() => window.__OPM_LOCAL_SESSION__))! };
  const runtime = async (operation: string, extra = {}): Promise<any> => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const r = await page.request.post(`/api/v2/projects/${proof.projectId}/models/${proof.modelId}/draft/${operation}`, { headers, data: { request_id: `request.resume.${crypto.randomUUID()}`, ...extra } });
      // 提交中 OPEN 的两次版本读取可能不一致；仅重读，不重发任何修改。
      if (operation === 'open' && r.status() === 409 && attempt < 3) continue;
      expect(r.status(), await r.text()).toBe(200); return r.json();
    }
  };
  const open = () => runtime('open', { context_id: proof.contextId });
  const brain = async (): Promise<MindmapResult> => runtime('mindmap', { action: 'OPEN', draft_token: (await open()).draft_token });
  const scope = { projectId: proof.projectId, modelId: proof.modelId, contextId: proof.contextId, kind: 'ANALYSIS', mindmapId: proof.mindmapId };
  const list = async () => { const r = await page.request.post('/api/assistant/list', { headers, data: scope }); expect(r.status()).toBe(200); return (await r.json())[0]; };
  expect((await list()).id).toBe(proof.conversationId);
  const before = await brain(), token = (await open()).draft_token, panel = page.locator('.assistant-panel:visible');
  await expect(panel).toContainText('请整理咖啡豆烘焙');
  await panel.getByTestId('assistant-input').fill('继续当前分析，只将根主题的 note 追加“服务重启后续聊验证”。保留所有节点和关系的 ID、类型、名称、引用以及模型绑定，不新增任何节点/问题/关系，不生成正式模型。读取并保存脑图。');
  await panel.getByTestId('assistant-send').click(); await expect(panel.getByTestId('assistant-running')).toBeVisible(); await expect(panel.getByTestId('assistant-running')).toHaveCount(0, { timeout: 180000 });
  const resumed = await brain(); expect(resumed.document.revision).toBeGreaterThan(before.document.revision); expect((await list()).id).toBe(proof.conversationId);
  expect(resumed.document.nodes.map(node => node.id)).toEqual(before.document.nodes.map(node => node.id)); expect((await open()).draft_token).toEqual(token);
  // 之前被版本冲突取消的改名可以重新预览并确认，正式身份保持不变。
  await page.getByTestId('mindmap-convert').click(); await expect(panel.getByTestId('assistant-running')).toBeVisible(); await expect(panel.getByTestId('assistant-running')).toHaveCount(0, { timeout: 180000 });
  const increment = (await list()).proposals.at(-1); expect(increment.command.payload.steps).toHaveLength(1); expect(increment.command.payload.steps[0].command_type).toBe('UPDATE_PROPERTY');
  await expect(panel.getByTestId('assistant-apply').last()).toBeEnabled(); await panel.getByTestId('assistant-apply').last().click();
  await expect.poll(async () => (await open()).draft_token.edit_seq).toBe(token.edit_seq + 1);
  const converted = await brain(), afterToken = (await open()).draft_token;
  const beansMapping = converted.conversions.at(-1)!.mappings.find(item => item.source_id === before.document.nodes.find(node => node.kind === 'OBJECT' && node.label !== '烘焙机')!.id)!;
  expect(beansMapping.target_id).toBe(proof.applied.conversions[0].mappings.find((item: { source_id: string }) => item.source_id === beansMapping.source_id).target_id);
  // 删除分析来源只删分析树，正式对象与 Instrument 事实保留。
  await page.getByTestId('editor-mode-analysis').click(); const machine = converted.document.nodes.find(node => node.label === '烘焙机')!;
  await page.getByTestId(`mindmap-node-${machine.id}`).click(); await page.getByTestId('mindmap-canvas').focus(); await page.keyboard.press('Delete');
  await page.getByTestId('mindmap-panel').getByRole('button', { name: '确认删除分析', exact: true }).click(); await page.getByTestId('mindmap-save').click(); await expect(page.getByTestId('mindmap-save-state')).toHaveText('分析已保存');
  expect((await open()).draft_token).toEqual(afterToken);
  const projection = await runtime('projection', { draft_token: afterToken, context_id: proof.contextId });
  const machineMapping = proof.applied.conversions[0].mappings.find((item: { target_name: string }) => item.target_name === '烘焙机');
  expect(projection.data.constructs.some((item: { target_id: string }) => item.target_id === machineMapping.target_id)).toBe(true);
  await page.getByTestId('editor-mode-opd').click(); await page.locator(`.x6-node[data-cell-id="${machineMapping.target_id}"]`).click({ position: { x: 20, y: 10 } });
  await expect(page.getByTestId('mindmap-locate-source')).toHaveText('分析来源已移除'); await expect(page.getByTestId('mindmap-locate-source')).toBeDisabled();
  // 选择已有子图作为单图目标；预览不提交、不改变父图。
  const roast = projection.data.constructs.find((item: { construct_role: string }) => item.construct_role === 'PROCESS_NODE');
  const createScope = { context_id: proof.contextId, selection_id: roast.occurrence_id, intent: 'CREATE_CONTEXT', endpoints: [] };
  const cap = await runtime('capabilities', { draft_token: afterToken, scope: createScope }); const option = cap.data.options.find((item: { enabled: boolean }) => item.enabled);
  const child = await runtime('commands', { command_id: `command.child.${crypto.randomUUID()}`, expected_draft_token: afterToken, scope: createScope,
    authorization: { capability_query_id: cap.data.capability_query_id, selected_option_id: option.option_id }, command: { command_type: 'CREATE_CONTEXT', payload: { context_id: proof.contextId, refinee_element_id: roast.target_id, name: '隔离目标子图' } } });
  const childId = child.affected_ids.find((id: string) => id.startsWith('context.') && id !== proof.contextId);
  await page.reload(); await expect(page.getByTestId('hs-save')).toBeEnabled(); await page.getByTestId('editor-mode-analysis').click();
  await page.getByRole('combobox', { name: '转换目标 OPD' }).selectOption(childId);
  const latestBrain = await brain(), omitted = latestBrain.document.nodes.filter(node => !['TOPIC', 'OBJECT', 'PROCESS', 'STATE'].includes(node.kind));
  if (omitted.length) { await page.getByTestId('mindmap-panel').getByText('暂不纳入本次转换', { exact: true }).click(); for (const node of omitted) await page.getByTestId('mindmap-panel').getByRole('checkbox', { name: node.label, exact: true }).check(); }
  await page.getByTestId('mindmap-convert').click(); await expect(page.getByTestId('assistant-canvas-preview')).toBeVisible(); await expect(panel.getByTestId('assistant-stop')).toBeVisible();
  const pending = (await list()).proposals.at(-1); expect(pending.contextId).toBe(childId); expect((await list()).id).toBe(proof.conversationId);
  await panel.getByTestId('assistant-stop').click(); await expect(page.getByTestId('assistant-canvas-preview')).toHaveCount(0); await expect(panel.getByTestId('assistant-running')).toHaveCount(0);
  expect((await open()).draft_token).toEqual(child.result_token);
  const childProjection = await runtime('projection', { draft_token: child.result_token, context_id: childId }); expect(childProjection.data.constructs).toEqual([]);
  const revisionSelect = page.getByRole('combobox', { name: '打开版本', exact: true }); const savedRevision = await revisionSelect.locator('option').last().getAttribute('value');
  await revisionSelect.selectOption(savedRevision!); await expect(page.getByTestId('editor-mode-analysis')).toBeDisabled();
  await writeFile(info.outputPath('mindmap-resume-proof.json'), JSON.stringify({ scope, conversationId: proof.conversationId, resumedRevision: resumed.document.revision, increment, childId, beforeToken: token, afterToken: child.result_token }));
  expect(errors).toEqual([]);
});
