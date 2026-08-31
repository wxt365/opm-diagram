# Spec: DEV-CANVAS-06 Production Capture Plan 输入闭环修复

文档状态：`FROZEN_FOR_EXECUTION`

## Task Type

`bugfix`

## Active Playbooks

- `testing (primary)`
- `design-module-docs`

## 1. 目标

关闭新clean Handoff之后暴露的两个生产Capture Plan输入阻塞，并生成首份真实`READY_FOR_AUTHORING` Capture Plan：

1. Common Fixture Catalog身份不得依赖包含该Catalog bytes的target source commit，消除不可收敛的commit自引用；
2. Planner测试和生产执行必须从Handoff `build_artifacts[]`解析版本化`EVIDENCE_BUNDLE.path`与`LOCAL_RUNTIME_JAR.path`，不得硬编码历史`handoff/release`路径；
3. 在包含Planner、Capture Plan Schema、Common Fixture Catalog/factory/fixtures和稳定命令的clean source commit上重建DEV-CANVAS-05 Handoff/Bundle/Runtime/Intake；
4. Planner只能使用受控JDK 21的`${JAVA_HOME}/bin/jar`完成Evidence Bundle列表与解包，不得使用PATH中的其他JDK；
5. 使用同一source commit的production Web dist和exact Runtime JAR生成Schema-valid、`1242/9`、`READY_FOR_AUTHORING` Plan。

## 2. Root Cause

1. `author-canvas06-common-fixtures.mjs`把`catalog_id`后缀写成Handoff source commit前12位；Catalog又必须进入该source commit，导致提交后Handoff commit变化、Catalog再次drift，无法形成同一commit内的可复现闭包；
2. Planner测试曾固定读写`handoff/release/dev-canvas-05-evidence-bundle.jar`并固定传入`release/local-runtime-0.1.0-SNAPSHOT.jar`，而当前Handoff已切换到`releases/clean-<commit12>/...`；测试未完整跟随Handoff artifact path，Intake或Planner preflight因此阻断；
3. `1847172f5090` source commit不含Planner、Capture Plan Schema和Common Fixture Catalog，不能作为生产Planner的clean source root。
4. Planner首轮production执行使用PATH中的`jar 17.0.9`完成archive物化，虽然生成Schema-valid Plan，但违反已冻结的Java 21输入契约；原测试未断言archive tool identity，因此没有提前发现。

## 3. 冻结修复

### 3.1 Common Catalog身份

唯一公式冻结为：

```text
catalog_id = "dev-canvas-06.common-fixtures." + source_binding.binding_digest[0:12]
catalog_version = "0.1.0"
```

> 历史适用边界：以上`catalog_version=0.1.0`只定义并证明本规格已执行的历史Catalog与Capture Plan bytes。当前活动完整Catalog必须按Visual Common Materialization `v1.5`保持`catalog_version=0.2.0`和43文件self-contained root；不得把本节公式作为活动Builder输入，也不得改写下文历史SHA。

`catalog_id`表示绑定域，不表示source commit。`generator_ref`、fixture/factory refs和Catalog raw SHA继续闭合具体bytes。同一`catalog_id + catalog_version`内容不可变；fixture、factory、顺序或生成策略发生语义变化时必须发布新`catalog_version`，不得借source commit变化原地改写身份。

### 3.2 Handoff artifact路径

所有Planner正反例和生产命令必须从输入Handoff的`EVIDENCE_BUNDLE`与`LOCAL_RUNTIME_JAR` artifact读取相对path。历史缺replay反例允许把旧Bundle复制到fresh测试路径，但必须同时更新artifact的`path + byte_length + sha256`，再生成READY Intake；Runtime参数必须传入同一Handoff的exact `LOCAL_RUNTIME_JAR.path`。不得依赖仓库历史目录名称。

### 3.3 Java 21 archive tool

Planner必须只从`${JAVA_HOME}/bin/jar`解析archive工具，并在读取Bundle前执行`--version`校验。`JAVA_HOME`缺失、工具不可执行或版本不是`jar 21.*`时，必须以`GOLDEN_INPUT_MATERIALIZATION_FAILED`、退出码`3`和零Plan输出拒绝。Bundle列表、全部解包和Plan `input_materialization.java_version`必须使用同一已验证executable/version，禁止回退PATH。

### 3.4 clean source

新source commit至少包含：

- Planner及定向测试；
- Common Fixture author、factory、Catalog、8个Visual fixture和16组E2E base/input fixture；
- Capture Plan Schema与四个稳定npm命令；
- 本规格、checklist及必要状态同步；
- DEV-CANVAS-05 Bundle reports归档修复。

production Web dist由该clean commit执行`npm ci --ignore-scripts && npm run build`生成；`dist`保持ignored，不进入commit，但tree SHA必须写入Plan。Runtime、Bundle、Handoff和Intake必须从同一source commit重新生成。

## 4. 修改边界

### 4.1 允许修改

- `scripts/author-canvas06-common-fixtures.mjs`及定向测试；
- `scripts/release-canvas06-golden-plan.mjs`及定向测试；
- Common Fixture Catalog/factory/fixtures；
- Capture Plan Schema、`package.json`的四个相关命令；
- 本规格/checklist及直接引用旧输入状态的文档；
- 新版本化clean Handoff/Bundle/Runtime/descriptor/Intake/Plan；
- 专用clean分支，不合并或提交主工作树其他改动。

### 4.2 禁止修改

- Profile/Rule/Grammar/Symbol/Normalization语义；
- SQLite、公共API、Vue业务实现、Materializer、Candidate Author、Approval/Publisher；
- 历史`handoff/release/**`和`releases/clean-1847172f5090/**`；
- approved golden、Visual/E2E/Performance/Recovery Report、Candidate、Activation和production gate。

