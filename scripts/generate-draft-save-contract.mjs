import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const schema = JSON.parse(await readFile(path.join(root, 'docs/contracts/schemas/opm-draft-save-v02.schema.json'), 'utf8'));
const defs = schema.$defs;
const records = Object.entries(defs).filter(([, value]) => value.type === 'object');
for (const [name, value] of records) {
  if (value.additionalProperties !== false || JSON.stringify([...value.required].sort()) !== JSON.stringify(Object.keys(value.properties).sort())) {
    throw new Error(`${name} 必须封闭且每个字段均为必填；nullable 通过显式 null 表达`);
  }
}
const nullable = field => Boolean(field.anyOf?.some(item => item.type === 'null'));
const base = field => field.anyOf ? field.anyOf.find(item => item.type !== 'null') : field;
const resolve = field => field.$ref ? defs[field.$ref.split('/').at(-1)] : field;
const literal = value => JSON.stringify(value);

function type(field, java) {
  const value = base(field);
  const resolved = resolve(value);
  const result = value.$ref && resolved.type === 'object' ? value.$ref.split('/').at(-1)
    : resolved.enum && !java ? resolved.enum.map(literal).join(' | ')
    : ({ string: java ? 'String' : 'string', integer: java ? 'Long' : 'number', boolean: java ? 'Boolean' : 'boolean' })[resolved.type];
  if (!result) throw new Error('不支持的生成类型');
  return result + (!java && nullable(field) ? ' | null' : '');
}

function guards(name, field) {
  const value = resolve(base(field));
  const checks = [];
  if (!nullable(field)) checks.push(`            java.util.Objects.requireNonNull(${name}, "${name} 必填");`);
  const conditions = [];
  if (value.minimum !== undefined) conditions.push(`${name} < ${value.minimum}L`);
  if (value.maximum !== undefined) conditions.push(`${name} > ${value.maximum}L`);
  if (value.minLength !== undefined) conditions.push(`${name}.codePointCount(0, ${name}.length()) < ${value.minLength}`);
  if (value.maxLength !== undefined) conditions.push(`${name}.codePointCount(0, ${name}.length()) > ${value.maxLength}`);
  if (value.pattern) conditions.push(`!${name}.matches(${literal(value.pattern)})`);
  if (value.enum) conditions.push(`!java.util.Set.of(${value.enum.map(literal).join(', ')}).contains(${name})`);
  if (conditions.length) checks.push(`            if (${name} != null && (${conditions.join(' || ')})) throw new IllegalArgumentException("${name} 不符合保存契约");`);
  if (value.format === 'date-time') checks.push(`            if (${name} != null) java.time.Instant.parse(${name});`);
  return checks.join('\n');
}

const ts = '// 由 scripts/generate-draft-save-contract.mjs 生成，请勿手改。\n\n' + records.map(([name, value]) =>
  `export interface ${name} {\n${Object.entries(value.properties).map(([key, field]) => `  ${key}: ${type(field, false)};`).join('\n')}\n}`).join('\n\n') + '\n';
const java = `package org.opm.localruntime.api.generated;

// 由 scripts/generate-draft-save-contract.mjs 生成，请勿手改。
public final class DraftSaveContract {
    private DraftSaveContract() { }

    private static final com.fasterxml.jackson.databind.ObjectMapper MAPPER = com.fasterxml.jackson.databind.json.JsonMapper.builder()
        .enable(com.fasterxml.jackson.core.StreamReadFeature.STRICT_DUPLICATE_DETECTION)
        .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
        .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_MISSING_CREATOR_PROPERTIES)
        .enable(com.fasterxml.jackson.databind.DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
        .disable(com.fasterxml.jackson.databind.DeserializationFeature.ACCEPT_FLOAT_AS_INT)
        .disable(com.fasterxml.jackson.databind.MapperFeature.ALLOW_COERCION_OF_SCALARS).build();

    public static <T> T read(String json, Class<T> type) throws com.fasterxml.jackson.core.JsonProcessingException {
        T result = MAPPER.readValue(json, type);
        if (result == null) throw com.fasterxml.jackson.databind.exc.MismatchedInputException.from((com.fasterxml.jackson.core.JsonParser) null, type, "输入必须是对象");
        return result;
    }

${records.map(([name, value]) => `    public record ${name}(${Object.entries(value.properties).map(([key, field]) => `${type(field, true)} ${key}`).join(', ')}) {
        public ${name} {
${Object.entries(value.properties).map(([key, field]) => guards(key, field)).filter(Boolean).join('\n')}
        }
    }`).join('\n\n')}
}
`;

const ref = name => ({ $ref: `../schemas/opm-draft-save-v02.schema.json#/$defs/${name}` });
const response = name => ({ description: '成功', content: { 'application/json': { schema: ref(name) } } });
const errors = Object.fromEntries(['400','403','404','409','422','503'].map(status => [status, { description: '保存协议错误；错误码映射见策略设计及 HS-02G', content: { 'application/json': { schema: ref('SaveError') } } }]));
const operation = (id, request, result) => ({ operationId: id, ...(request ? { requestBody: { required: true, content: { 'application/json': { schema: ref(request) } } } } : {}), responses: { '200': response(result), ...errors } });
const prefix = '/projects/{project_id}/models/{model_id}/draft';
const parameters = ['project_id','model_id'].map(name => ({ name, in: 'path', required: true, schema: ref('Id') }));
const openapi = {
  openapi: '3.1.0', info: { title: 'OPM 草稿保存 API（Save/SaveState/Pin 已实现）', version: '0.2.0-draft' },
  servers: [{ url: 'http://127.0.0.1:17850/api/v2' }], security: [{ localSession: [] }],
  paths: {
    [`${prefix}/save`]: { parameters, post: operation('SaveDraft', 'SaveRequest', 'SaveResult') },
    [`${prefix}/pin`]: { parameters, post: operation('PinDraftRevision', 'PinRequest', 'PinResult') },
    [`${prefix}/save-state`]: { parameters, get: operation('GetDraftSaveState', null, 'SaveState') },
  },
  components: { securitySchemes: { localSession: { type: 'apiKey', in: 'header', name: 'X-OPM-Session' } } },
};
for (const [file, content] of [
  ['apps/web/src/shared/api/generated/draftSaveContract.ts', ts],
  ['services/local-runtime/src/main/java/org/opm/localruntime/api/generated/DraftSaveContract.java', java],
  ['docs/contracts/openapi/opm-draft-save-v02.json', JSON.stringify(openapi, null, 2) + '\n'],
]) {
  if (process.argv.includes('--check')) {
    if (await readFile(path.join(root, file), 'utf8') !== content) throw new Error(`生成文件过期：${file}`);
  } else await writeFile(path.join(root, file), content);
}
console.log('草稿保存协议生成检查通过');
