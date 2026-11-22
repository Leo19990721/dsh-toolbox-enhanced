# Toolbox Enhanced

配合社区原版 [dsh-toolbox-ui](https://github.com/Imzl-zl/dsh-toolbox-ui) 使用的独立增强插件。原版负责 MCP、技能、工具管理和检查更新；本插件保留设置页风格、上方侧栏的「工具箱」（英文界面为「Toolbox」）入口、既有 MCP 启动超时和工具权限规则。

## 安装

0.1.5 起，增强包不再声明 DSH 版本限制（`engines.dsh`）；0.1.6 起，社区原版 `dsh-toolbox-ui` 的 peer 版本要求改为 `*`。本版在 DSH 0.2.2-rc.5 上分别搭配社区原版 1.12.1、1.14.0 通过 Host 与客户端槽位集成测试，不保证其他组合兼容。仍须满足所装原版自己的 DSH 要求；例如这两个原版版本均要求 DSH `>=0.2.1-rc.5 <0.3.0`。

先在 DSH 插件管理器确认社区原版已启用，再从本仓库 [Releases](https://github.com/Leo19990721/dsh-toolbox-enhanced/releases) 下载 `.tgz`，安装该文件的绝对路径。也可直接填写 Release 的安装包下载 URL。

升级时安装新版本的同名包 `@local/dsh-toolbox-enhanced`，保留各台电脑的 MCP 配置。管理器返回“需要重启”时，先结束正在执行的任务再重启 DSH。停用增强可恢复原版组件；不要同时启用旧 `@local/dsh-toolbox-native`。

自定义技能根目录自动使用当前 DSH 数据目录下的 `skills/user`，不包含作者电脑路径或技能文件。安装包不携带账号、密钥、会话或 MCP 连接配置。保持既有的 `native-toolbox-user` provider 标识，方便从旧版本升级。

## 使用范围

增强继续使用原版的窗口大小、管理操作和社区更新提示。原版升级后需要重新验证适配；未识别的面板结构保留原样。既有全局 MCP 的 `startupTimeoutMs` 在导出时保留。0.1.2 起，工具箱拒绝编辑带启动超时的连接并提示改用 DSH 原生配置编辑，避免旧保存分支写出与原版列表不一致的配置或损坏环境变量引用；该拒绝不写入任何配置。普通连接编辑仍交原版处理；JSON 导入和项目级配置仍按原版能力处理。

权限规则仅针对 `leo-env`、`knowledge`、`playwright` 这些同名工具来源，保留已有只读和审批行为；不会创建这些 MCP 连接，不修改 DSH 默认权限。该增强不自动升级原版或其他电脑。

## 开发

用 Node.js 24 和 pnpm，依次运行 `pnpm install --frozen-lockfile --ignore-scripts`、`pnpm build`、`pnpm test`。默认测试使用锁定的原版 1.12.1；也可用 `DSH_TEST_TOOLBOX_MANIFEST` 指向其他原版版本在独立目录下的包清单，验证其 Host 和客户端能力是否仍能适配。

Windows 的 `pwsh -NoProfile -File scripts/pack.ps1` 会构建、测试，检查归档文件并在 `.local-install` 生成版本包和 SHA-256。加 `-InstalledRuntime` 会使用 `DSH_INSTALL_DIR` 和 `DSH_NODE_EXECUTABLE` 所指的已安装 DSH 再验证版本门禁、Host 共存和客户端槽位；测试只用项目依赖和自己创建的临时配置。它不读取或修改当前 DSH 配置，不启动浏览器。`-NodePath`、`-PnpmPath` 可显式指定已有工具。

正式发布在本仓库 GitHub Releases 附上 `.tgz` 和校验文件，通过 DSH 插件管理器安装。

原代码来源及 MIT 许可见 [NOTICE](./NOTICE) 和 [LICENSE](./LICENSE)。本项目独立维护。
