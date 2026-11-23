import { orderedChildren, type layoutMindmap, type MindmapTree, type MindmapTreeNode } from './mindmapTree';
import { mindmapNodeAppearance } from './mindmapAppearance';

/** 导入标题和列表的层级，正文作为节点说明。 */
export function markdownBranch(source: string, parentId: string, startOrder: number, maxNodes: number, newId: () => string) {
  const nodes: MindmapTreeNode[] = [];
  const headings: { level: number; node: MindmapTreeNode }[] = [];
  const items: { indent: number; node: MindmapTreeNode }[] = [];
  const orders = new Map([[parentId, startOrder]]);
  let fence = '', current: MindmapTreeNode | undefined;
  let openingText = '';
  function append(label: string, parent = parentId) {
    if (nodes.length >= maxNodes) throw new Error('导入后脑图最多支持 300 个节点。');
    if (label.length > 256) throw new Error('Markdown 节点标题超过 256 字。');
    const order = orders.get(parent) ?? 0;
    orders.set(parent, order + 1);
    const node = { id: newId(), parent_id: parent, order, label, note: '', collapsed: false };
    nodes.push(node);
    current = node;
    if (openingText) { node.note = openingText; openingText = ''; }
    return node;
  }
  for (const raw of source.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = raw.replace(/^\s+/, prefix => prefix.replace(/\t/g, '    ')), content = line.trim();
    const marker = content.match(/^(`{3,}|~{3,})/)?.[1];
    const heading = !fence && line.match(/^ {0,3}(#{1,6})\s+(.+?)\s*#*$/);
    const item = !fence && line.match(/^( *)(?:[-+*]|\d+[.)])\s+(.+)$/);
    if (!fence && marker) fence = marker;
    else if (fence && marker && marker[0] === fence[0] && marker.length >= fence.length && marker === content) fence = '';
    else if (heading) {
      const level = heading[1]!.length;
      while (headings.at(-1) && headings.at(-1)!.level >= level) headings.pop();
      headings.push({ level, node: append(heading[2]!.trim(), headings.at(-1)?.node.id) });
      items.length = 0;
      continue;
    } else if (item) {
      const indent = item[1]!.length;
      while (items.at(-1) && items.at(-1)!.indent >= indent) items.pop();
      items.push({ indent, node: append(item[2]!.trim(), items.at(-1)?.node.id ?? headings.at(-1)?.node.id) });
      continue;
    }
    if (!content) continue;
    const note = [current?.note ?? openingText, content].filter(Boolean).join('\n');
    if (note.length > 4000) throw new Error('Markdown 节点说明超过 4000 字。');
    if (current) current.note = note;
    else openingText = note;
  }
  if (!nodes.length) throw new Error('Markdown 中未找到标题或列表项。');
  return nodes;
}

export async function importMarkdownFile(file: File, document: MindmapTree, parentId: string, newId: () => string) {
  if (file.size > 262144) throw new Error('Markdown 文件超过 256 KiB。');
  const startOrder = document.nodes.filter(node => node.parent_id === parentId).length;
  return markdownBranch(await file.text(), parentId, startOrder, 300 - document.nodes.length, newId);
}

export function appendMindmapBranch<T extends MindmapTreeNode>(document: MindmapTree<T>, parentId: string, nodes: T[]) {
  const children = orderedChildren(document.nodes, parentId);
  children.forEach((node, order) => { node.order = order; });
  document.nodes.find(node => node.id === parentId)!.collapsed = false;
  document.nodes.push(...nodes);
}

export interface MindmapImageEdge { path: string; x?: number; y?: number; label?: string }

const escapeXml = (value: string) => value.replace(/[<>&"']/g, char => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[char]!);
export function mindmapImage(layout: ReturnType<typeof layoutMindmap>, edges: MindmapImageEdge[], relations: MindmapImageEdge[], width: number, height: number, depths: ReadonlyMap<string, number>) {
  const paths = edges.map(edge => `<path d="${edge.path}" stroke="#9bb0c3" stroke-width="2" fill="none"/>`);
  const associations = relations.map(edge => `<path d="${edge.path}" stroke="#7956a5" stroke-width="2" stroke-dasharray="6 4" fill="none"/>`);
  const labels = relations.map(edge => `<text x="${edge.x}" y="${edge.y}" text-anchor="middle" stroke="#f8fafc" stroke-width="4" paint-order="stroke" fill="#644281">${escapeXml(edge.label ?? '')}</text>`);
  const nodes = layout.map(({ node, x, y, width, height }) => {
    const { fill, border, text, size, weight } = mindmapNodeAppearance(depths.get(node.id) ?? 2);
    const label = escapeXml(node.label);
    return `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="7" fill="${fill}" stroke="${border}"/><clipPath id="text-${x}-${y}"><rect x="${x + 8}" y="${y + 4}" width="${width - 16}" height="${height - 8}"/></clipPath><text x="${x + 10}" y="${y + height / 2}" dominant-baseline="central" fill="${text}" font-size="${size}" font-weight="${weight}" clip-path="url(#text-${x}-${y})"><title>${label}</title>${label}</text></g>`;
  });
  return new Blob([`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="sans-serif" font-size="13" fill="#304b62"><rect width="100%" height="100%" fill="#f8fafc"/>${paths.join('')}${associations.join('')}${nodes.join('')}${labels.join('')}</svg>`], { type: 'image/svg+xml;charset=utf-8' });
}

export async function mindmapPng(svg: Blob, width: number, height: number) {
  const url = URL.createObjectURL(svg);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas'), scale = Math.min(2, 4096 / Math.max(width, height));
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('无法创建导出画布。');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('生成 PNG 失败。')), 'image/png');
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}
