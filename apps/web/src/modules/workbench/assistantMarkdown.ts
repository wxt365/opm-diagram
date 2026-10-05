export type InlinePart = { kind: 'text'; text: string } | { kind: 'code'; text: string }
  | { kind: 'strong' | 'em'; children: InlinePart[] }
  | { kind: 'link'; href: string; children: InlinePart[] };
export type MarkdownBlock = { kind: 'paragraph' | 'quote'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'code'; text: string; language: string }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'table'; headers: string[]; align: Array<'left' | 'center' | 'right'>; rows: string[][] }
  | { kind: 'rule' };

// 只生成固定展示结构；原始 HTML 和未支持的语法保留为文本。
export function parseInline(text: string, depth = 0): InlinePart[] {
  if (depth >= 8) return [{ kind: 'text', text }];
  const parts: InlinePart[] = [];
  const literal = (value: string) => {
    const last = parts.at(-1);
    if (last?.kind === 'text') last.text += value; else parts.push({ kind: 'text', text: value });
  };
  while (text) {
    const escaped = text.match(/^\\([\\`*_{}[\]()#+.!|>-])/);
    if (escaped) { literal(escaped[1]!); text = text.slice(2); continue; }
    const code = text.match(/^(`+)([\s\S]*?)\1(?!`)/);
    if (code) { parts.push({ kind: 'code', text: code[2]!.replace(/\n/g, ' ') }); text = text.slice(code[0].length); continue; }
    const image = text.match(/^!\[[^\]\n]*\]\([^\n)]*\)/);
    if (image) { literal(image[0]); text = text.slice(image[0].length); continue; }
    const link = text.match(/^\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/i);
    if (link) {
      parts.push({ kind: 'link', href: link[2]!, children: parseInline(link[1]!, depth + 1) });
      text = text.slice(link[0].length); continue;
    }
    const delimiter = text.startsWith('**') ? '**' : text.startsWith('__') ? '__' : /^[*_]/.test(text) ? text[0]! : '';
    const end = delimiter ? text.indexOf(delimiter, delimiter.length) : -1;
    if (end > delimiter.length) {
      parts.push({ kind: delimiter.length === 2 ? 'strong' : 'em', children: parseInline(text.slice(delimiter.length, end), depth + 1) });
      text = text.slice(end + delimiter.length); continue;
    }
    const next = text.slice(1).search(/[\\`*_[!]/);
    const length = next < 0 ? text.length : next + 1;
    literal(text.slice(0, length)); text = text.slice(length);
  }
  return parts;
}

function tableCells(line: string): string[] {
  const cells: string[] = []; let cell = '', code = '';
  for (let i = 0; i < line.length; i++) {
    const char = line[i]!;
    if (char === '\\' && i + 1 < line.length) { cell += char + line[++i]; continue; }
    if (char === '`') {
      let ticks = char; while (line[i + 1] === '`') { ticks += '`'; i++; }
      if (!code) code = ticks; else if (code === ticks) code = '';
      cell += ticks; continue;
    }
    if (char === '|' && !code) { cells.push(cell.trim()); cell = ''; } else cell += char;
  }
  cells.push(cell.trim());
  if (!cells[0]) cells.shift();
  if (!cells.at(-1)) cells.pop();
  return cells;
}

function tableAt(lines: string[], index: number): Extract<MarkdownBlock, { kind: 'table' }> | null {
  if (!lines[index]?.includes('|') || !lines[index + 1]?.includes('-')) return null;
  const headers = tableCells(lines[index]!), separators = tableCells(lines[index + 1]!);
  if (!headers.length || headers.length !== separators.length || !separators.every(cell => /^:?-{3,}:?$/.test(cell))) return null;
  return { kind: 'table', headers, rows: [], align: separators.map(cell => cell.startsWith(':') && cell.endsWith(':') ? 'center' : cell.endsWith(':') ? 'right' : 'left') };
}

const fence = (line: string) => line.match(/^ {0,3}(`{3,}|~{3,})(.*)$/);
const heading = (line: string) => line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
const listItem = (line: string) => line.match(/^ {0,3}(?:([-+*])|([0-9]{1,9})[.)])\s+(.+)$/);
const rule = (line: string) => /^ {0,3}(?:\*\s*){3,}$/.test(line) || /^ {0,3}(?:-\s*){3,}$/.test(line) || /^ {0,3}(?:_\s*){3,}$/.test(line);
const startsBlock = (lines: string[], i: number) => fence(lines[i]!) || heading(lines[i]!) || listItem(lines[i]!) || rule(lines[i]!) || /^ {0,3}>/.test(lines[i]!) || tableAt(lines, i);

export function parseAssistantMarkdown(text: string): MarkdownBlock[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n'), blocks: MarkdownBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) { i++; continue; }
    const opening = fence(line);
    if (opening) {
      const content: string[] = [], marker = opening[1]!; i++;
      while (i < lines.length && !new RegExp(`^ {0,3}${marker[0]}{${marker.length},}\\s*$`).test(lines[i]!)) content.push(lines[i++]!);
      if (i < lines.length) i++;
      blocks.push({ kind: 'code', language: opening[2]!.trim(), text: content.join('\n') }); continue;
    }
    const table = tableAt(lines, i);
    if (table) {
      i += 2;
      while (i < lines.length && lines[i]!.trim() && lines[i]!.includes('|')) {
        const row = tableCells(lines[i++]!);
        table.rows.push(table.headers.map((_, index) => row[index] ?? ''));
      }
      blocks.push(table); continue;
    }
    const title = heading(line);
    if (title) { blocks.push({ kind: 'heading', level: title[1]!.length, text: title[2]! }); i++; continue; }
    if (rule(line)) { blocks.push({ kind: 'rule' }); i++; continue; }
    if (/^ {0,3}>/.test(line)) {
      const content: string[] = [];
      while (i < lines.length && /^ {0,3}>/.test(lines[i]!)) content.push(lines[i++]!.replace(/^ {0,3}> ?/, ''));
      blocks.push({ kind: 'quote', text: content.join('\n') }); continue;
    }
    const item = listItem(line);
    if (item) {
      const ordered = !!item[2], items: string[] = []; let next: RegExpMatchArray | null = item;
      while (next && !!next[2] === ordered) { items.push(next[3]!); i++; next = listItem(lines[i] ?? ''); }
      blocks.push({ kind: 'list', ordered, start: ordered ? Number(item[2]) : 1, items }); continue;
    }
    const content = [line]; i++;
    while (i < lines.length && lines[i]!.trim() && !startsBlock(lines, i)) content.push(lines[i++]!);
    blocks.push({ kind: 'paragraph', text: content.join('\n') });
  }
  return blocks;
}
