# Checklist: DEV-CANVAS-06 Stage R Service Regression 与 Source Guard Closure Bugfix

状态：`FROZEN_FOR_IMPLEMENTATION / IMPLEMENTATION_NOT_STARTED`

## Task Type

- [x] `bugfix`

## Active Playbooks

- [x] `design-module-docs (primary)`
- [x] `testing`
- [x] `backend-springboot`

## Spec Mapping

| 责任 | 规格章节 | Checklist |
| --- | --- | --- |
| 目标与冲突 | 1~2 | SR01~SR05 |
| 唯一修正与计数 | 3 | SR06~SR12 |
| Service测试边界 | 4 | SR13~SR17 |
| Source Guard边界 | 5 | SR18~SR23 |
| 修改边界 | 6 | SR24~SR26 |
| 顺序、验收、回滚 | 7~8 | SR27~SR31、I01~I08 |

## Design Closure

- [x] SR01 已定位4条与目标集合重叠的旧Service错误码断言。
- [x] SR02 已确认修改Service后既有测试必然失败。
- [x] SR03 已确认旧Stage R不授权修改Service测试。
- [x] SR04 已确认统一source guard硬编码旧20/42集合。
- [x] SR05 禁止通过跳过测试或放宽source guard解决。
- [x] SR06 Stage R新增exact `3 M`。
- [x] SR07 API/Runtime contract扩为`5 M`。
- [x] SR08 source guard子切片固定`2 M`。
- [x] SR09 Stage R固定`23=21 M+2 A`。
- [x] SR10 O..R固定`43=31 M+12 A`。
- [x] SR11 O..A和FAULT_2A保持不变。
- [x] SR12 Runner Source Set保持`0.2/24`。
- [x] SR13 允许同步目标19类的既有Service断言。
- [x] SR14 四项已存在Control回归边界已列明。
- [x] SR15 candidate/endpoint/owner等排除集保持原码。
- [x] SR16 禁止消息字符串重分类。
- [x] SR17 禁止批量修改全部领域断言。
- [x] SR18 RUNNER_DELTA固定23项。
- [x] SR19 FINAL_RUNNER_CUMULATIVE_DELTA固定43项。
- [x] SR20 新Java测试路径不得进入FAULT_2A集合。
- [x] SR21 旧20/42、missing、extra和错误status必须拒绝。
- [x] SR22 A的七路径身份保持不变。
- [x] SR23 source guard禁止fallback和目录扫描。
- [x] SR24 新增source allowlist恰为3项。
- [x] SR25 原20项Stage R路径保持不变。
- [x] SR26 其他产品、Schema和历史commit保持禁止修改。
- [x] SR27 先失败测试、再设计修正、再生产实现的顺序已冻结。
- [x] SR28 Java Service/Controller必须联合回归。
- [x] SR29 Node contract与source guard必须定向验证。
- [x] SR30 实现切片不构成发布证据。
- [x] SR31 R形成前后回滚边界已冻结。

## Implementation

- [ ] I01 `LocalApiServiceTest.java`仅更新目标集合并保留排除集断言。
- [ ] I02 `LocalApiService.java`完成19类最窄映射。
- [ ] I03 Controller raw ErrorEnvelope正反例通过。
- [ ] I04 OpenAPI与Node contract正反例通过。
- [ ] I05 source guard owner/test更新为23/43。
- [ ] I06 Java Service/Controller定向测试通过。
- [ ] I07 Stage R exact 23项与O..R exact 43项通过。
- [ ] I08 未提升R、194/388、Report或发布状态。

