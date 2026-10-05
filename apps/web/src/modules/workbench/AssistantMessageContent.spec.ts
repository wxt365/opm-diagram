import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import AssistantMessageContent from './AssistantMessageContent.vue';

describe('助手 Markdown 展示', () => {
  it('三列表格有表头和行列，支持对齐、缺省单元格、转义竖线和代码竖线', () => {
    const w = mount(AssistantMessageContent, { props: { text: '| 方案 | 做法 | 适用 |\n| :--- | :---: | ---: |\n| A | **保留**\\|对象 | `a|b` |\n| B | 改名 |' } });
    expect(w.findAll('th').map(cell => cell.text())).toEqual(['方案', '做法', '适用']);
    expect(w.findAll('tbody tr')).toHaveLength(2);
    expect(w.findAll('tbody tr')[0]!.findAll('td').map(cell => cell.text())).toEqual(['A', '保留|对象', 'a|b']);
    expect(w.findAll('tbody tr')[1]!.findAll('td').map(cell => cell.text())).toEqual(['B', '改名', '']);
    expect(w.findAll('th')[1]!.attributes('style')).toContain('center');
    expect(w.findAll('th')[2]!.attributes('style')).toContain('right');
    expect(w.get('[role="region"]').attributes('tabindex')).toBe('0'); w.unmount();
  });
  it('段落后的无外框竖线表格可渲染，无效分隔行保留原文', () => {
    const text = '说明\n\n方案 | 做法\n--- | ---\nA | 状态变化\n\n| 名称 | 说明 |\n| -- | -- |';
    const w = mount(AssistantMessageContent, { props: { text } });
    expect(w.findAll('table')).toHaveLength(1); expect(w.get('tbody td').text()).toBe('A');
    expect(w.findAll('p').at(-1)!.text()).toContain('| -- | -- |'); w.unmount();
  });
  it('标题、列表、引用、强调、行内代码和普通换行有对应显示结构', () => {
    const text = '## 处理建议\n\n第一行\n第二行\n\n- **同一对象**\n- *不同库存*\n\n3. 保留`咖啡豆`\n4. 建立烘焙过程\n\n> 业务含义需要确认\n\n---';
    const w = mount(AssistantMessageContent, { props: { text } });
    expect(w.get('h2').text()).toBe('处理建议'); expect(w.get('p').text()).toBe('第一行\n第二行');
    expect(w.get('ul strong').text()).toBe('同一对象'); expect(w.get('ul em').text()).toBe('不同库存');
    expect(w.get('ol').attributes('start')).toBe('3'); expect(w.get('ol code').text()).toBe('咖啡豆');
    expect(w.get('blockquote').text()).toBe('业务含义需要确认'); expect(w.find('hr').exists()).toBe(true); w.unmount();
  });
  it('围栏代码和未完成代码不解析成表格或执行 HTML', () => {
    const source = '| 名称 | 含义 |\n| --- | --- |\n| **对象** | <script>window.test=1</script> |';
    for (const text of ['```text\n' + source + '\n```', '~~~\n' + source]) {
      const w = mount(AssistantMessageContent, { props: { text } });
      expect(w.get('pre code').text()).toBe(source); expect(w.find('table').exists()).toBe(false);
      expect(w.find('script').exists()).toBe(false); expect(w.find('strong').exists()).toBe(false); w.unmount();
    }
  });
  it('原始 HTML、图片和危险链接保留文本，外部链接只允许 HTTP(S)', () => {
    const w = mount(AssistantMessageContent, { props: { text: '<img src=x onerror="alert(1)">\n\n[执行](javascript:alert(1))\n![远程图片](https://example.com/image.png)\n\n[规范](https://example.com/standard)' } });
    expect(w.find('img').exists()).toBe(false); expect(w.find('script').exists()).toBe(false); expect(w.findAll('a')).toHaveLength(1);
    expect(w.get('a').attributes('href')).toBe('https://example.com/standard');
    expect(w.get('a').attributes('rel')).toBe('noopener noreferrer');
    expect(w.text()).toContain('<img src=x onerror="alert(1)">');
    expect(w.text()).toContain('[执行](javascript:alert(1))'); w.unmount();
  });
  it('空文本和未完成强调或链接不会丢失原文', () => {
    const w = mount(AssistantMessageContent, { props: { text: '**未完成 [链接' } });
    expect(w.text()).toBe('**未完成 [链接'); expect(w.find('strong').exists()).toBe(false); w.unmount();
    const empty = mount(AssistantMessageContent, { props: { text: '' } }); expect(empty.text()).toBe(''); empty.unmount();
  });
});
