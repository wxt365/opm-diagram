# 当前 OPL 规范复核记录（2026-10-03）

结论：当前输出是关系句投影，尚不能认定为完整、严格符合 ISO 19450:2024 的 OPL。基本过程/结构关系与事件句式按已绑定 profile 生成，当前 52 条关系句均有 trace；异常及部分状态条件句存在标准句式差异，状态声明和角色说明未生成。通过现有黄金回归不等于满足标准原文。

## 依据与范围

- 规范依据：`reference/ISO+19450-2024.pdf`。重点核对 7.3.4、7.3.5、9.1–9.5、10.2–10.3；已完整读取相关页文本并查看 PDF 页 26、27、45、47、53、58 的渲染内容。对象过程语言中文资料另属语言说明，不代替当前绑定的 ISO profile 作为符合性依据。
- 运行输入：本地项目 `project.9ae0e3dd46ae4f3a8b45520c5057ecd7` 下客户演示、PROC、CTRL、STRUCT、NEG 五个活动草稿；通过现有本地会话查询 API 读取七个 OPD 的 text/projection/navigation，未提交语义或布局命令。
- 实际快照：`/private/tmp/opm-opl-audit.json`；检查脚本：`/private/tmp/opm-opl-audit.py`。这些是本次本地证据，不作为发布资产或认证报告。
- 实现依据：`services/local-runtime/src/main/java/org/opm/localruntime/text/OplTextGenerationService.java`；绑定模板：`packages/profiles/profile.iso19450.2024.draft/0.2.0/grammar/representative-opl-grammar.json`。

## 已确认结果

| 检查项 | 实际结果 | 边界 |
|---|---|---|
| 关系句与追踪 | 52 句、52 trace；引用的 occurrence 均在各自当前 OPD 投影中 | 验证语句追踪完整性，不证明业务模型正确 |
| 消耗、生成、影响、主体、手段与其状态指定形式 | 当前基本关系句采用 consumes/yields/affects/handles/requires/changes from…to… 等对应句式 | 对照 9.1–9.4；名称为用户中文名称，不据此认定为完整英文模型 |
| 调用/自调用 | 使用 invokes 与 invokes itself | 对照 9.5.2.5 |
| 转换事件与使能事件 | 当前案例使用 initiates、initiates and handles 等句式 | 对照 9.5.2；未据此推断所有组合均合规 |
| 基本影响条件与手段条件 | 当前 C05、C06 及客户“完单登记”句分别保留影响动作或手段条件/跳过语义 | “完单登记”是 PROC-005 + CTRL-006 手段条件，不能误判为消耗条件；无动作缺失结论 |
| 标记、聚合、特征、泛化、实例化 | 当前采用用户标签、consists of、exhibits、are、is an instance of 等句式；双向标记一条关系生成两句 | 对照第 10 节；STRUCT 12 个 Fact 对应 13 句并非重复错误 |
| 当前 OPD 范围 | 客户 SD1 有 15 句，根图及 SD1.1 为 0 句；CTRL 8、PROC 16、STRUCT 13、NEG 0 | 无 Fact 的图仍可能有需文本表达的节点/状态/细化信息，0 句不等于图文语义已等价 |

## 确认的规范差异及缺口

1. **异常关系句式（3 条实际语句）**：客户与 PROC 的超时句均为 `When 打包 exceeds PT5M, 异常处置 handles the exception.`；PROC 欠时句为 `When 复核 is under PT1M, 欠时检查 handles the exception.`。第 9.5.4.2/9.5.4.3 以异常处理过程为主语，条件明确为源过程的 duration 超过最大值或不足最小值，并使用时间值与单位。现有句式及原始 ISO duration 字符串不是该规定的写法。修正示例可为 `异常处置 occurs if duration of 打包 exceeds 5 minutes.`，但正式实施需一并处理单位规范、grammar 版本绑定和黄金样例。
2. **状态指定条件句式（3 条实际语句）**：客户 `异常处置 occurs if 不合格 包裹 exists, else 异常处置 is skipped.` 和 CTRL 的 C08 采用状态前置存在条件；9.5.3.4.2 指定的第一种写法明确为 Instrument is specified-state，第二种为 If 指定状态 Instrument 的条件形式。CTRL C07 使用 `occurs if there is …, … else …`，而 9.5.3.3.2 规定 `Object is input-state` 与 `otherwise` 或另一种 If 形式。当前语义接近，严格句式仍有差异，不计为标准句式通过。
3. **状态内容未生成**：当前客户和 PROC 存在初始/最终状态，STRUCT 也有初始状态，但没有任何状态枚举或初始/默认/最终角色声明。7.3.5.2/7.3.5.4 对应的状态信息未被关系句全面覆盖，例如未在相关关系中使用的状态。孤立过程所在客户根图及 SD1.1 也无文本。7.3.4 对已连接且为默认值的泛型性质允许省略，因此不能笼统要求每个连接节点另加声明；对孤立节点应核对需要表达的性质。
4. **富文本格式缺口**：当前 API 投影只提供纯文本和 occurrence/fact 追踪，面板把整句作为普通等宽文字显示，没有区分实体/状态名称与固定词或用户标签的加粗形式。这与原文中实体、状态及标签的字体表示不同。纯文本导出本身不承载字形，须标注为 OPL 文本导出，不视为版式符合性证明。
5. **语言覆盖边界**：当前实际样例和绑定模板只覆盖 profile 支持的关系子集；对象状态内容、细化句与标准附录完整语言范围没有被本次 52 条关系句覆盖。当前结果不能用于声称全标准支持或认证。

