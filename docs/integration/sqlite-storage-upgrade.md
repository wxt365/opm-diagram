# SQLite 存储与旧项目转换

本仓库仅支持 SQLite。当前来源基线为存储版本 2.0：每个项目一个 `projects/<projectId>/project.db`，全局节点配色保存在 `catalog.db`。文件不能在不同项目间直接复制并改目录名。

## 从旧 V1～V8 项目转换

新版会在执行 Flyway 前识别旧项目并拒绝直接升级。转换命令只读原库，在临时目录构建新库，核对原表字段、行数、外键及草稿链后原子发布到全新目标目录。身份、修订和 JSON 原文保留；不能静默丢弃未知表或业务建模表。

1. 停止旧前后端和助手，备份整个旧 `runtime-data` 及助手会话目录。不要在旧服务仍写入时转换。
2. 使用 Java 17 或以上版本编译 Runtime。选择不存在的新存储目录；命令拒绝覆盖已有目录或符号链接。

```bash
./mvnw -pl services/local-runtime package -DskipTests
./mvnw -pl services/local-runtime spring-boot:run \
  -Dspring-boot.run.main-class=org.opm.localruntime.storage.LegacySqliteImportCli \
  -Dspring-boot.run.arguments='/absolute/old-runtime/projects/project.example/project.db /absolute/new-runtime'
```

3. 启动新版时指定新目录，而不是原库所在目录：

```bash
./mvnw -pl services/local-runtime spring-boot:run \
  -Dspring-boot.run.main-class=org.opm.localruntime.LocalRuntimeApplication \
  -Dspring-boot.run.arguments='--opm.storage.root=/absolute/new-runtime' \
  -Dspring-boot.run.workingDirectory="$PWD"
```

4. 打开项目，复核 OPL/Trace、草稿、历史及脑图；保存、关闭并重开。验证完成前保留旧库及备份。回退时停止新版并使用旧程序配合未修改的旧目录，不能用旧程序打开新基线。

当前命令一次转换一个项目到一个全新存储根目录；不会合并已有目标库，不复制旧助手密钥或自动迁移真实用户目录。多项目工作区须分别转换、验证，再由明确的备份恢复流程整理，禁止直接拼接数据库。转换失败不会发布最终目录；原库不变。

## 新基线备份

SQLite 使用 WAL 与外键约束。运行中备份使用桌面客户端的一致备份流程；手工备份应先停止 Runtime 和助手。不要仅复制仍在写入的 `.db` 或删除 WAL 文件。桌面恢复会先验证数据库完整性、外键及文件边界，并保留失败恢复的回退资料。

转换测试使用隔离夹具，不构成你现有数据库已经升级的证明。
