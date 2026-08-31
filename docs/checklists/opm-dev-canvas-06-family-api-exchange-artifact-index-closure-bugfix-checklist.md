# Checklist: DEV-CANVAS-06 Family API Exchange 与 Artifact Index Closure

状态：`DESIGN_FROZEN / IMPLEMENTATION_IN_PROGRESS`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标、复现、Root Cause | 1~2 | AE01~AE05 |
| Schema、Exchange、Index语义 | 3 | AE06~AE18 |
| allowlist、Source identity | 4 | AE19~AE24 |
| 验收、回滚、证据边界 | 5~6 | AE25~AE30、I01~I08 |

## Design Closure

- [x] AE01 Schema `minItems=16`与writer/verifier恰16冲突已复现。
- [x] AE02 receipt `exchange_ref`与Schema缺少`API_EXCHANGE`已复现。
- [x] AE03 attempt-local `inputs/storage`被writer误判extra已复现。
- [x] AE04 Root Cause及此前未发现原因已记录。
- [x] AE05 本修正不提升任何Gate或发布状态。
- [x] AE06 Attempt Artifact保持`0.2`，历史`0.1`只读。
- [x] AE07 `API_EXCHANGE` kind和`exchange_ref`字段已冻结。
- [x] AE08 八字段exchange file与九字段Index对象边界已冻结。
- [x] AE09 `exchange_set_sha256`输入已冻结。
- [x] AE10 16项定义为必需最小集合。
- [x] AE11 六类动态证据kind已冻结。
- [x] AE12 refs顺序、唯一性和tree digest已冻结。
- [x] AE13 `inputs/**`、`storage/**`为唯一非Index运行支持树。
- [x] AE14 运行支持树专用校验责任未放宽。
- [x] AE15 其余全部证据文件必须索引。
- [x] AE16 API Exchange/Body路径、media、phase、required已冻结。
- [x] AE17 body/exchange/index三方唯一引用已冻结。
- [x] AE18 链接、extra、孤立证据失败边界已冻结。
- [x] AE19 Stage R新增exact 3 M。
- [x] AE20 Stage R固定`29=27 M+2 A`。
- [x] AE21 O..R固定`48=36 M+12 A`。
- [x] AE22 Source Set保持`0.2/24`。
- [x] AE23 Source Set相对A固定`10 changed/new +14 unchanged`。
- [x] AE24 公共HTTP、SQLite DDL、Manifest/Report字段和Gate不变。
- [x] AE25 正反例矩阵已冻结。
- [x] AE26 Node 22验证命令已冻结。
- [x] AE27 回滚必须整体恢复。
- [x] AE28 额外source路径必须新增后继规格。
- [x] AE29 设计状态保持FROZEN。
- [x] AE30 真实194/388及发布证据状态不提升。

## Implementation Acceptance

- [x] I01 Schema增加`API_EXCHANGE`与`exchange_ref`正反例。
- [x] I02 sink生成八字段file、九字段Index entry和raw ref。
- [x] I03 writer接纳16项最小集及动态证据。
- [x] I04 writer只跳过`inputs/storage`并拒绝其他未索引文件。
- [x] I05 Report verifier复核exchange/body/index/Artifact Index闭包。
- [x] I06 writer、Schema、verifier定向测试通过。
- [ ] I07 Source Set `10/14`、Stage R `29`、累计`48`通过。
- [x] I08 完整Runner回归通过。

## 当前状态

- 设计：`FROZEN`。
- 实现：`IN_PROGRESS`；I01~I06及I08已通过Node 22定向/完整Runner测试，I07的`29/48` source guard已通过，仍等待Stage R其余Source Set owner形成目标`10/14`。
- 真实`194/388`、Report、Gate、Candidate、Activation、Capability、production、ISO：不提升。
