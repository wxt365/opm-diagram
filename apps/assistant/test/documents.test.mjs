import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { parseAttachments, documentContext } from '../src/documents.mjs';
import { AssistantService } from '../src/service.mjs';
import { brief } from '../src/messages.mjs';
import { startServer } from '../src/server.mjs';

const file = (name, value) => ({ name, contentBase64: Buffer.from(value).toString('base64') });
test('UTF-8 文档完整读取，拒绝空白、格式、编码、数量及大小异常', async () => {
  const documents = await parseAttachments([file('需求.md', '客户提交订单\n系统检查库存')]);
  assert.equal(documents[0].text, '客户提交订单\n系统检查库存');
  for (const files of [[file('empty.txt', '')], [file('blank.txt', '  ')], [file('bad.exe', 'binary')], [file('bad.txt', Buffer.from([255]))], Array(4).fill(file('a.txt', 'a')), [file('../escape.txt', 'a')], [{ name: 'bad.txt', contentBase64: '!!' }], [file('large.txt', Buffer.alloc(5 * 1024 * 1024 + 1))]]) {
    await assert.rejects(parseAttachments(files), error => error.code.startsWith('INPUT_'));
  }
  assert.throws(() => documentContext([{ attachments: [{ name: 'large.txt', text: 'a'.repeat(60001) }] }]), { code: 'INPUT_TOO_LARGE' });
});

test('真实 DOCX ZIP 提取段落，损坏 DOCX/PDF 明确拒绝', async () => {
  const require = createRequire(new URL('../package.json', import.meta.url));
  const JSZip = require('jszip'); const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>');
  zip.file('_rels/.rels', '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/document.xml', '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>客户提交订单</w:t></w:r></w:p></w:body></w:document>');
  const documents = await parseAttachments([file('需求.docx', await zip.generateAsync({ type: 'nodebuffer' }))]);
  assert.match(documents[0].text, /客户提交订单/);
  await assert.rejects(parseAttachments([file('bad.docx', 'invalid')]), { code: 'INPUT_INVALID' });
  await assert.rejects(parseAttachments([file('bad.pdf', 'invalid')]), { code: 'INPUT_INVALID' });
});

test('真实文字 PDF 提取页码和正文，扫描 PDF 提示 OCR', async () => {
  function pdf(text) {
    const stream = text ? 'BT /F1 12 Tf 20 100 Td (Order submitted) Tj ET' : '';
    const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>', `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
    let value = '%PDF-1.4\n'; const offsets = [0];
    objects.forEach((object, index) => { offsets.push(value.length); value += `${index + 1} 0 obj\n${object}\nendobj\n`; });
    const start = value.length; value += `xref\n0 6\n0000000000 65535 f \n${offsets.slice(1).map(offset => String(offset).padStart(10, '0') + ' 00000 n \n').join('')}trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`;
    return value;
  }
  const documents = await parseAttachments([file('order.pdf', pdf(true))]);
  assert.match(documents[0].text, /第 1 页/); assert.match(documents[0].text, /Order submitted/);
  await assert.rejects(parseAttachments([file('scan.pdf', pdf(false))]), /文字识别/);
});

test('附件通过实际 prompt 进入模型，多轮复用且响应隐藏正文，跨范围拒绝', async t => {
  const root = await mkdtemp(join(tmpdir(), 'assistant-documents-')); const prompts = [];
  const service = new AssistantService({ dataRoot: root }, async () => ({ close() {}, async run(text) {
    prompts.push(text); return { finalResponse: '已阅读', events: [{ type: 'turn/end', data: { reason: { kind: 'completed' } } }] };
  } }));
  await service.init(); t.after(async () => { await service.close(); await rm(root, { recursive: true, force: true }); });
  const scope = { projectId: 'p', modelId: 'm', contextId: 'c' }, token = { draft_id: 'd', edit_seq: 0, binding_digest: 'a' };
  service.runtime = () => ({ open: async () => ({}), snapshot: async () => ({ token }) });
  const conversation = await service.create(scope, 'session');
  await service.prompt(conversation.id, scope, 'session', '阅读', [], token, [file('需求.txt', '库存不足时拒绝订单')]);
  await service.tasks.get(scope.projectId)?.completion;
  await service.prompt(conversation.id, scope, 'session', '库存不足怎么办', [], token);
  await service.tasks.get(scope.projectId)?.completion;
  assert.equal(prompts.length, 2); for (const prompt of prompts) assert.match(prompt, /库存不足时拒绝订单/);
  const stored = await service.store.read(conversation.id); assert.equal(stored.run.status, 'completed');
  assert.deepEqual(brief(stored).messages[0].attachments, [{ name: '需求.txt', size: Buffer.byteLength('库存不足时拒绝订单') }]);
  await assert.rejects(service.prompt(conversation.id, { ...scope, contextId: 'other' }, 'session', '读附件', [], token), { code: 'SCOPE_MISMATCH' });
  const analysisScope = { ...scope, kind: 'ANALYSIS', mindmapId: 'mindmap.test' };
  service.runtime = () => ({ open: async () => ({}), snapshot: async () => ({ token }), query: async () => ({ document: { id: analysisScope.mindmapId } }) });
  const analysis = await service.create(analysisScope, 'session');
  await service.prompt(analysis.id, analysisScope, 'session', '读取文档整理脑图', [], token, [file('分析.txt', '付款后安排配送')]);
  await service.tasks.get(scope.projectId)?.completion;
  assert.match(prompts.at(-1), /付款后安排配送/);
  assert.equal((await service.store.read(analysis.id)).run.status, 'completed');
});

test('HTTP prompt 允许附件超过旧 256 KiB 限制，其他接口保留限制', async t => {
  let received;
  const app = await startServer({ port: 0, toolSecret: 'test' }, { init: async () => {}, close: async () => {}, authenticate: async () => {}, prompt: async (...args) => { received = args[6]; return { accepted: true }; } });
  t.after(() => app.close()); const origin = `http://127.0.0.1:${app.server.address().port}`;
  const body = { projectId: 'p', modelId: 'm', contextId: 'c', conversationId: 'conversation', text: '阅读', draftToken: { draft_id: 'd', edit_seq: 0, binding_digest: 'a' }, attachments: [file('large.pdf', Buffer.alloc(300000, 65))] };
  const post = path => fetch(origin + '/api/assistant/' + path, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-OPM-Session': 'test-session' }, body: JSON.stringify(body) });
  assert.equal((await post('prompt')).status, 200); assert.deepEqual(received, body.attachments);
  assert.equal((await post('get')).status, 413);
});
