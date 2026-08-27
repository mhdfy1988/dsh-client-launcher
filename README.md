# DSH Desktop Shell

DeepSeek Harness Windows 桌面宿主的隔离概念验证。Shell 放在一个 DSH 根目录的子目录中，启动当前目录的 DSH，并提供显式源码构建助手；当前仍不是正式桌面版本。

> 本项目是独立社区实验项目，与 DeepSeek 官方无隶属、授权或背书关系。仓库当前只发布源码，不提供已签名安装器，也不建议用于生产环境。

## 当前发布状态

- 桌面壳版本：`0.0.1-poc.0`。
- 兼容基线：Windows 11 x64、Electron `43.4.0`、DeepSeek Harness `0.1.1-rc.2`。
- 已完成：目录内 DSH 定位、显式源码构建、随机回环 Host、托盘与单实例、窗口状态、原生目录选择、自绘标题栏和主题/皮肤颜色同步。
- 未完成：NSIS 安装器、代码签名、自动更新与回滚、正式数据迁移、长期驻留及 Windows 10 验证。

## 当前边界

- Shell 源码开发基线固定为 `@deepseek-ai/dsh@0.1.1-rc.2`；打包后的 Shell 使用所在目录的当前 DSH，并在启动日志报告实际版本。
- 不修改 DeepSeek Harness 官方源码。
- 开发运行数据固定写入 `.poc/`，不接触用户正式 Harness home。
- Electron Renderer 关闭 Node 集成，启用上下文隔离和沙箱。
- Host 只绑定 `127.0.0.1` 和系统分配端口。
- Electron 壳位于 `app.asar`，默认把 EXE 目录的上一级识别为当前 DSH 根；不携带或回退内置 DSH。
- 支持已安装运行时和官方源码工作区；源码未构建时可在恢复页明确触发依赖安装与官方构建。
- Windows 目录选择请求由壳层精确识别后交给 Electron 原生文件夹选择器，并按 DSH 既有 worker 消息协议返回结果；不会修改 DSH 插件，也不会影响其他子进程。
- 窗口关闭隐藏到托盘；托盘可恢复窗口、请求重启 Host 或统一退出；窗口位置和大小写入隔离 `.poc` 数据目录。
- 托盘、窗口和 Windows EXE 共用基于 DSH 官方鲸鱼标志制作的高对比多尺寸图标。
- Windows 标题栏读取当前 DSH 主题最终生效的背景、文字和强调色，并在主题或皮肤切换后的下一渲染帧更新；无边框窗口使用壳层自绘的最小化、最大化/还原和关闭按钮，支持拖动与双击最大化，默认菜单栏和额外分隔线均已移除。

## 本地验证

要求 Node.js `^22.19.0 || >=24.0.0` 与 pnpm `11.7.0`。源码运行使用本仓库锁定的 DSH 发布包，并把测试数据写入 `.poc/`。

```powershell
pnpm.cmd install
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run smoke:abi
pnpm.cmd run smoke:recovery
pnpm.cmd run smoke:window-state
pnpm.cmd run smoke:single-instance
pnpm.cmd run smoke:lifecycle
$env:DSH_DESKTOP_SMOKE_RUNTIME_DIR = 'D:\path\to\fresh-deepseek-harness'
pnpm.cmd run smoke:directory-picker
pnpm.cmd run smoke:portable
```

手动打开窗口：

```powershell
pnpm.cmd start
```

## 便携目录使用

当前只生成未签名 Windows x64 便携目录，不生成安装器：

```powershell
pnpm.cmd run package:portable
```

将 `.artifacts/portable/dsh-desktop-shell-win32-x64` 整个目录复制或重命名为目标 DSH 根目录下的 `desktop-shell`。最终结构必须同时满足：

```text
deepseek-harness/
├─ package.json
├─ node_modules/ 或 apps/cli/node_modules/
└─ desktop-shell/
   ├─ dsh-desktop-shell.exe
   └─ resources/app.asar
```

双击 `dsh-desktop-shell.exe` 后，壳只检查上一级 DSH；缺少依赖或构建产物时显示恢复页，不搜索其他安装、不启动外部 `dsh web`，也不回退内置副本。便携运行数据写入 Electron 用户数据目录下的 `poc`，不会接入已有正式 `DSH_HOME`。

生命周期 smoke 会连续启动 20 个隔离运行代，要求每次页面就绪、Cordis 完整释放、Electron 正常退出，并确认退出后本轮回环端口不可再访问。

## 当前状态

第 0、1 阶段源码 POC 已通过，且第 2 阶段已落地目录内运行时切片：Electron 43.4.0 内置 Node 24.18.1，官方 Web Profile 和最小 Desktop Cordis 插件连续 20 轮完成启动、页面渲染、插件撤销、Host 释放和端口关闭；失败注入只显示恢复页；托盘、窗口状态、单实例、统一退出和 Windows 原生目录选择已通过 smoke。全新官方 DSH checkout 已由构建助手完成 935 个依赖安装和官方完整构建，随后文件夹内 Shell 在不设置运行时变量的情况下完成页面启动和退出。皮肤平台 `0.1.1` 已完成深浅皮肤与 Harness 默认外观的标题栏颜色实测；`0.1.2` 已通过官方插件流程装入隔离桌面配置档案，等待当前窗口下次重启后做人工复核。后续发布门禁见 [打包门禁](./docs/packaging-gate.md)。

目录约定和构建边界见 [目录内 DSH 运行时与构建助手](./docs/folder-local-runtime.md)，详细证据见 [阶段一验证](./docs/poc-stage-1-validation.md)。POC 通过不等于安装包、正式数据共享、代码签名或更新回滚门禁已经通过。
