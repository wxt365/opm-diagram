import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { configuration, startServer } from '../../../apps/assistant/src/server.mjs';
import { AssistantService } from '../../../apps/assistant/src/service.mjs';
import { createHarness } from '../../../apps/assistant/src/harness.mjs';

// 仅在显式隔离存储下注入第一次审查失败；生成和重审使用真实 DeepSeek。
if (!process.env.OPM_ASSISTANT_DATA?.startsWith('/private/tmp/') || process.env.OPM_RUNTIME_ORIGIN !== 'http://127.0.0.1:17852') throw new Error('必须使用隔离测试服务和临时存储。');
const env = parseEnv(await readFile('apps/assistant/.env.local', 'utf8'));
const config = configuration({ ...env, ...process.env });
let service, injected = false;
service = new AssistantService(config, async (_config, projectId) => {
  const real = await createHarness(config, projectId);
  return { close: () => real.close(), run: async (text, options) => {
    if (options.sessionId.startsWith('review.') && !injected) {
      injected = true;
      const data = await service.tool(options.sessionId, 'read_review_model', {});
      const invalid = { snapshot_digest: data.snapshot_digest, checks: data.rules.rules.map(rule => ({ rule_id: rule.rule_id, result: 'PASS', explanation: '故障注入' })), issues: [] };
      for (let i = 0; i < 3; i++) {
        try { await service.tool(options.sessionId, 'submit_review', { report_json: JSON.stringify(invalid) }); }
        catch (error) { console.log(`故障注入提交 ${i + 1}: ${error.code}`); }
      }
      return new Promise(() => {});
    }
    return real.run(text, options);
  } };
});
const app = await startServer(config, service);
console.log(`隔离审查验证服务已启动 ${app.server.address().port}`);
for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => void app.close().then(() => process.exit(0)));
