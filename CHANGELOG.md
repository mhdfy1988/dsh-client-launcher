# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.3] - 2026-08-28

### Added

- 标题栏在检查和下载启动器更新时显示状态及进度；下载完成后可点击“可以重启”重新打开安装确认，更新失败时可悬停查看原因。

## [0.1.2] - 2026-08-28

### Added

- 主窗口标题栏和托盘菜单始终显示当前连接的 Harness 名称，标题栏悬停可查看完整目录，自动直达后也能确认实际启动目标。

### Changed

- 正式打包运行不再覆盖 `DSH_HOME`，由 DeepSeek Harness 按继承环境或 `~/.dsh` 使用用户原有的插件、技能、凭据和会话数据；源码开发与自动化 smoke 仍保持隔离数据目录。

### Fixed

- 启动器改为装载当前 Harness 的 `web` Profile，正式 `DSH_HOME` 中已安装的技能管理器、皮肤和 Codex Auth 等插件会随 Profile 一起加载。
- 启动器按官方顺序同时加载 Profile 层和 `$DSH_HOME/cordis.patch.yml` 全局用户补丁，避免桌面启动遗漏机器级配置。
- 移除早期 POC 强制写入的 `DSH_TELEMETRY_DISABLED=1`；启动器现在只在用户显式设置该环境变量时，按 DSH 官方规则禁用遥测行。
- 分层环境改为先加载所选 Harness 根 `.env` 和 `DSH_HOME/.env`，再组合 Profile，与官方 `dsh web` 的配置取值时序一致。
- 启动诊断改为读取启动器自身清单版本，避免开发模式把 Electron 版本误报为启动器版本。

## [0.1.1] - 2026-08-28

### Fixed

- 修复 `0.1.0` 正式安装包未携带 `electron-updater` 生产依赖，导致启动器显示“自动启动已暂停 / Cannot find module 'electron-updater'”的问题。
- 便携打包改为在隔离暂存目录只安装自动更新器的生产依赖闭包，不再依赖 Electron Packager 对 pnpm 链接布局的自动裁剪，也不会把 DSH 运行时打入启动器。
- 增加最终 `app.asar` 的真实 Electron 加载门禁；只有成品中的 `electron-updater.autoUpdater` 可解析并可调用时，便携包和安装器才允许继续生成。

## [0.1.0] - 2026-08-28

### Changed

- 对外产品名称统一为“DSH 客户端启动器”；仓库名、npm 包名、环境变量和历史诊断标识继续保留 `dsh-desktop-shell` / `DSH_DESKTOP_*`，以避免破坏现有开发脚本和兼容路径。
- 完善公开仓库说明，明确项目的非官方社区定位、源码与便携目录运行方式、数据隔离边界和未完成发布门禁。
- 补充 GitHub 仓库元数据与 MIT 许可证文件。
- NSIS 辅助安装器保留标准安装范围选择页，由用户明确选择“当前用户”或“所有用户”；当前用户路径由自动化门禁验证，所有用户路径已完成人工试装和真实启动验证。

### Added

- 增加 DSH 客户端启动器：支持上一级候选、手动添加、启动前重新检测、默认客户端自动直达和客户端记录移除；每个客户端使用独立隔离的 `DSH_HOME`。
- 接入 `electron-updater` 自动更新：安装包启动后检查配置的 GitHub feed，发现新版本自动下载，下载完成后由用户确认重启安装；开发、便携和 smoke 环境自动跳过。
- 建立独立 Electron POC 工程，固定 DeepSeek Harness 与 Electron 版本。
- 增加隔离 Profile、随机回环 Host、沙箱窗口和有界退出控制器。
- 增加 20 轮启动与退出生命周期 smoke。
- 增加目录内当前 DSH 定位、源码工作区检查和显式依赖安装/构建助手。
- 增加源码 workspace 的 Profile 裸包解析适配器。
- 增加基于 DSH 鲸鱼标志的高对比多尺寸 Windows 图标，并应用于托盘、窗口和 EXE。
- 增加启动器专属动态标题栏：监听 DSH 主题变量，实时同步窗口背景、标题栏颜色和高对比窗口按钮。
- 增加随主题与皮肤配色变化的自绘最小化、最大化/还原和关闭按钮，支持标题栏拖动与双击最大化。
- 增加便携 Agent 工具链门禁，使用 DSH 官方无密钥模型 mock 验证工作区会话、Windows `pwsh` 工具、文件结果、Renderer 展示和 Host 释放。
- 增加 Electron Builder NSIS 正式安装器和可重复生命周期 smoke，覆盖独立产品身份、首次安装、同目录覆盖、安装后启动、卸载、用户数据保留以及 DSH 文件边界校验。
- 增加 Electron Windows 安装器与发布流程，明确候选试装、覆盖升级、卸载边界、草稿 Release 门禁以及签名和自动更新的后续阶段。

