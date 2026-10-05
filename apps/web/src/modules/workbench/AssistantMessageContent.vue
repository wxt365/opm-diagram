<script lang="ts">
import { defineComponent, h, type VNodeChild } from 'vue';
import { parseAssistantMarkdown, parseInline, type InlinePart, type MarkdownBlock } from './assistantMarkdown';

function inline(parts: InlinePart[]): VNodeChild[] {
  return parts.map(part => {
    if (part.kind === 'text') return part.text;
    if (part.kind === 'code') return h('code', part.text);
    if (part.kind === 'link') return h('a', { href: part.href, target: '_blank', rel: 'noopener noreferrer' }, inline(part.children));
    return h(part.kind, inline(part.children));
  });
}
const content = (text: string) => inline(parseInline(text));
function block(item: MarkdownBlock): VNodeChild {
  switch (item.kind) {
    case 'heading': return h(`h${item.level}`, content(item.text));
    case 'paragraph': return h('p', content(item.text));
    case 'quote': return h('blockquote', content(item.text));
    case 'code': return h('pre', [h('code', item.text)]);
    case 'rule': return h('hr');
    case 'list': return h(item.ordered ? 'ol' : 'ul', item.ordered ? { start: item.start } : {}, item.items.map(text => h('li', content(text))));
    case 'table': return h('div', { class: 'assistant-markdown-table', tabindex: 0, role: 'region', 'aria-label': '回复表格，可横向滚动' }, [
      h('table', [
        h('thead', [h('tr', item.headers.map((text, i) => h('th', { scope: 'col', style: { textAlign: item.align[i] } }, content(text))))]),
        h('tbody', item.rows.map(row => h('tr', row.map((text, i) => h('td', { style: { textAlign: item.align[i] } }, content(text)))))),
      ]),
    ]);
  }
}

export default defineComponent({
  name: 'AssistantMessageContent',
  props: { text: { type: String, required: true } },
  setup(props) { return () => h('div', { class: 'assistant-markdown' }, parseAssistantMarkdown(props.text).map(block)); },
});
</script>

<style scoped>
.assistant-markdown { min-width: 0; margin-top: 5px; padding: 9px 10px; border-radius: 5px; background: #f7f9fc; color: inherit; line-height: 1.6; overflow-wrap: anywhere; }
.assistant-markdown :deep(p) { margin: 0 0 9px; white-space: pre-wrap; }
.assistant-markdown :deep(> :last-child) { margin-bottom: 0; }
.assistant-markdown :deep(h1), .assistant-markdown :deep(h2), .assistant-markdown :deep(h3), .assistant-markdown :deep(h4), .assistant-markdown :deep(h5), .assistant-markdown :deep(h6) { margin: 12px 0 6px; font-size: 13px; line-height: 1.5; }
.assistant-markdown :deep(> :first-child) { margin-top: 0; }
.assistant-markdown :deep(ul), .assistant-markdown :deep(ol) { padding-left: 20px; margin: 7px 0; }
.assistant-markdown :deep(li) { margin: 4px 0; }
.assistant-markdown :deep(blockquote) { margin: 8px 0; padding: 3px 9px; border-left: 3px solid #cbd9e7; color: #65758a; white-space: pre-wrap; }
.assistant-markdown :deep(code) { padding: 1px 4px; border-radius: 3px; background: #eaf0f6; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 11px; }
.assistant-markdown :deep(pre) { overflow: auto; margin: 8px 0; padding: 8px; border: 1px solid #dce5ef; border-radius: 4px; background: #edf2f7; white-space: pre; }
.assistant-markdown :deep(pre code) { padding: 0; background: transparent; }
.assistant-markdown :deep(a) { color: #0b6bcb; text-decoration: underline; }
.assistant-markdown :deep(hr) { margin: 10px 0; border: 0; border-top: 1px solid #dce5ef; }
.assistant-markdown :deep(.assistant-markdown-table) { max-width: 100%; margin: 9px 0; overflow-x: auto; border: 1px solid #d5dfeb; border-radius: 4px; }
.assistant-markdown :deep(table) { width: 100%; min-width: 320px; border-collapse: collapse; font-size: inherit; }
.assistant-markdown :deep(th), .assistant-markdown :deep(td) { min-width: 64px; padding: 6px 8px; border-right: 1px solid #dce5ef; border-bottom: 1px solid #dce5ef; vertical-align: top; white-space: normal; overflow-wrap: anywhere; }
.assistant-markdown :deep(th) { background: #eaf0f6; font-weight: 600; }
.assistant-markdown :deep(tbody tr:nth-child(even)) { background: #f0f4f9; }
.assistant-markdown :deep(tr > :last-child) { border-right: 0; }
.assistant-markdown :deep(tbody tr:last-child td) { border-bottom: 0; }
.assistant-markdown :deep(.assistant-markdown-table:focus-visible), .assistant-markdown :deep(a:focus-visible) { outline: 2px solid #0b6bcb; outline-offset: 2px; }
</style>