本轮只核对并记录生成器差异；高亮与导出使用现有生成结果，不在显示层重写句子，避免面板文本与 trace、绑定 grammar 或历史修订不一致。后续生成器修正应单独处理 profile/grammar 版本和黄金资产迁移。

## 交互与导出交付

- 点击 OPL 行：按 trace occurrence 高亮对象、过程、属性、状态，并包含所属元素；关系全分支蓝色；不可见特征临时展开。定位与节点编辑多选分别维护，不启用批量布局操作。
- 改选语句/画布节点、点击空白、切图/修订或内容改变后清理旧定位；只读版本也支持定位与下载。
- 面板“导出 OPL”：导出当前 OPD、当前面板顺序的所有语句，一句一行、UTF-8，文件名为“模型 - OPD.opl.txt”。空态/加载/提交中禁用；失败可见且可重试；不修改草稿或创建修订。

## 实际验证

- 后端已有 OPL 生成与多 Context 测试：170 项通过，见 `/private/tmp/opm-opl-backend-tests.log`。该结果证明当前模板/trace 内部回归，不抵销上面的标准差异。
- 前端 WorkbenchView 90 项、OpdCanvas 25 项、WorkbenchBottomPanel 3 项，分批共 118 项通过，见 `/private/tmp/opm-opl-unit.log` 和 `/private/tmp/opm-opl-canvas-tests.log`。
- Playwright：两个场景通过，见 `/private/tmp/opm-opl-e2e.log`。逐条点击现有七个 OPD 的 52 条语句，校验 trace 对应节点/所属元素与关系各线段高亮、切图清理、空白及另选恢复、当前文本下载与只读/窄屏；实际新建对象、过程和关系后验证定位及导出，隔离测试模型移入回收站。现有案例流程观察到草稿编辑/保存/固定版本请求 0 次、页面异常 0 次。
- 已查看 `/private/tmp/opm-opl-e2e/` 中属性定位桌面、状态定位只读和 OPL 窄屏截图；下载文件逐字与面板一致。
- typecheck/lint 通过，见 `/private/tmp/opm-opl-typecheck.log`、`/private/tmp/opm-opl-lint.log`。

## 当前实际关系句清单

以下保持运行投影的顺序，供后续 grammar 修正对照，不充当标准答案。

### 仓储订单履约-客户演示 / SD1 订单履约细化

```text
包裹 exhibits 包裹重量.
出库订单 对应 包裹.
复核 changes 包裹 from 待检 to 合格.
复核 changes 包裹 from 待检 to 不合格.
复核 yields 通过复核记录.
完单登记 occurs if 通过复核记录 exists, else 完单登记 is skipped.
完单登记 changes 出库订单 from 待履约 to 已完成.
异常处置 yields 异常记录.
异常处置 occurs if 不合格 包裹 exists, else 异常处置 is skipped.
When 打包 exceeds PT5M, 异常处置 handles the exception.
打包 consumes 包装材料.
打包 yields 包裹.
拣选 requires 出库订单.
拣选 requires 分拣设备.
仓储作业员 handles 拣选.
```

### 仓储订单履约-客户演示 / SD1.1 异常处置细化

当前无关系句。

### 仓储订单履约-客户演示 / SD

当前无关系句。

### 仓储订单履约-工具校验-CTRL / SD

```text
C07 复核 occurs if there is C07 待检 C07 包裹, in which case C07 复核 changes C07 包裹 from C07 待检 to C07 合格, else C07 复核 is skipped.
C04 在岗 C04 仓储作业员 initiates and handles C04 拣选.
C08 拣选 occurs if C08 可用 C08 分拣设备 exists, else C08 拣选 is skipped.
C02 仓储作业员 initiates and handles C02 拣选.
C03 可用 C03 包装材料 initiates C03 打包, which consumes C03 包装材料.
C05 复核 occurs if C05 包裹 exists, in which case C05 复核 affects C05 包裹, otherwise C05 复核 is skipped.
C01 包装材料 initiates C01 打包, which consumes C01 包装材料.
C06 拣选 occurs if C06 分拣设备 exists, else C06 拣选 is skipped.
```

### 仓储订单履约-工具校验-NEG / SD

当前无关系句。

### 仓储订单履约-工具校验-PROC / SD

```text
打包执行 invokes 复核流程模板.
仓储作业员 handles 拣选.
拣选 requires 可用 分拣设备.
拣选 requires 分拣设备.
在岗 仓储作业员 handles 拣选.
复核 changes 包裹 to 合格.
When 复核 is under PT1M, 欠时检查 handles the exception.
复核 changes 包裹 from 待检.
复核 affects 包裹.
复核 changes 包裹 from 待检 to 合格.
打包 consumes 包装材料.
打包 yields 包裹.
打包 consumes 可用 包装材料.
When 打包 exceeds PT5M, 异常处置 handles the exception.
打包 yields 待检 包裹.
重试检查 invokes itself.
```

### 仓储订单履约-工具校验-STRUCT / SD

```text
自动分拣机 A is an instance of 自动分拣机.
包裹 exhibits 包裹重量.
出库订单 relates to 拣货单.
出库订单 对应 包裹.
仓储设备 A and 仓储设备 B are 协同.
自动分拣机 and 人工拣选台 are 分拣设备.
分拣设备 exhibits 设备自检.
履约系统（不完整） consists of 分拣单元（不完整） and 打包单元（不完整） and at least one other part.
复核 exhibits 复核时长.
履约系统 使用 分拣设备.
分拣设备 属于 履约系统.
履约系统 consists of 分拣单元 and 打包单元.
待检 包裹 对应 待履约 出库订单.
```
