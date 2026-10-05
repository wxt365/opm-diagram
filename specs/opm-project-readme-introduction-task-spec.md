# 项目 README 介绍

日期：2026-10-05。Work Mode：change；Risk Level：L1；Task Type：feature；Active Playbooks：none（primary）。

## Lean Spec

目标：让首次访问仓库的读者理解项目定位、OPM、以 OPCloud 为参考的开源目标、当前实现范围和本地开发入口。

允许范围：根 `README.md` 和本文。禁止范围：源码、公共 API、Schema、依赖、运行配置、发布工具、用户数据和 `.harness/`。用户后续明确授权将这两份文档提交并推送到 GitHub。不新增许可证，不声称是 OPCloud 官方项目或源码分支，不把规划及标准符合性目标当作已验证能力。

契约影响：无；启动命令仅描述当前配置，开发体验不替代发布验收。

验收：RI-01 项目定位与开源目标清楚；RI-02 已有能力、后续方向与验证边界区分；RI-03 开发要求、命令、端口和存储位置有配置依据；RI-04 本地链接、围栏和差异检查通过。

验证：人工对照用户目标、当前实现记录、Maven/frontend 配置；自动检查相对链接存在性、Markdown 围栏及 `git diff --check`。只改文档，不执行应用测试或启动服务，不声明运行验证通过。

回滚：仅撤销本次 README 差异与新增本文，保留其他工作树变更。

## Plan

1. 以项目目标开篇，用对象、过程、状态和 OPD/OPL 解释 OPM。
2. 汇总已有实现并明确开发状态，给出配置支持的本地开发命令。
3. 检查文档入口、范围和 Markdown，再收口验收。

## Checklist

引用：本文 Lean Spec，RI-01～RI-04。

- [x] 边界确认：只编辑两份文档；无契约或依赖修改。
- [x] RI-01：已明确用户给出的 OPCloud 参考地址和独立开源实现目标。
- [x] RI-02：已有实现与未交付能力、标准符合性目标已区分。
- [x] RI-03：开发要求及命令已对照 package.json、pom.xml、Vite 和 application.yml。
- [x] RI-04：两份文档围栏、5 个本地链接和 `git diff --check` 通过；未执行应用测试或服务启动。
