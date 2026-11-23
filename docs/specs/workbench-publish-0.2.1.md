# 工作台 0.2.1 私有仓库发布

> 上游历史参考：本仓库仅迁入 OPM、SQLite 与桌面相关部分；业务建模、PostgreSQL 和内网部署不在范围内。原文状态及验证结果不自动适用于本仓库，实际迁移验证见 README 的迁移策略与本次迁移报告。

Work Mode: change; Risk Level: L3; Task Type: feature; Active Playbooks: none (primary)。仓库无 repo-profile 或适用 task-type/playbook。

## Spec

目标：按用户在 Nexus 启用 npm Bearer Token Realm 后的指令，重试发布已验证的 @opm/workbench@0.2.1。

非目标：不重新构建或改版本、不上传其他包、不改账号权限/凭证、不重启后端、不修改运行数据。

允许边界：从仓库根 opm-workbench-0.2.1.tgz 发布至 http://192.168.137.26:8080/repository/npm-releases/，设置 latest；只读检查认证和远端版本/摘要；本规格与 docs/integration 两份指南的发布安装说明。禁止其他源/版本发布、覆盖删除现有远端包、业务源码/schema/依赖/配置/.harness 修改。凭证仅由 npm 读取既有配置，不输出。

契约影响：发布已验证包，无额外 API 改动。默认地址模式无新参数；已有源码要求自定义 Runtime 适配器支持 draftSaveState。

验收：A1 本地包摘要与打包规格一致；A2 远端存在 0.2.1 且包摘要一致、latest 正确；A3 文档同步安装来源。认证失败时明确报告，不将失败视为发布成功。

验证：npm whoami、npm view 检查版本与 dist 摘要；本地 Node crypto 计算摘要进行比较。已执行的组件构建/浏览器验证见 workbench-package-0.2.1.md，不重复构建。

回滚：不自动删除已发布版本；有问题时由管理员调整 latest 或发布修复版本。本次文档可单独还原，数据无变更。

## Plan

1. 核对本地包和认证，检查远端是否已有此版本，避免重复发布。
2. 尚无版本时执行 npm publish，查询远端版本和摘要。
3. 成功后更新安装说明与验证结果。

## Checklist

边界确认：用户已明确授权目标仓库发布；读取既有令牌，无凭证或后端配置改动。

- [x] A1（本文件#Spec）
- [x] A2（本文件#Spec）
- [x] A3（本文件#Spec）

## 实际结果

- 2026-10-15，既有令牌通过 npm whoami，账号 nexus-dev。未修改本机凭证。
- 发布前 npm view 返回 E404；随后 npm publish 成功，返回 `+ @opm/workbench@0.2.1`。
- 发布后 npm view 返回 version=0.2.1、dist-tags.latest=0.2.1。
- 本地包 SHA256 与打包规格一致：`10a86899011cee800c0324af2962b8943a159015b1aeb5687cff2b512c456101`。
- 远端和本地 SHA1 均为 `e14be407d6cb1e1e596c7c253578829b998e6541`。
- 远端和本地 integrity 均为 `sha512-ZCrdg8kor3JauuDSjjLjSHrPXCFMwFSMWcccZGW77FoZtkjBqdKIJKmE9KhdDhVMuaCCXp4Kn6BiznsynMJKGw==`。
- npm 网络/缓存操作因沙箱限制经提权执行；无后端重启、数据修改或重打包。未运行新业务测试（无代码变更），既有产物验证见打包规格。
- 本次完整文件变更清单：`docs/specs/workbench-publish-0.2.1.md`、`docs/integration/opm-workbench.md`、`docs/integration/opm-workbench-user-guide.md`。目标仓库新增 @opm/workbench@0.2.1；原本地版本/文档改动保留。
