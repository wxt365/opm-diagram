const phrases: Record<string, string> = {
  "relates to": "关联于", "consists of": "由以下部分组成：", "is an instance of": "是以下类型的实例：",
  "is a kind of": "是以下类型的一种：", "is equivalent to": "等价于",
  "is skipped": "被跳过", "in any state": "在任意状态下", "in which case": "此时",
  "occurs if there is": "在存在以下条件时发生：", "occurs if": "在满足以下条件时发生：",
  invokes: "调用", requires: "需要", yields: "产生", consumes: "消耗", affects: "影响",
  handles: "处理", exhibits: "具有", changes: "改变", initiates: "触发", enables: "使能",
  from: "从", to: "到", which: "该过程", otherwise: "否则", else: "否则",
};

/** 仅转换显示语法，保护模型名称和用户关系标签；原始 OPL 不变。 */
export function oplChineseDisplay(text: string, names: string[] = []): string {
  const protectedNames = new Set(names.filter(Boolean));
  const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [...protectedNames].sort((a, b) => b.length - a.length).map(escape);
  const grammar = Object.keys(phrases).sort((a, b) => b.length - a.length).map(value => `\\b${escape(value)}\\b`);
  const translated = text.replace(new RegExp([...patterns, ...grammar].join("|"), "g"), value => protectedNames.has(value) ? value : phrases[value] ?? value);
  return translated.endsWith(".") ? translated.slice(0, -1) + "。" : translated;
}
