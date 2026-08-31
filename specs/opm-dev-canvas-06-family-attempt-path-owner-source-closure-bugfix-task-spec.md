# DEV-CANVAS-06 Family Attempt Path Owner 与 Source Closure Bugfix Task Spec

状态：`DESIGN_FROZEN / READY_FOR_BUILD`

Task Type：`bugfix`

Active Playbooks：

- `testing (primary)`
- `design-module-docs`

## 1. 目标

修复共享Attempt路径owner只接受Common `E2E-CANVAS-*` case ID、因而必然拒绝178个`G-OPL-PROC/CTRL/STRUCT-*` Family case的问题，并把唯一owner及其测试纳入Final Production Source Chain的Stage R。

本规格只扩展case ID词法与source ownership；不改变percent-encoding算法、attempt目录布局、Manifest/Attempt/Report Schema、业务语义、Driver行为、Gate或Capability。

## 2. 最小复现与 Root Cause

当前`scripts/canvas06-e2e-attempt-artifacts.mjs`的`assertAttemptIdentity()`固定要求：

```text
^E2E-CANVAS-00[1-7]\\..+$
```

活动Manifest `0.2`却包含：

```text
178 Family: G-OPL-PROC-*/G-OPL-CTRL-*/G-OPL-STRUCT-*
16 Common:  E2E-CANVAS-00[1-7].*
```

因此Context展开、Fault Plan、artifact root和最终194/388调度在第一个Family case即以`E2E_INPUT_INVALID`失败。此前测试只覆盖Common/Fault case，没有用活动Manifest原序调用共享路径owner。

## 3. Fix Strategy

1. `attemptRelativeRoot()`继续作为唯一percent-encoded path owner；Runner、Context和artifact writer不得复制编码器。
2. `assertAttemptIdentity()`只接受两个封闭集合：Common `^E2E-CANVAS-00[1-7]\\.[A-Z0-9][A-Z0-9._-]*$`，Family `^G-OPL-(?:PROC|CTRL|STRUCT)-[0-9]{3}\\.[A-Z0-9][A-Z0-9._-]*$`。
3. 继续拒绝空值、Unicode别名、小写family、未知family、缺suite编号、路径分隔符、`..`段、NUL和非`1|2` attempt ordinal。
4. percent-encoding算法、允许原样保留的ASCII集合`[A-Za-z0-9._-]`和大写`%HH`保持不变。
5. 使用活动Manifest风格的PROC/CTRL/STRUCT/Common正例和词法负例补长期回归。

## 4. 修改边界

Stage R新增exact `2 M`：

```text
M scripts/canvas06-e2e-attempt-artifacts.mjs
M scripts/canvas06-e2e-attempt-artifacts.test.mjs
```

禁止新增路径helper、修改Driver/Manifest case ID、放宽为任意非空字符串或从目录名推断case identity。

Stage R最终取代为：

```text
25=23 M+2 A
```

累计取代为：

```text
O..R=45=33 M+12 A
```

Runner Source Set保持`0.2/0.2.0/24`；`canvas06-e2e-attempt-artifacts.mjs`本来就是第8项，因此相对A的Source Set变化为`9 changed/new + 15 unchanged`。其测试继续属于排除集。

## 5. Source Guard

`scripts/canvas06-unified-production-input.mjs`及其测试必须把上述两项加入`RUNNER_DELTA`和`FINAL_RUNNER_CUMULATIVE_DELTA`，按UTF-8 path bytes精确比较：

```text
Stage R = 25=23 M+2 A
O..R = 45=33 M+12 A
```

两个owner必须相对A真实改变bytes；只改Runner复制编码逻辑、只改测试或只改计数均拒绝。

## 6. 验收

至少验证：

1. 四类合法case ID的attempt `1/2`均生成唯一稳定路径；
2. Common现有编码bytes不变；
3. Family路径不含未编码`/`、反斜杠或NUL；
4. unknown family、lowercase、路径穿越、错误attempt ordinal稳定拒绝；
5. Context可按Manifest原序形成194/388 schedule；
6. Stage R exact 25、O..R exact 45及Source Set `9+15=24`通过。

## 7. 回滚与非结论

回滚必须同时恢复共享owner、测试、Stage R/累计allowlist、Source Set变化计数和Context正例；禁止只把Runner改回第二套编码器。

本设计闭包不表示Stage R、194/388、Report、Gate、Candidate、Activation、Capability、production或ISO符合性已经形成。
