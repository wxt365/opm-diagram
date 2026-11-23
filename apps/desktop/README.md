# OPM Studio 桌面客户端

本仓库迁入桌面端源码与测试，仅装配 OPM、SQLite 和 OPM 助手，不包含业务建模或本体治理。下文旧版本安装包路径与日期来自上游历史说明，不代表当前仓库已生成安装包。当前实际验证结果以本仓库迁移报告为准；签名、公证、跨平台安装和发布验收需独立执行。旧 SQLite 工作区升级见[转换说明](../../docs/integration/sqlite-storage-upgrade.md)。

Electron 壳复用 Web 工作台，新构建使用随包 Java 17、独立 Node 24 LTS（至少 24.9）和 SQLite。核心建模不依赖 Vite、系统 Java/Node、PostgreSQL 或 AI Key。Harness 已升级为 0.2.2-rc.5；现有历史安装包仍保持原运行时，本次未重新打包。安装器、签名和各目标系统运行验收另行执行，证据见[实现清单](../../docs/checklists/opm-desktop-client-implementation-feature-checklist.md)。

## macOS 本机试用包

2026-11-16 Apple Silicon（arm64）测试包按 `out/<version>/` 分目录保留。0.1.3 位于 `out/0.1.3/make/dmg/arm64/OPM Studio-0.1.3-arm64.dmg`，包含画布横纵滚动条闪烁修复；构建与验收见 [0.1.3 检查清单](../../docs/checklists/desktop-013-package-bugfix-checklist.md)。0.1.2 的设置窗口关闭修复见 [0.1.2 检查清单](../../docs/checklists/desktop-012-package-bugfix-checklist.md)。0.1.1、0.1.2 保留在对应版本目录，0.1.0 原包保留在 `out/make/dmg/arm64/`。

打开 DMG，将 `OPM Studio.app` 拖入 Applications 后启动。包内含独立 Azul Zulu Java 17 JRE、Node 22 和 SQLite 后端，不需要先运行开发服务。智能助手需在客户端设置中自行配置 Key；开发数据库不会自动迁入。

该包未使用 Developer ID 签名及 Apple 公证，供本机试用；最低 macOS 13 为随包声明，未在最低版本或 Intel Mac 验收。最终应用与磁盘映像证据见[测试包清单](../../docs/checklists/opm-macos-test-package-feature-checklist.md)。

0.1.1 的验证范围分别见 [HTTP 网关修复](../../docs/checklists/desktop-lan-http-bugfix-checklist.md)与[品牌标识](../../docs/checklists/opm-brand-feature-checklist.md)。标识矢量源及重新生成方法见[品牌资产说明](../../assets/brand/README.md)。

## 本机开发

工程构建使用 Node 24.22.3 LTS、npm、JDK 17 和仓库 Maven Wrapper。仓库当前不跟踪 lock 文件，新检出使用 `npm install`；仅本地已经生成匹配 lock 时才使用 `npm ci`。先在仓库根目录执行：

```sh
nvm use
npm install
npm run build --workspace=@opm/web
./mvnw -pl services/local-runtime -am -DskipTests package
npm run desktop:prepare -- --dev-runtime
npm run desktop:dev
```

`--dev-runtime` 复制当前设备的 Java 17 与 Node 24，仅供开发验证；macOS 自动查询 Java 17，其他情况通过 `OPM_DESKTOP_JRE` 指定 Java home。资源生成到忽略目录 `apps/desktop/.runtime/opm`，关键资源缺失或摘要错误、版本或架构不符会停止启动；不会连接当前机器已启动的 Web/Runtime。

要与自己的桌面数据隔离，可在启动前设置 `OPM_DESKTOP_USER_DATA` 为新目录。此覆盖仅在开发态生效；不传时使用系统应用数据目录。`.env.local` 不会被桌面读取。

```sh
OPM_DESKTOP_USER_DATA=/tmp/opm-studio-sandbox npm run desktop:dev
npm run desktop:test
npm run desktop:smoke
```

smoke 使用全新中文及空格路径，不接触已有模型，实际在画布创建对象和过程、改名与保存，验证设置窗口重复关闭/重开、独立助手启动、工作区备份、重开、恢复及退出；临时证据目录在结束时输出。只使用假 Key 做本地助手健康检查，不调用在线模型。

验证 macOS 最终包时，将 `OPM_PACKAGED_EXECUTABLE` 指向 `.app/Contents/MacOS/opm-studio` 后执行 `npm run desktop:smoke`。脚本通过全新 `CFFIXED_USER_HOME` 隔离系统应用目录，并断言打包态及实际数据路径；不安装或替换用户的应用。

## 用户操作与数据

