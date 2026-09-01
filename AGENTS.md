## 1. 规则入口

本文件只保存仓库级硬规则，始终生效。运行任务时按需读取：

- `.harness/repo-profile.md`：当前仓库事实、命令和边界
- 当前任务规格文档：本次目标、范围、验收和回滚
- `.harness/task-types/*.md`：变更任务类型的附加规则
- `.harness/playbooks/*/PLAYBOOK.md`：本次启用的技术规则
- `.harness`：在没有明确说明时不要该文件夹或下面的文件中增加内容。

`README.md`、`.harness/docs/**`、模板和未启用的 playbook 默认不读。规则冲突时依次以本文件、当前任务规格文档、`repo-profile` 为准；Task Type 和 playbook 只能增加约束。

## 2. Work Mode 与风险

每个任务先声明 `Work Mode`：

- `read-only`：分析、评审、调研、解释或状态查询。禁止写文件，不要求 Task Type、Spec 或 Checklist；核对证据后直接输出结论。
- `change`：会修改文件。必须声明 `Risk Level`、1 个 Task Type 和 `Active Playbooks`，再进入变更流程。

`Risk Level`：

- `L1`：局部文档或低风险小改动，不影响公共契约、schema、依赖、安全或发布
- `L2`：常规模块变更，需要回归验证
- `L3`：公共 API、schema、数据迁移、安全权限、跨模块契约或高风险发布变更

变更任务的 Task Type 仅限 `bugfix / feature / refactor`。数据库迁移不是 Task Type，必须追加 `db-migration` playbook。每次指定 1 个 primary playbook；无匹配项时使用 `none (primary)`。Active Playbooks 原则上不超过 3 个，超过时必须说明不可拆分原因。

## 3. 变更流程

`spec -> plan/checklist -> build -> verify -> summary`

- `L1` 可在 Plan 中写 Lean Spec；`L2/L3` 必须有独立任务规格文档。
- Spec 至少包含目标、非目标、允许/禁止范围、契约影响、验收、验证和回滚。
- Plan 只写实现决策、顺序和不确定项，不复述 Spec。
- Checklist 只引用 Spec 路径、验收项 ID 和边界确认结果，不复制 Spec 正文；L1 内联 Spec 使用 `Plan#Lean Spec` 作为引用。
- 未完成边界确认不得 Build；未验证不得结束。

## 4. 修改边界

变更前必须明确允许与禁止目录，以及是否允许修改 API、schema、配置、依赖、文档和测试。未明确允许时，默认禁止：

- 修改公共 API 或数据库 schema
- 引入新依赖
- 大范围重构、格式化或命名迁移
- 修改任务范围外的文件

修改前先读相关实现并检查复用点。表现层不得直接访问持久层，控制层不得承载核心业务规则，公共模块不得依赖业务私有模块。多种合理解释并存时，必须说明假设和取舍。

## 5. 实现与验证

- 只做实现目标所需的最小修改，不顺手修复无关问题。
- 保持现有代码风格、错误处理、日志和外部行为；只清理由本次修改产生的废代码。
- 优先执行自动化验证，先定向后按风险扩大。无法自动化时，提供可执行的手工步骤和观察点。
- 不得把设计、静态检查或未执行的命令表述为运行验证通过。
- 接口、配置、模块职责、运行方式或测试策略变化时同步文档。

## 6. 用户可见 Summary

执行元数据只留在 Spec/Checklist，不默认输出。

- `read-only`：结论 + 必要证据 + 不确定项（有则）
- `change`：完成 + 验证；有风险时补风险

L1/L2 只列关键文件或目录；L3 或用户要求时列完整清单。验证必须写实际结果，存在未执行项时说明原因。Task Type/playbook 特有证据并入上述内容；事实与假设分开，不生成空章节或重复 Spec。默认 L1 不超过 4 条、L2 不超过 8 条，深入说明除外。

## 7. Failure 回流

越界、规则误用、漏验、误解 Spec 返工、同根因重复或模板缺口时，记录到 `.harness/docs/agent-failures.md`；一次性已修正问题不记录。可复现问题关联 Eval；长期规则注明 Failure、Eval 或外部要求来源。