本任务不新增依赖，不修改数据库Schema或公共API。

## 5. 执行顺序

```text
冻结修复 -> 定向测试转绿 -> 建立clean source commit
-> production Web build -> DEV-CANVAS-05 clean release
-> READY Handoff -> READY Intake -> Common Catalog reproducibility
-> production Capture Plan -> Plan Schema/ref/count/determinism验证
-> 提交不可变产物并同步当前工作树
```

任一步失败不得生成或保留可消费Plan；失败重跑使用新的change root，不覆盖既有输出。

## 6. 验收标准

1. Common Catalog对任意source commit但相同active binding生成相同`catalog_id`，当前Catalog可复现；
2. Planner定向测试从Handoff解析版本化Bundle与Runtime路径，并覆盖正例、历史缺replay反例、dirty source和禁止参数，全部零旁路；
3. 非Java 21 archive tool正反例证明Planner以稳定错误码、退出码`3`和零输出拒绝；READY Plan记录`jar 21.*`；
4. 新source worktree在release启动前clean，descriptor source commit一致且`dirty_before_build=false`；
5. 新Handoff为`READY_FOR_DEV_CANVAS_06`，Intake为`READY_FOR_RELEASE_VALIDATION`；
6. production Plan为`READY_FOR_AUTHORING`，`1170+72=1242` capture、9 blank、130个Family variant、8个Common subject；
7. Plan的Handoff/Intake/Bundle/Runtime/Common Catalog/fixture refs、source build、web dist tree SHA与raw SHA全部复算一致；
8. 相同输入与epoch的受控Planner结果byte-identical；生产Plan使用排他路径且不覆盖；
9. 历史release root零变化，`git diff --check`通过。

## 7. 非目标与声明边界

本任务不执行130项SQLite materialization，不生成PNG、Approval、Authoring Report、Visual/E2E/Performance/Recovery READY Report、Candidate或Activation，不启用Capability，不声明ISO符合性。

## 8. Compatibility Impact

- API/数据库/运行配置：无影响；
- Catalog：identity后缀从历史source commit前缀切换为active binding digest前缀，Catalog raw SHA随之变化；
- 发布顺序：旧`clean-1847172f5090`保留为历史输入；生产Planner只能消费本任务新建的同source commit Handoff/Intake/Common Catalog/Web dist链；
- 回滚：回退修复代码和状态文档，删除尚未被下游引用的新Plan/change root；已引用产物只能保留并用新版本替代。

## 9. 事实与假设

### 9.1 事实

1. 修复前Common Catalog reproducibility test为`1 PASS / 1 FAIL`，失败码`CANVAS06_COMMON_FIXTURE_CATALOG_DRIFT`；修复后为`2/2 PASS`；
2. 修复前Planner test为`0 PASS / 2 FAIL`：先在`refreshIntake`阶段因Bundle artifact path不一致返回`3`；Bundle路径修复后又在Planner preflight因Runtime artifact仍硬编码旧路径返回`GOLDEN_RUNTIME_JAR_MISMATCH`；最终Planner正反例为`3/3 PASS`；
3. `1847172f5090`不包含Planner、Capture Plan Schema、Common Fixture Catalog或author脚本；最终clean source commit为`b940ac9bb73442c3a697cce8bfa7c9df52856b3a`；
4. 首轮未提交production Plan记录`input_materialization.java_version=jar 17.0.9`，已判定不可信并整体隔离到仓库外；
5. 最终production Plan记录`jar 21.0.7`，状态为`READY_FOR_AUTHORING`，两次独立执行均得到SHA-256 `8f891fd3f1cdef84df37efade3714dac904370aa427c4373b73ab0772f4f1eb9`。

### 9.2 假设

无。

## 10. 执行结果

版本化输出根：

```text
packages/profiles/profile.iso19450.2024.draft/0.2.0/handoff/releases/clean-b940ac9bb734/
```

Capture Plan：

```text
dev-canvas-06/golden-authoring/GOLDEN-CANVAS06-20260803-001/capture-plan.json
```

| 资产 | SHA-256 |
| --- | --- |
| Evidence Bundle | `84e41e5e4c9edab98aa72cd209da49726df96436c9d0ae8a50fc2895f375cabe` |
| Runtime JAR | `0cfe0f14f2190e64e4cbc39b8a8bfbb8c9a5b733607cb24c4801c872f87b3f49` |
| Release Build descriptor | `89a4047ec2d27f057d4b14c5417fa1e1074c069cdb42804ff0a2c9832aff2fd3` |
| 固定路径 Handoff | `0778d77f75a68b4fb447fd26614d71885af88982dba5f2e7e1e9bd70d98b1326` |
| Intake Report | `54d56bab7792122781bc2b8b785c3488a4bd1d4f7ecc741845ecbcccdb2d85ee` |
| Common Fixture Catalog | `9133096ad601b223b1e42112631acfff5506e80c403e4d9f529a1f398439f8ea` |
| Capture Plan | `8f891fd3f1cdef84df37efade3714dac904370aa427c4373b73ab0772f4f1eb9` |

Web dist tree SHA-256为`8a4472e552756c3b580270611a78fd61fad00f3850d64ece62f1ebe8ce0774de`。Bundle内目标`golden-replay.json`恰有一项，其raw SHA-256为`3e3c9d9e6e444e30ed86fbca9cf10e2923f236e7acd84630bdd68ee9efe5b3da`，与Handoff report bytes一致。

本结果只把Golden Authoring推进到Capture Plan，不构成130项Materialization、PNG authoring、Approval、Authoring Report、Visual/E2E/Performance/Recovery READY Report、Candidate、Activation、Capability启用或ISO 19450:2024符合性证明。
