import { parseEnv } from 'node:util';
import { readFile, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configuration, startServer } from '../../../apps/assistant/src/server.mjs';
import { AssistantService } from '../../../apps/assistant/src/service.mjs';
import { createHarness } from '../../../apps/assistant/src/harness.mjs';

// 身份通过 stdin 传入，输出仅包含可复核的报告与方案，不输出会话凭据。
let input = ''; for await (const chunk of process.stdin) input += chunk;
const { scope, session } = JSON.parse(input);
const env = parseEnv(await readFile('apps/assistant/.env.local', 'utf8'));
const config = configuration({ ...process.env, ...env, OPM_ASSISTANT_PORT: '0', OPM_ASSISTANT_DATA: await mkdtemp(join(tmpdir(), 'opm-review-fault-')) });
const reviews = []; let repairs = 0, generated = false;
let service;
service = new AssistantService(config, async () => {
  const real = await createHarness(config, scope.projectId);
  return { close: () => real.close(), run: async (text, options) => {
    if (!generated) {
      generated = true;
      // 仅首轮生成注入错误；标准审查及自动修正全部使用真实 DeepSeek。
      for (const [local_id, name, x] of [['beans', '咖啡豆', 80], ['grind', '磨豆', 320], ['powder', '咖啡粉', 560]]) {
        await service.tool(options.sessionId, 'stage_change', { step_json: JSON.stringify({ local_id, command_type: 'CREATE_ELEMENT', kind: 'OBJECT', name, layout: { x, y: 200 } }) });
      }
      return { finalResponse: '已生成待审查预览。', events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] };
    }
    const task = service.tasks.get(scope.projectId); if (task.repairing) repairs++;
    const result = await real.run(text, options);
    if (options.sessionId.startsWith('review.') && task.review?.report) reviews.push(structuredClone(task.review.report));
    return result;
  } };
});
const app = await startServer(config, service); config.toolOrigin = `http://127.0.0.1:${app.server.address().port}`;
try {
  const conversation = await service.create(scope, session), before = await service.runtime(session).open(scope);
  await service.prompt(conversation.id, scope, session, '创建一个咖啡豆到咖啡粉的磨豆流程，含咖啡豆、咖啡粉两个对象和磨豆过程，消耗咖啡豆并产出咖啡粉。合理布局，最后一次确认。', [], before.draft_token);
  await service.tasks.get(scope.projectId).completion;
  const value = await service.get(conversation.id, scope, session), proposal = value.proposals.at(-1);
  const unchanged = await service.runtime(session).open(scope);
  if (proposal.status === 'ready') await service.apply(value.id, scope, proposal.id, session, before.draft_token);
  const after = await service.runtime(session).open(scope);
  console.log(JSON.stringify({ repairs, reviews, status: proposal.status, reason: proposal.reason, command: proposal.command,
    validation: proposal.validation, review: proposal.review, response: value.messages.at(-1).text, before: before.draft_token, previewToken: unchanged.draft_token, after: after.draft_token }));
} finally { await app.close(); }
