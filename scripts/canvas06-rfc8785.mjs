import { createHash } from 'node:crypto';

export function canonicalizeJcs(value) {
  return serialize(value, new Set());
}

export function sha256Jcs(value) {
  return createHash('sha256').update(canonicalizeJcs(value), 'utf8').digest('hex');
}

function serialize(value, ancestors) {
  if (value === null || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'string') return quote(value);
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) invalid('数字必须是安全整数。');
    return String(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) invalid('不允许循环引用。');
    ancestors.add(value);
    try { return `[${value.map(item => serialize(item, ancestors)).join(',')}]`; } finally { ancestors.delete(value); }
  }
  if (typeof value === 'object') {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) invalid('对象必须是普通 JSON 对象。');
    if (ancestors.has(value)) invalid('不允许循环引用。');
    ancestors.add(value);
    try {
      return `{${Object.keys(value).sort(compareUtf16).map(key => `${quote(key)}:${serialize(value[key], ancestors)}`).join(',')}}`;
    } finally { ancestors.delete(value); }
  }
  invalid('值域只允许 JSON 标量、数组或对象。');
}

function quote(value) {
  assertUnicodeScalars(value);
  return JSON.stringify(value);
}

function compareUtf16(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertUnicodeScalars(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) invalid('字符串包含孤立高代理项。');
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) invalid('字符串包含孤立高代理项。');
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) invalid('字符串包含孤立低代理项。');
  }
}

function invalid(message) {
  throw new TypeError(`RFC8785 JCS 输入无效：${message}`);
}
