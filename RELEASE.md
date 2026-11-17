# Toolbox Enhanced 0.1.1

首次公开 GitHub 安装版，固定验证 DSH 0.2.2-rc.3 和 dsh-toolbox-ui 1.12.0。

- 技能目录使用当前电脑的 DSH 数据根，不再包含作者电脑路径。
- 原版继续负责 MCP、技能和工具管理；增强保留设置页样式、侧栏入口和启动超时适配。
- 提供源码、可复建脚本、版本安装包和 SHA-256，保留 MIT 许可。

通过 DSH 插件管理器先安装并启用 `dsh-toolbox-ui@1.12.0`，再安装本版本 `.tgz`。原包名 `@local/dsh-toolbox-enhanced` 保持，账号和现有 MCP 配置不打包。原生管理器提示需要重启时，结束任务后重启 DSH。

停用增强即可恢复原版；不要同时启用旧 `@local/dsh-toolbox-native`。上游后续版本需要重新验证，当前包的兼容声明限定到已验证版本。

本版本未对已登录 GUI 进行真实点击或明暗主题视觉验收。Remote Enhanced 未纳入本次发布。
