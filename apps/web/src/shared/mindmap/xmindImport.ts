import { readXmindContent } from './xmindArchive';
import type { MindmapTree, MindmapTreeNode } from './mindmapTree';

interface Topic<T> { title: string; note: string; children: T[] }
interface XmindRow { label: string; note: string; parent: number | null; order: number; depth: number }
export interface XmindSheet { title: string; rows: XmindRow[]; error: string }
const maxNodes = 300;

function sheet<T>(title: string, root: T, readTopic: (topic: T) => Topic<T>): XmindSheet {
  const rows: XmindRow[] = [];
  let error = '';
  function visit(topic: T, parent: number | null, order: number, depth: number) {
    if (rows.length > maxNodes) return;
    const { title: label, note, children } = readTopic(topic);
    if (!label || label.length > 256 || note.length > 4000) error ||= '主题需要填写名称，名称最多 256 字，备注最多 4000 字。';
    const index = rows.length;
    rows.push({ label, note, parent, order, depth });
    for (let position = 0; position < children.length && rows.length <= maxNodes; position++) {
      visit(children[position]!, index, position, depth + 1);
    }
  }
  visit(root, null, 0, 0);
  if (rows.length > maxNodes) error = '这张工作表超过 300 个主题。';
  return { title, rows, error };
}

function field(value: unknown, key: string): unknown {
  return value && typeof value === 'object' && Object.hasOwn(value, key) ? (value as Record<string, unknown>)[key] : undefined;
}
const trimmed = (value: unknown) => typeof value === 'string' ? value.trim() : '';

export function parseXmindSheets(format: 'json' | 'xml', text: string): XmindSheet[] {
  if (format === 'json') {
    let contents: unknown;
    try { contents = JSON.parse(text); } catch { throw new Error('XMind 主题 JSON 无法读取。'); }
    if (!Array.isArray(contents) || !contents.length) throw new Error('XMind 文件里没有工作表。');
    return contents.map((item, index) => sheet(trimmed(field(item, 'title')) || `工作表 ${index + 1}`, field(item, 'rootTopic'), topic => {
      const children = field(field(topic, 'children'), 'attached');
      return {
        title: trimmed(field(topic, 'title')),
        note: trimmed(field(field(field(topic, 'notes'), 'plain'), 'content')),
        children: Array.isArray(children) ? children : [],
      };
    }));
  }

  if (/<!DOCTYPE/i.test(text)) throw new Error('XMind 主题 XML 包含不支持的文档类型。');
  const xml = new DOMParser().parseFromString(text, 'application/xml');
  if (xml.documentElement.localName !== 'xmap-content') throw new Error('XMind 主题 XML 无法读取。');
  const namedChildren = (element: Element | undefined, name: string) => Array.from(element?.children ?? []).filter(child => child.localName === name);
  const firstChild = (element: Element | undefined, name: string) => namedChildren(element, name)[0];
  const worksheets = namedChildren(xml.documentElement, 'sheet');
  if (!worksheets.length) throw new Error('XMind 文件里没有工作表。');
  return worksheets.map((item, index) => sheet(trimmed(firstChild(item, 'title')?.textContent) || `工作表 ${index + 1}`, firstChild(item, 'topic'), topic => ({
    title: trimmed(firstChild(topic, 'title')?.textContent),
    note: trimmed(firstChild(firstChild(topic, 'notes'), 'plain')?.textContent),
    children: namedChildren(firstChild(topic, 'children'), 'topics')
      .filter(group => !group.hasAttribute('type') || group.getAttribute('type') === 'attached')
      .flatMap(group => namedChildren(group, 'topic')),
  })));
}

export async function readXmindSheets(file: File) {
  const { format, text } = await readXmindContent(file);
  return parseXmindSheets(format, text);
}

export function xmindBranch(source: XmindSheet, document: MindmapTree, parentId: string, newId: () => string): MindmapTreeNode[] {
  if (source.error) throw new Error(source.error);
  if (document.nodes.length + source.rows.length > maxNodes) throw new Error('导入后脑图最多支持 300 个节点。');
  if (!document.nodes.some(node => node.id === parentId)) throw new Error('导入目标已不存在，请重新选择节点。');
  const startOrder = document.nodes.filter(node => node.parent_id === parentId).length;
  const ids = source.rows.map(() => newId());
  return source.rows.map((row, index) => ({
    id: ids[index]!, parent_id: row.parent === null ? parentId : ids[row.parent]!,
    order: row.parent === null ? startOrder : row.order,
    label: row.label, note: row.note, collapsed: false,
  }));
}
