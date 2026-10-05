import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

// 跟随锁定的 SDK profile 加载协议，避免混用其他版本的运行时。
const runtimeRequire = createRequire(createRequire(import.meta.url).resolve('@deepseek-ai/dsh-sdk-app/package.json'));
const { HarnessSdkJsonRpcServer } = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/dsh-sdk-jsonrpc-server')).href);
const { JsonRpcLineTransport } = await import(pathToFileURL(runtimeRequire.resolve('@deepseek-ai/dsh-sdk-protocol')).href);
export const name = 'opm-sdk-server';
export const inject = ['agents', 'sessionPersistence', 'tools'];
export class ModelingSdkServer extends HarnessSdkJsonRpcServer {
  async createSession(sessionId) {
    const agentOptions = { provider: this.provider, model: this.model, maxTokens: this.maxTokens };
    const setup = agentCtx => { agentCtx.tools.restrict({ allow: sessionId.startsWith('review.')
      ? ['read_review_model', 'submit_review'] : sessionId.startsWith('analysis.') ? ['read_analysis', 'save_analysis'] : ['read_model', 'get_capabilities', 'propose_change', 'stage_change', 'revise_plan'] }); };
    const existing = await this.ctx.sessionPersistence.stat(sessionId);
    const handle = existing
      ? await this.ctx.agents.resume({ resumeSessionId: sessionId, agentOptions, setup })
      : await this.ctx.agents.create({ sessionId, meta: { cwd: this.cwd }, agentOptions, setup });
    const record = { handle }; this.sessions.set(sessionId, record); return record;
  }
}
export function apply(ctx) {
  const transport = new JsonRpcLineTransport(process.stdin, process.stdout);
  const server = new ModelingSdkServer(ctx, transport, { maxTokensAsSuccess: false });
  let exitTask;
  transport.onRequest(async (method, params) => {
    if (method === 'initialize') await ctx.get('loader')?.await();
    const result = await server.handleRequest(method, params);
    if (method === 'shutdown') setImmediate(() => {
      exitTask ??= (async () => { await transport.flush(); await ctx.root.fiber.dispose(); process.exit(0); })();
    });
    return result;
  });
  ctx.effect(() => {
    transport.start();
    return async () => { await server.shutdown(); transport.close(); };
  }, 'opm.jsonrpc.serve');
}