### Fixed

- 修复 `--prepackaged` NSIS 打包不会自动写入 `app-update.yml` 的问题；打包脚本现在把 GitHub 正式更新源和缓存目录配置写入安装包资源，并校验对应 `latest.yml` 已生成。
- 修复启动器内嵌脚本中的换行转义错误；此前首次检测完成前页面脚本就会语法失败，导致“添加客户端”和客户端操作按钮无响应；同时补齐安装版 `poc` 数据目录初始化。
- 完善错误安装目录下的启动恢复页：明确展示 DSH 根目录布局，提供打开当前安装位置和正常退出操作，同时继续禁止选择、搜索或回退到其他 DSH。
- 修复 NSIS 卸载器主进程退出早于自删除子进程完成导致生命周期门禁误报目录残留的问题；门禁现在有界等待安装目录真正消失。
- 加强 NSIS 生命周期门禁对异步快捷方式清理的等待，避免安装目录已消失但桌面或开始菜单快捷方式尚未完成删除时误报失败。
- 修复生命周期门禁未固定当前用户安装范围、却固定按当前用户卸载的问题；安装与卸载现在使用一致的 NSIS 范围参数。
- 增加新旧启动器进程前置检查；客户端仍运行时门禁明确失败，不再继续安装或卸载，也不会自动终止用户进程。
- 移除桌面标题栏拖动区多余的主题强调色底边框，避免浅色主题顶部出现突兀横线。
- 将标题栏主题同步从可反复延后的 100ms 防抖改为下一渲染帧合并刷新，并移除 120ms 颜色过渡；监听范围收窄到 DSH 主题实际修改的根节点、正文属性和头部样式，避免会话内容变化拖慢标题栏换色。
- 在首帧主题同步后追加一次下一帧确认采样，使批量写入主题令牌的第三方皮肤可在最终计算样式稳定后同步标题栏，同时保持普通主题首帧更新。
- 监听正文背景色与文字色过渡的完成和取消事件，使带异步样式应用或颜色过渡的皮肤在页面最终颜色稳定后再次校正标题栏。
- 为真实主题节点变化增加不阻塞首帧的 450ms 尾随确认，覆盖皮肤规则被直接移除而浏览器不发送过渡事件的恢复默认路径。
- 修复桌面程序由短生命周期父进程启动后，诊断输出管道关闭会使后续主题切换触发 `EPIPE` 并终止 Electron 主进程的问题；仅忽略断管错误，其他输出故障继续显式失败。
- 修复启动器未绑定当前 DSH 自带 Agent 预设目录，导致工作区选中后创建会话报 `agent-preset-not-found` 且界面看似无响应的问题。
- 修复 Electron 中 Cordis Loader 无法从源码 workspace 的 Profile 回退目录解析插件包的问题。
- 修复 Windows 文件夹选择在 Electron 中启动官方 Node worker 后无法稳定返回选中路径的问题；启动器改用 Electron 原生选择器并保持 DSH 既有消息协议。
- 修复 Windows 标准预设通过 `process.execPath` 启动 ACL 沙箱 runner 时误重启启动器 EXE 的问题；启动器只为精确匹配的官方 runner 子进程启用 Electron Node 模式，不修改全局环境。
- 修复持久终端通过 `node-pty` 启动 ACL runner 时绕过子进程适配的问题，并在启动器退出前让活动交互式 shell 正常结束，避免 Electron 在 ConPTY 原生清理阶段异常退出。
- 修复便携包 smoke 把临时运行数据写入交付目录且未清理的问题；验证数据改用系统临时目录并在结束时统一删除。
- 修复沙箱 preload 使用 ESM 输出而未执行的问题，并在构建前清理旧产物，避免源码改名后继续加载陈旧文件。

[Unreleased]: https://github.com/mhdfy1988/dsh-desktop-shell/compare/v0.1.3...HEAD
[0.1.3]: https://github.com/mhdfy1988/dsh-desktop-shell/compare/v0.1.2...v0.1.3
[0.1.2]: https://github.com/mhdfy1988/dsh-desktop-shell/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/mhdfy1988/dsh-desktop-shell/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/mhdfy1988/dsh-desktop-shell/releases/tag/v0.1.0
