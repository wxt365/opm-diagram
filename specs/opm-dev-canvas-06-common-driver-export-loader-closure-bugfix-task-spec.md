# DEV-CANVAS-06 Common Driver Export 与 Loader Closure Bugfix Task Spec

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

Task Type：`bugfix`

Active Playbooks：

- `testing (primary)`
- `design-module-docs`

## 1. 目标

修复 Family Controlled Invocation 规格把四个 Driver 都要求为 `driver/case_ids/executeCase` 三导出，与已冻结 Common Driver `v1.8` 的实际公共契约冲突的问题，使 production Runner 可以在不修改 Common Driver bytes、不放宽 source identity 的前提下实现唯一 exact loader。

本规格只修正 loader 的导出形状与 case 集合读取规则，不改变任何 Driver 行为、Manifest、Source Set、Stage R allowlist、case 数量、事务、证据、Gate 或 Capability。

## 2. 最小复现与 Root Cause

活动 Common Driver 固定导出：

```text
COMMON_DRIVER_ID
COMMON_DRIVER_VERSION
COMMON_CASES
executeCase
```

Family Controlled Invocation 规格第7.1节却要求四个模块都恰导出：

```text
driver
case_ids
executeCase
```

Common Driver又属于 Runner Source Set 相对Stage A的15项 unchanged entry，Stage R `25=23 M+2 A`不允许修改其bytes。若直接实现旧第7.1节，Common必然被拒；若修改Common，则Stage R、累计delta和Source Set变化计数全部失效。

Root Cause：后继Controlled Invocation闭包错误地把Family三模块的统一导出契约扩展到了已有独立版本契约的Common模块，且未同步source ownership。

## 3. 唯一修正

### 3.1 Family 三模块

`DRIVER-PROCEDURAL/CONTROL/STRUCTURAL`继续恰导出：

```text
driver
case_ids
executeCase
```

Runner按Family Driver设计逐字段验证metadata、原序case集合和函数返回边界。

### 3.2 Common 模块

`DRIVER-COMMON`继续恰导出：

```text
COMMON_DRIVER_ID
COMMON_DRIVER_VERSION
COMMON_CASES
executeCase
```

唯一映射为：

```text
driver_id = COMMON_DRIVER_ID = "DRIVER-COMMON"
driver_version = COMMON_DRIVER_VERSION = "0.2.0"
case_ids = Object.keys(COMMON_CASES)
```

`COMMON_CASES`必须是递归冻结的plain object，键顺序逐项等于Manifest中`driver_id=DRIVER-COMMON`的16项原序子序列，值继续服从Common Driver `v1.8`。禁止增加兼容别名、default export、第五个export或由Catalog/目录扫描重建module exports。

### 3.3 共同 source/ref 边界

四模块仍必须满足：Manifest `driver_catalog.source_ref`、Report staging Runner mirror ref、实际import file bytes三方`path/byte_length/sha256`相等；每个session按source SHA至多import一次，且只允许exact普通非链接file URL。导出形状不匹配统一返回`E2E_DRIVER_CONTRACT_INVALID/3`。

## 4. 修改边界

本设计修正不新增Stage R source路径。后继实现仍只修改既有Stage R `25=23 M+2 A` allowlist内的Runner owner/test、Family Driver与production bridge。

Common Driver、Manifest、Source Set Schema、Common Catalog、fixture、Vue、Java、SQLite、Profile、Report和Gate保持只读。

活动计数保持：

```text
Stage R = 25=23 M+2 A
O..R = 45=33 M+12 A
Runner Source Set = 0.2/0.2.0/24
relative A = 9 changed/new + 15 unchanged
```

## 5. 验收

1. 三个Family模块三导出正例及missing/extra/default/wrong metadata负例；
2. Common四导出正例及新增别名、缺`COMMON_CASES`、顺序/数量漂移负例；
3. 四模块source/mirror/Manifest三方bytes与wrong-driver反例；
4. Family `33/35/110`、Common `16`原序集合闭合；
5. Common Driver bytes相对Stage A不变；
6. Stage R `25`、累计`45`与Source Set `9+15=24`保持成立。

## 6. 回滚与状态

回滚必须恢复Controlled Invocation旧四模块三导出口径，并同时把production loader标记为`BLOCKED_BY_COMMON_DRIVER_EXPORT_CONFLICT`；禁止只放宽实现校验。

本规格不表示loader、Context session、Driver、真实`194/388`、Report、Gate、Candidate、Activation、Capability、production或ISO符合性已经形成。