- 通过应用菜单“客户端设置”或智能助手标题栏“设置”配置模型服务；输入 Key 后可选系统加密持久保存。不可用时仅本次运行有效，不能明文降级；留空保留原 Key，“清除 Key”停用助手。
- Base URL 支持 HTTPS、本机 HTTP，以及 `10.*`、`172.16.*`～`172.31.*`、`192.168.*` 私网 IPv4 的 HTTP。桌面仅将已保存网关的精确 origin 授权给助手，保留端口和 `/v1` 等路径；公网 HTTP、URL 内认证/查询/片段继续拒绝。OpenAI 格式网关应选“OpenAI 兼容服务”，模型 ID 使用网关实际提供的名称。
- 通过设置备份/恢复、打开目录及导出诊断。备份会先完成工作台退出检查，再正常停服；操作后重启服务并返回项目库。恢复检查摘要、版本、路径、SQLite 完整性与外键，替换前保存当前数据，并保留 `workspace-before-*` 回退目录；恢复后清除原设备 Key，防止向备份中的其他模型服务地址发送旧凭证。
- “帮助 → 重启本地服务”可重新连接异常服务；已有编辑未保存时先明确提示。不能安全停服时不做备份。
- macOS 关闭窗口只隐藏，Dock 可重新显示；退出菜单才关闭服务。Windows 关闭主窗口进入保存/退出协调。生成中的 AI 任务需确认停止，未确认提案不自动应用。

默认数据目录为 macOS `~/Library/Application Support/OPM Studio`、Windows `%APPDATA%/OPM Studio`。实际位置可在设置中查看：

```text
<userData>/
  workspace/
    runtime-data/      catalog.db、projects/<projectId>/project.db 等业务数据
    assistant/         对话、附件与 Harness 工作区
    settings/          普通配置与数据版本标记
  credentials.json    系统加密凭证（不参与备份）
  local-origin.json   稳定的本机入口端口（不参与迁移）
  sessions/           Chromium 会话、IndexedDB 待确认请求
  backups/            升级前与恢复前备份
  logs/               受管服务日志
  ready/              当前服务身份回执
```

首次分配随机网关端口并持久保存，以保持 IndexedDB origin；后续冲突时报错，不更换 origin 隐藏待确认数据，也不结束其他服务。Runtime 和助手每次使用随机端口及 nonce/PID 回执。桌面数据与开发用 `runtime-data/sqlite` 分离；现有模型用模型/OPD 交换功能迁入。

## 目标平台构建

分别在原生构建环境装配 `darwin-arm64`、`darwin-x64`、`win32-x64`，禁止交叉架构误装。目标系统为 macOS 13+ 与 Windows 11 x64；最低版本仍须在对应干净设备验收。Electron 45.3.2 随包声明的 macOS 下限为 13.0，不用本机成功代替最低系统测试。

发行前通过环境提供匹配平台/架构、允许分发的 Java 17 home（`OPM_DESKTOP_JRE`）、Node 24 LTS 可执行文件（`OPM_DESKTOP_NODE`，至少 24.9）和两者的许可/来源说明文件（`OPM_DESKTOP_RUNTIME_NOTICES`），再执行：

```sh
npm run desktop:prepare
npm run desktop:test
npm run desktop:smoke
npm run desktop:package
npm run desktop:make
```

准备脚本按 Node 实际解析收集助手生产依赖及嵌套版本，保留许可证文件；Profile 只复制正式包的版本入口及其 manifest 声明并通过摘要校验的资产，排除 Golden/handoff 测试快照。拒绝 `.env*`、用户数据库和凭证；资源清单记录所有文件 SHA-256、架构、应用/Java/Node 版本、源码修订、脏工作区状态、锁文件和迁移摘要。装配和 Forge 打包前逐文件全量校验，拒绝 `developmentRuntime` 资源用于发行。启动时复核核心二进制、业务代码及资产，不重复扫描全部第三方依赖；完整性校验不能替代发布签名。`.runtime` 和 `out` 不提交。

macOS maker 为 DMG，Windows maker 为 Squirrel EXE；两者在对应原生环境执行。macOS 签名身份通过 `OPM_MAC_SIGN_IDENTITY`，公证通过 `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`；Windows 通过 `OPM_WINDOWS_CERTIFICATE_FILE`、`OPM_WINDOWS_CERTIFICATE_PASSWORD`。签名配置可选以支持开发构建，正式发布必须取得签名、公证和最终安装器验收。Squirrel 使用每用户安装，不添加开机自启；卸载保留工作区。

macOS 制作 DMG 需要已编译的 `macos-alias`、`fs-xattr` 原生工具依赖。若此前安装时跳过了安装脚本，先执行 `npm rebuild macos-alias fs-xattr`。Forge 8 的 `prePackage` 钩子接收独立 `platform`、`arch` 参数；配置按实际签名检查原生目标，不跳过架构或分发资源校验。

## 验证边界

`desktop:test` 覆盖传输/SSE/同源、安全路径、回执、受管进程退出、备份恢复、凭证、资源校验和助手动态端口。Web/Java/助手各自回归命令及实际结果见实现清单。真实 AI 多轮、离线交换、强停/磁盘不足、全部系统安装/升级/卸载与签名矩阵需要单独运行，不能仅据开发态 smoke 宣称发布通过。
