# P03 生成/消耗组合工具 Checklist

规格：[opm-p03-combined-transformation-tool-task-spec.md](../../specs/opm-p03-combined-transformation-tool-task-spec.md)。

## Plan

先集中封装组合工具识别与 Runtime 候选匹配，再接入 Palette/Store；复用现有提交前复核和渲染。最后扩展定向单测，运行现有双向连线真实回归。

- [x] 边界确认：仅 UI 层聚合，Runtime 语义及持久化不变，当前目录开发。
- [x] CT-01：组合入口数量、双语提示与 Runtime 原能力计数由 WorkbenchView 回归验证。
- [x] CT-02：双向候选、乱序返回、原样 payload 和提交前第二次 query 均通过。
- [x] CT-03：禁用/缺失/未知 Symbol 成员、反向候选、空候选、过期、同类节点及只读均通过；另一可用方向不受阻断。
- [x] CT-04：独立 Chromium 用例两次点击同一按钮，分别观测 CREATE_FACT 001/002；两条闭合箭头路径不同，consumes/yields 文本正确，重开后路径与文本一致。已查看截图。
- [x] CT-05：Web 126/126 单测、lint、build（含 vue-tsc）和 `git diff --check` 通过。受影响 Playwright 17/17，加新增组合工具专项 1/1 通过。

2026-09-11 实际验证：

- `npm run test --workspace=@opm/web`
- `npm run lint --workspace=@opm/web`
- `npm run build --workspace=@opm/web`
- `npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/workbench-layout.spec.ts tests/e2e/workbench-relation-gesture.spec.ts --output /private/tmp/opm-combined-transformation-results`
- `npx playwright test --config tests/e2e/playwright.config.ts tests/e2e/workbench-layout.spec.ts --grep '生成消耗共用一个工具' --output /private/tmp/opm-combined-transformation-focused-results`

测试使用独立 Runtime/前端服务及临时模型。截图在上述 focused output 下的 `combined-transformation.png`。构建保留既有 Bootstrap 不参与 Vite 打包的提示；本轮无 API/数据库/标准能力合并，不构成发布或 ISO 符合性证明。
