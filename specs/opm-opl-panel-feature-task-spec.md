# OPL 规范复核、语句定位与导出

Work Mode: change；Risk Level: L2；Task Type: feature；Active Playbooks: frontend-vue (primary), testing。

## Spec

目标：以本仓库 ISO 19450:2024 参考原文及绑定的 OPL grammar 核对当前实际生成结果；点击 OPL 行同时高亮对应关系、对象/过程/属性/状态；导出当前 OPD 的 OPL 文本。
非目标：本轮不改变语言 profile、OPL 公共输出契约或承诺全标准认证，不实现 OPL 导入/解析、全部模型跨图合并导出，不修复前轮重复所属连线。
允许：工作台 store 的视图定位状态、画布与节点/关系渲染接入、OPL 面板及局部样式、对应测试和独立 E2E、规范复核记录与本规格。允许读取后端生成器、grammar、黄金样例及运行定向后端回归。禁止：API/schema/持久数据/依赖/配置/后端生成器改动、.harness、原案例数据、无关重构。
契约影响：仅内部视图属性和本地 UTF-8 .opl.txt 下载，现有 relation 主选择和属性查看保留；语句定位不属于可编辑节点多选，不触发布局/保存命令。

- A1：检查实际客户与 PROC/CTRL/STRUCT/NEG 模型当前各 OPD 的语句、trace、生成器与规范相关章节，逐项记录通过项与缺口，区分关系句符合与完整 OPD 文本符合。
- A2：点击语句高亮所有对应关系及 trace occurrence 对应节点；状态语句包括状态与所属元素，特征语句包含属性。切换语句、改选画布、空白取消、切图/修订清除旧定位；不可见特征展开；只读可定位；不影响编辑多选与对齐功能。
- A3：面板提供导出当前 OPD OPL 的按钮，文件名包含模型/OPD，中文 UTF-8，一句一行，顺序及文字与当前面板一致；空态/加载不可导出，失败可见，无额外保存或写请求。
- A4：定向组件/渲染/store 验证、OPL 后端既有回归、实际浏览器语句点击及恢复、只读/切图/窄屏和下载内容验证；typecheck/lint/diff通过。

验证：后端 OPL 生成回归；前端定向 Vitest；Playwright 读取现有案例并在隔离测试模型实际创建关系、验证完整语义高亮与文件内容。回滚：撤销本轮内部视图/下载及测试文档增量，无迁移。

## Plan

1. 从规范原文、绑定 grammar 与实际运行投影核对语句及 trace，保存具体边界。
2. 添加独立于节点编辑多选的语句定位状态，以 occurrence 映射高亮节点，关系主选择沿用现有能力；画布更换选择清理定位。
3. 面板添加当前文本下载与空态/失败状态；使用已有下载方式与局部样式。
4. 执行定向和实际浏览器回归，核验下载与无写入，记录验收。

## Checklist

引用：specs/opm-opl-panel-feature-task-spec.md；边界已确认，禁止公共契约/持久数据/语言 profile 变更。
- [x] A1
- [x] A2
- [x] A3
- [x] A4

## 验收记录

- A1：已读取本地五个模型七个 OPD，52 句/52 trace，引用 occurrence 均在当前图中；与 ISO 原文和当前生成器/grammar 对照。确认异常句和部分状态条件句差异、缺少状态说明及富文本区分，未将当前输出判为全标准符合。细节、规范章节与全部实际语句见 `docs/design/opm-opl-review-record.md`；原始快照 `/private/tmp/opm-opl-audit.json`。
- A2：真实浏览器逐句验证全部 52 句对应节点/所属元素与关系各分支；属性临时展开、减号收起、切图清除、另选/空白恢复、历史只读定位均通过。定位独立于编辑节点多选；既有案例流程编辑/保存/固定版本写请求 0、pageerror 0。
- A3：现有四个含关系句 OPD 及历史只读/窄屏、新建模型文件下载通过；UTF-8 内容及顺序逐字等于面板。一句一行，文件名包含模型/OPD，空态/加载禁用、失败重试组件测试通过。
- A4：前端定向测试分批 118 项通过（WorkbenchView 90、OpdCanvas 25、WorkbenchBottomPanel 3），后端既有 OPL 生成/多 Context 170 项通过；两个实际 E2E 场景通过。typecheck/lint/diff通过。隔离新建测试模型已移入回收站，原案例无编辑命令。
- 日志：`/private/tmp/opm-opl-unit.log`、`/private/tmp/opm-opl-canvas-tests.log`、`/private/tmp/opm-opl-backend-tests.log`、`/private/tmp/opm-opl-e2e.log`、`/private/tmp/opm-opl-typecheck.log`、`/private/tmp/opm-opl-lint.log`。
- 已查看 `/private/tmp/opm-opl-e2e/` 对应场景下的 `attribute-highlight-desktop.png`、`state-highlight-readonly.png`、`opl-mobile.png`；高亮与导出按钮清晰，窄屏无按钮溢出；保存的 .opl.txt 文件内容已自动比对。
