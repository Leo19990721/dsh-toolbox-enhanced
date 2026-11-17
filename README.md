# Toolbox Enhanced

配合社区原版 [dsh-toolbox-ui](https://github.com/Imzl-zl/dsh-toolbox-ui) 使用的独立增强插件。原版负责 MCP、技能、工具管理和检查更新；本插件保留设置页风格、上方侧栏入口、既有 MCP 启动超时和工具权限规则。

## 安装

已验证：**DSH 0.2.2-rc.3、dsh-toolbox-ui 1.12.0**。在 DSH 插件管理器先安装并启用 `dsh-toolbox-ui@1.12.0`，再从本仓库 [Releases](https://github.com/Leo19990721/dsh-toolbox-enhanced/releases) 下载 `.tgz`，通过插件管理器安装其绝对路径。也可以直接填写对应版本安装包的下载 URL。

升级时安装新版本的同名包 `@local/dsh-toolbox-enhanced`，保留各台电脑的 MCP 配置。管理器返回“需要重启”时，先结束正在执行的任务再重启 DSH。停用增强可恢复原版组件；不要同时启用旧 `@local/dsh-toolbox-native`。

自定义技能根目录自动使用当前 DSH 数据目录下的 `skills/user`，不包含作者电脑路径或技能文件。安装包不携带账号、密钥、会话或 MCP 连接配置。保持既有的 `native-toolbox-user` provider 标识，方便从旧版本升级。

## 使用范围

增强继续使用原版的窗口大小、管理操作和社区更新提示。原版升级后需要重新验证适配；未识别的面板结构保留原样。既有全局 MCP 的 `startupTimeoutMs` 在编辑和导出时保留；JSON 导入和项目级配置仍按原版能力处理。

权限规则仅针对 `leo-env`、`knowledge`、`playwright` 这些同名工具来源，保留已有只读和审批行为；不会创建这些 MCP 连接，不修改 DSH 默认权限。该增强不自动升级原版或其他电脑。

## 开发

Node.js 24、pnpm。运行 `pnpm install --ignore-scripts`，然后 `pnpm build`、`pnpm test`。在正在运行的 DSH 会话环境中执行测试，可额外运行安装版 Cordis 和 SlotCore 集成；Desktop 使用 Electron 的 Node 模式访问 ASAR。

Windows 可执行 `pwsh -NoProfile -File scripts/pack.ps1`，自动构建、测试、检查安装包并生成 `.local-install` 下的版本包和 SHA-256。`-NodePath`、`-PnpmPath` 可显式指定已有运行环境，无需作者电脑上的目录。正式发布上传代码、版本标签、安装包和校验文件，安装仍由 DSH 插件管理器完成。

原代码来源及 MIT 许可见 [NOTICE](./NOTICE) 和 [LICENSE](./LICENSE)。本项目独立维护。
