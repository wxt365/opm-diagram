# 根 OPD 显示模型名称

Work Mode: change；Risk Level: L1；Task Type: bugfix；Active Playbooks: frontend-vue (primary), testing。

## Plan

### Lean Spec

目标：根SYSTEM_DIAGRAM在OPD导航显示当前模型名称，悬停显示完整名称及SD根图标识；长名称沿用省略样式，＋提示使用同一名称。子图及其他视图保留原名称。
原因与证据：用户截图只有SD；WorkbenchView直接输出context.label，导航数据根节点label默认为SD，顶部已有store.modelName。原回归显式要求SD，未覆盖用户辨认模型名称的需求。
允许：WorkbenchView局部展示、既有组件和导航端到端用例、页面说明与本规格。禁止：API/schema、持久数据、store业务、依赖/配置、.harness及无关文件。公共契约无变化。
验收A1：根名称与模型一致，title含完整名称和SD，＋可访问提示一致；子图名不改变。
验收A2：桌面/窄屏无横向溢出，三级导航、返回根、历史只读正常；组件回归、typecheck/lint/diff通过。
验证：更新原有测试断言，运行实际浏览器导航用例并查看截图。回滚：仅回退本轮展示与测试/说明增量，无数据迁移。

实现顺序：派生导航展示列表；更新现有验收断言；真实浏览器验证长名称及只读路径。

## Checklist

引用：Plan#Lean Spec；允许/禁止边界已确认。
- [x] A1
- [x] A2

## 实际验证

2026-10-03：WorkbenchView既有89项测试通过；typecheck、lint和git diff --check通过。实际Playwright三级OPD导航用例通过，验证长模型名称、完整title、＋提示、创建子图、返回根图和历史只读；1440×1000桌面与390×844窄屏截图已检查，名称省略且按钮未溢出。测试模型已移入回收站。截图目录 `/private/tmp/opm-root-name-e2e`；日志 `/private/tmp/opm-root-name-{unit,typecheck,lint,e2e}.log`。
