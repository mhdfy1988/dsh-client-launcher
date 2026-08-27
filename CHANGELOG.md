# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- 完善公开仓库说明，明确项目的非官方 POC 定位、源码与便携目录运行方式、数据隔离边界和未完成发布门禁。
- 补充 GitHub 仓库元数据与 MIT 许可证文件。

### Added

- 建立独立 Electron POC 工程，固定 DeepSeek Harness 与 Electron 版本。
- 增加隔离 Profile、随机回环 Host、沙箱窗口和有界退出控制器。
- 增加 20 轮启动与退出生命周期 smoke。
- 增加目录内当前 DSH 定位、源码工作区检查和显式依赖安装/构建助手。
- 增加源码 workspace 的 Profile 裸包解析适配器。
- 增加基于 DSH 鲸鱼标志的高对比多尺寸 Windows 图标，并应用于托盘、窗口和 EXE。
- 增加 Desktop-only 动态标题栏：监听 DSH 主题变量，实时同步窗口背景、标题栏颜色和高对比窗口按钮。
- 增加随主题与皮肤配色变化的自绘最小化、最大化/还原和关闭按钮，支持标题栏拖动与双击最大化。

### Fixed

- 移除桌面标题栏拖动区多余的主题强调色底边框，避免浅色主题顶部出现突兀横线。
- 将标题栏主题同步从可反复延后的 100ms 防抖改为下一渲染帧合并刷新，并移除 120ms 颜色过渡；监听范围收窄到 DSH 主题实际修改的根节点、正文属性和头部样式，避免会话内容变化拖慢标题栏换色。
- 在首帧主题同步后追加一次下一帧确认采样，使批量写入主题令牌的第三方皮肤可在最终计算样式稳定后同步标题栏，同时保持普通主题首帧更新。
- 监听正文背景色与文字色过渡的完成和取消事件，使带异步样式应用或颜色过渡的皮肤在页面最终颜色稳定后再次校正标题栏。
- 为真实主题节点变化增加不阻塞首帧的 450ms 尾随确认，覆盖皮肤规则被直接移除而浏览器不发送过渡事件的恢复默认路径。
- 修复桌面程序由短生命周期父进程启动后，诊断输出管道关闭会使后续主题切换触发 `EPIPE` 并终止 Electron 主进程的问题；仅忽略断管错误，其他输出故障继续显式失败。
- 修复桌面壳未绑定当前 DSH 自带 Agent 预设目录，导致工作区选中后创建会话报 `agent-preset-not-found` 且界面看似无响应的问题。
- 修复 Electron 中 Cordis Loader 无法从源码 workspace 的 Profile 回退目录解析插件包的问题。
- 修复 Windows 文件夹选择在 Electron 中启动官方 Node worker 后无法稳定返回选中路径的问题；壳层改用 Electron 原生选择器并保持 DSH 既有消息协议。
- 修复便携包 smoke 把临时运行数据写入交付目录且未清理的问题；验证数据改用系统临时目录并在结束时统一删除。
- 修复沙箱 preload 使用 ESM 输出而未执行的问题，并在构建前清理旧产物，避免源码改名后继续加载陈旧文件。
