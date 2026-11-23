const maxArchiveBytes = 32 * 1024 * 1024;
const maxContentBytes = 4 * 1024 * 1024;
const invalidArchive = 'XMind 文件的压缩包不完整或格式不受支持。';
const contentTooLarge = 'XMind 主题正文解压后超过 4 MiB。';

interface ZipEntry { offset: number; method: number; flags: number; compressed: number; size: number; crc: number }

function findContents(view: DataView) {
  if (view.byteLength < 22) throw new Error(invalidArchive);
  const end = view.byteLength - 22;
  let footer = end;
  while (footer >= Math.max(0, end - 65535)) {
    if (view.getUint32(footer, true) === 0x06054b50 && footer + 22 + view.getUint16(footer + 20, true) === view.byteLength) break;
    footer--;
  }
  if (footer < Math.max(0, end - 65535) || view.getUint32(footer + 4, true) !== 0) throw new Error(invalidArchive);
  const count = view.getUint16(footer + 10, true);
  const start = view.getUint32(footer + 16, true);
  const stop = start + view.getUint32(footer + 12, true);
  if (count !== view.getUint16(footer + 8, true) || stop > footer) throw new Error(invalidArchive);

  const contents = new Map<string, ZipEntry>();
  const decoder = new TextDecoder();
  let position = start;
  for (let index = 0; index < count; index++) {
    if (position + 46 > stop || view.getUint32(position, true) !== 0x02014b50) throw new Error(invalidArchive);
    const length = view.getUint16(position + 28, true);
    const next = position + 46 + length + view.getUint16(position + 30, true) + view.getUint16(position + 32, true);
    if (next > stop) throw new Error(invalidArchive);
    const name = decoder.decode(new Uint8Array(view.buffer, position + 46, length)).replace(/^\//, '');
    if (name === 'content.json' || name === 'content.xml') {
      if (contents.has(name)) throw new Error(invalidArchive);
      contents.set(name, {
        flags: view.getUint16(position + 8, true), method: view.getUint16(position + 10, true),
        crc: view.getUint32(position + 16, true), compressed: view.getUint32(position + 20, true),
        size: view.getUint32(position + 24, true), offset: view.getUint32(position + 42, true),
      });
    }
    position = next;
  }
  const name = contents.has('content.json') ? 'content.json' : 'content.xml';
  const entry = contents.get(name);
  if (!entry) throw new Error('XMind 文件里找不到主题正文。');
  return { entry, name, directoryOffset: start };
}

async function inflate(bytes: ArrayBuffer, size: number) {
  const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader();
  const result = new Uint8Array(size);
  let written = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (written + value.length > result.length) {
        await reader.cancel();
        throw new Error(invalidArchive);
      }
      result.set(value, written);
      written += value.length;
    }
  } finally { reader.releaseLock(); }
  if (written !== size) throw new Error(invalidArchive);
  return result;
}

function checksum(bytes: Uint8Array) {
  const table = Array.from({ length: 256 }, (_, value) => {
    for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ (value & 1 ? 0xedb88320 : 0);
    return value;
  });
  let crc = -1;
  for (const byte of bytes) crc = (crc >>> 8) ^ table[(crc ^ byte) & 255]!;
  return (crc ^ -1) >>> 0;
}

/** 写入存储模式的 ZIP 文件，三项正文均由脑图生成。 */
export function xmindArchive(files: Record<'content.json' | 'metadata.json' | 'manifest.json', string>) {
  const encoder = new TextEncoder();
  const records: BlobPart[] = [], directory: BlobPart[] = [];
  let offset = 0, directorySize = 0;
  for (const [name, content] of Object.entries(files)) {
    const filename = encoder.encode(name), data = encoder.encode(content), crc = checksum(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint16(12, 33, true); // ZIP 日期下限为 1980-01-01。
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, filename.length, true);
    records.push(local.buffer, filename, data);

    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 20, true);
    central.setUint16(6, 20, true);
    central.setUint16(14, 33, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, filename.length, true);
    central.setUint32(42, offset, true);
    directory.push(central.buffer, filename);
    offset += local.byteLength + filename.length + data.length;
    directorySize += central.byteLength + filename.length;
  }
  const entries = Object.keys(files).length;
  const footer = new DataView(new ArrayBuffer(22));
  footer.setUint32(0, 0x06054b50, true);
  footer.setUint16(8, entries, true);
  footer.setUint16(10, entries, true);
  footer.setUint32(12, directorySize, true);
  footer.setUint32(16, offset, true);
  return new Blob([...records, ...directory, footer.buffer], { type: 'application/zip' });
}

export async function readXmindContent(file: Pick<File, 'size' | 'arrayBuffer'>) {
  if (file.size > maxArchiveBytes) throw new Error('XMind 文件超过 32 MiB。');
  const buffer = await file.arrayBuffer();
  const view = new DataView(buffer);
  const { entry, name, directoryOffset } = findContents(view);
  if (entry.size > maxContentBytes) throw new Error(contentTooLarge);
  const { offset, method, compressed, size } = entry;
  if (offset + 30 > directoryOffset || view.getUint32(offset, true) !== 0x04034b50 ||
    entry.flags & 1 || view.getUint16(offset + 6, true) & 1 || view.getUint16(offset + 8, true) !== method)
    throw new Error(invalidArchive);
  const payload = offset + 30 + view.getUint16(offset + 26, true) + view.getUint16(offset + 28, true);
  if (payload + compressed > directoryOffset || (method !== 0 && method !== 8)) throw new Error(invalidArchive);
  if (method === 8 && typeof DecompressionStream === 'undefined') throw new Error('当前浏览器无法解压 XMind 文件，请使用较新的浏览器。');
  const bytes = method === 0 ? new Uint8Array(buffer, payload, compressed) : await inflate(buffer.slice(payload, payload + compressed), size);
  if (bytes.length !== size || checksum(bytes) !== entry.crc) throw new Error(invalidArchive);
  return { format: name === 'content.json' ? 'json' as const : 'xml' as const, text: new TextDecoder().decode(bytes) };
}
