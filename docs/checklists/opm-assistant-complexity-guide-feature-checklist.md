# 智能助手复杂图建模指导检查清单

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

规格：[opm-assistant-complexity-guide-feature-spec.md](../specs/opm-assistant-complexity-guide-feature-spec.md)。

- [x] 允许/禁止目录及契约边界已确认；真实数据、公共 API 字段、运行时实现不修改。
- [x] 已阅读 Skill、动态审查 schema、版本应用守卫和现有测试，标准原文及来源摘要已核对。
- [x] CG-01：人工核对生成指导，覆盖本图目的、拥挤原因、跨图身份、父子外部语义及不支持能力的说明；不引入删除事实或自动跨图操作。
- [x] CG-02：已纠正布局绝对表述，区分严格内缩放与普通位置，保留顺序/并行和对象空间或逻辑顺序，优先局部调整。
- [x] CG-03：核对原文页码及来源摘要，新增 OPM-STATE-VIEW、OPM-REFINEMENT、OPM-ZOOM-ORDER；缺少机制或证据分别使用 NOT_APPLICABLE/NEEDS_INPUT，密度偏好不作为语义错误。
- [x] CG-04：13 项 review/quality 测试通过；新版规则缺项拒绝、条款绑定、待确认及明确错误门槛通过；service 新用例验证旧版报告保留但零提交。既有非阻断质量和一次确认回归通过。
- [x] CG-05：Skill 格式校验、版本、设计与运行说明同步完成；实际回归结果及限制如下。
- [x] CG-06：生成/审查指导已补系统价值与边界、前后条件、状态/属性、角色一致性、控制、逻辑、结构与数量/单位；区分系统级与局部任务，未知事实不编造。
- [x] CG-07：新增六项规则并扩充状态/变换依据，目录共十五项，指导及审查版本 1.2.0；OPL 缺少平台文本时 NEEDS_INPUT，不声称已验证。
- [x] CG-08：十五项完整性、条款绑定、待确认非阻断及业务遗漏依据测试通过；旧 1.1.0 报告保留但不能提交的守卫通过。

## 实际验证（2026-10-09）

- 使用临时目录 `/private/tmp/opm-skill-validation-deps` 中的 PyYAML 执行 skill-creator 的 `quick_validate.py`，两份 Skill 均输出 `Skill is valid!`，退出 0；不修改项目依赖。
- `/Users/xiaotaowang/.nvm/versions/node/v22.22.0/bin/node --test apps/assistant/test/review.test.mjs apps/assistant/test/quality.test.mjs`：13/13，通过。日志 `/private/tmp/opm-complexity-focused-tests.log`。
- 助手全量测试在沙箱内因三个 HTTP 监听 EPERM 失败，允许监听后重跑：71 项中 67 通过、1 失败、3 被取消，退出 1，不能声明全量通过。日志 `/private/tmp/opm-complexity-assistant-unsandboxed-tests.log`。
- 在 `/private/tmp/opm-complexity-baseline.hMmQIx` 用 `git archive HEAD apps/assistant` 导出未修改源码，复用现有只读依赖和未修改契约，复现同一脑图排除用例的 `request` 未定义，以及同一生成阶段超时用例的挂起/后续取消；这些失败不是本次 Skill 或规则目录变更引入。日志 `/private/tmp/opm-complexity-baseline-tests.log`。不修改无关运行时实现。
- 单独执行被前序取消的“脑图重审仍读取被冻结…”与“修正阶段超时保留已提交…”：2/2，通过，日志 `/private/tmp/opm-complexity-cancelled-tests.log`。全量运行本身仍未通过。
- 本次新增规格/清单与 Skill 本地链接检查、`git diff --check` 通过。人工核对摘要对应原文第 87～93、102、122 页。

本轮验证规则载入、报告契约与提交守卫，没有调用真实大模型生成案例或进行画布验收，不能据此声称复杂业务图的实际生成效果已验证。未重启或启动应用服务；Skill 在助手下一次启动时加载，旧未应用整图方案须重新审查。

## 每张 OPD 的目标口径补充（2026-10-09）

按用户澄清，CG-01 的 8～15 个目标推广到所有 OPD（总览及各层子图），按主要对象与过程合计计数；少于 8 个不补节点，超过 15 个先考虑阅读负担与细化，不删除必要事实。已同步两份 Skill、运行说明、设计及规格，保留本次尚未发布的 1.1.0 版本。两份 Skill 格式校验通过，review/quality 定向测试再次 13/13 通过（日志 `/private/tmp/opm-complexity-per-opd-tests.log`），文案口径核对及 `git diff --check` 通过；未重复全量测试，本次只调整指导文字，不改变数值或运行时算法。

## 主动推荐拆分补充（2026-10-09）

CG-01 增加拥挤影响理解时主动推荐具体子图方案：已有细化过程/对象、子图名称及问题、内部细节、父图保留内容和外部边界。按业务语义划分，不按数量机械拆图；当前能力只支持建议，不扩大跨图写入或增加逐步确认。生成 Skill、设计与验收同步；Skill 格式校验及 `git diff --check` 通过。此次仅补指导文字，未新增或重复运行自动化测试，未进行真实大模型生成验证。

## 业务语义原则补充（2026-10-09）

两份 Skill 与版本化目录升级到 1.2.0，审查由九项扩为十五项；质量策略数值与 policy_version 不变。系统级与子图/局部任务按范围核对，不新增跨图写入或 OPL 读取能力。核对标准原文第 18～20、27～29、39、53、55、76、78、87 页；默认状态按随机观察时最可能出现的状态表达，AND 明确共同源于或共同指向同一过程，XOR/OR 明确分歧端对象存在或过程发生的逻辑。未知控制、结构、边界及 OPL 证据不伪造通过。

- 两份 Skill 格式验证通过；版本、十五项唯一 ID、原文 SHA256、保留的策略值和本地链接核对通过。
- review/quality 定向测试 15/15 通过；规则版本与来源、冻结脑图基线、修正阶段超时定向测试 3/3 通过；旧 1.1.0 报告提交守卫单独 1/1 通过。
- 助手全量 73 项：69 通过、1 失败、3 取消，退出 1。日志 `/private/tmp/opm-principles-assistant-tests.log`。与已核对 HEAD 基线同样是脑图排除用例 request 未定义、生成阶段超时挂起导致后两项取消；后两项单独通过。本次不修无关运行时实现，不宣称全量通过。
- 人工核对任务范围、证据不足处理、一次确认和工具权限边界；未调用真实大模型或进行画布验收，未启动或重启服务。新版在助手下次启动时加载，旧未应用方案须重新审查。
