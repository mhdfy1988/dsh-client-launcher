# DSH 客户端启动器

DeepSeek Harness 的独立 Windows 客户端启动器。启动器安装在 DSH 根目录的专属子目录中，启动用户选择的当前 DSH，并提供显式源码构建助手。

> 本项目是独立社区项目，与 DeepSeek 官方无隶属、授权或背书关系。GitHub Release 提供正式版本源码和未签名 Windows 安装器；Windows 可能显示未知发布者提示。

## 当前发布状态

- 当前正式版本：`0.1.2`。
- 兼容基线：Windows 11 x64、Electron `43.4.0`、DeepSeek Harness `0.1.1-rc.2`。
- 已完成：目录内 DSH 定位、显式源码构建、随机回环 Host、托盘与单实例、窗口状态、原生目录选择、自绘标题栏和主题/皮肤颜色同步。
- 已完成启动器基础：首次启动显示 DSH 客户端选择页，可手动添加多个 DSH；启动前重新检测，默认客户端有效时后续直接进入。
- 已接入自动更新流程：带有更新 feed 的安装包启动后自动检查，发现新版本自动下载，下载完成后由用户确认重启安装；开发、便携和 smoke 运行默认跳过。
- `0.1.0` 安装包遗漏了自动更新器运行依赖，无法自行升级；该版本用户需要手动安装一次 `0.1.1`，后续版本再使用应用内自动更新。
- 已验证安装器：Electron Builder NSIS 辅助安装器，覆盖当前用户静默安装、同目录覆盖安装、安装后真实工具链、静默卸载和用户数据保留；安装和卸载前会拒绝在任一新旧启动器进程仍运行时执行生命周期门禁。
- 未完成：代码签名、从旧 Preview 自动迁移、公开 feed 的真实下载与重启安装回归、更新失败回滚、长期驻留、新版错误目录恢复操作人工复核及 Windows 10 完整验证。当前 Windows 自动化控制器无法捕获 NSIS 原生窗口，返回 `SetIsBorderRequired ... 不支持此接口`；这不影响静默生命周期门禁，但不能代替人工界面确认。

## 当前边界

- 启动器源码开发基线固定为 `@deepseek-ai/dsh@0.1.1-rc.2`；打包后的启动器使用所在目录的当前 DSH，并在启动日志报告实际版本。
- 不修改 DeepSeek Harness 官方源码。
- 开发运行和 smoke 数据固定写入 `.poc/`；正式打包运行不注入 `DSH_HOME`，由 Harness 按继承环境或 `~/.dsh` 自己解析正式数据目录。
- Electron Renderer 关闭 Node 集成，启用上下文隔离和沙箱。
- Host 只绑定 `127.0.0.1` 和系统分配端口。
- Electron 启动器位于 `app.asar`，默认把 EXE 目录的上一级识别为当前 DSH 根；不携带或回退内置 DSH。
- 支持已安装运行时和官方源码工作区；源码未构建时可在恢复页明确触发依赖安装与官方构建。
- Windows 目录选择请求由启动器精确识别后交给 Electron 原生文件夹选择器，并按 DSH 既有 worker 消息协议返回结果；不会修改 DSH 插件，也不会影响其他子进程。
- Windows ACL 沙箱 runner 仍由 DSH 官方链路生成；启动器只在其入口精确匹配时为该子进程启用 Electron Node 模式，避免 `process.execPath` 把 runner 重新解释为桌面 EXE。其他子进程保持原始启动语义。
- DSH 的 `node-pty` 仍从当前目录运行时加载；启动器只修正 ACL runner 的 Electron Node 子进程语义，并在退出前请求活动交互式 shell 正常结束，随后仍由 DSH 原有生命周期释放终端资源。
- 窗口关闭隐藏到托盘；托盘可恢复窗口、请求重启 Host 或统一退出；窗口位置和大小写入隔离 `.poc` 数据目录。
- 托盘、窗口和 Windows EXE 共用基于 DSH 官方鲸鱼标志制作的高对比多尺寸图标。
- Windows 标题栏读取当前 DSH 主题最终生效的背景、文字和强调色，并在主题或皮肤切换后的下一渲染帧更新；无边框窗口使用启动器自绘的最小化、最大化/还原和关闭按钮，支持拖动与双击最大化，默认菜单栏和额外分隔线均已移除。

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
pnpm.cmd run smoke:agent-toolchain
$env:DSH_DESKTOP_AGENT_TOOLCHAIN_SCENARIO = 'background'
pnpm.cmd run smoke:agent-toolchain
$env:DSH_DESKTOP_AGENT_TOOLCHAIN_SCENARIO = 'cancel'
pnpm.cmd run smoke:agent-toolchain
$env:DSH_DESKTOP_AGENT_TOOLCHAIN_SCENARIO = 'terminal'
pnpm.cmd run smoke:agent-toolchain
$env:DSH_DESKTOP_INSTALLER_SMOKE_RUNTIME_DIR = 'D:\path\to\fresh-deepseek-harness'
pnpm.cmd run smoke:installer
```

手动打开窗口：

```powershell
pnpm.cmd start
```

## 便携目录使用

当前可生成未签名 Windows x64 便携目录和正式 NSIS 安装器：

```powershell
pnpm.cmd run package:portable
pnpm.cmd run package:installer
```

将 `.artifacts/portable/dsh-client-launcher-win32-x64` 整个目录复制或重命名为目标 DSH 根目录下的 `client-launcher`。最终结构必须同时满足：

```text
deepseek-harness/
├─ package.json
├─ node_modules/ 或 apps/cli/node_modules/
└─ client-launcher/
   ├─ dsh-client-launcher.exe
   └─ resources/app.asar
```

双击 `dsh-client-launcher.exe` 后，启动器只检查上一级 DSH；缺少依赖或构建产物时显示客户端选择/恢复页，不搜索其他安装、不启动外部 `dsh web`，也不回退内置副本。源码和 smoke 的运行数据写入 Electron 用户数据目录下的 `poc`；正式打包运行不覆盖已有 `DSH_HOME`，由当前 DSH 自己使用继承环境或 `~/.dsh`。

启动器只展示安装目录上一级候选和用户明确添加的目录，不扫描磁盘；选择结果保存在启动器隔离目录，移除客户端只删除启动器记录。

生命周期 smoke 会连续启动 20 个隔离运行代，要求每次页面就绪、Cordis 完整释放、Electron 正常退出，并确认退出后本轮回环端口不可再访问。

`smoke:agent-toolchain` 使用全新 DSH checkout 自带的官方无密钥模型 mock，启动真实便携 EXE，通过正式 HTTP API 注册工作区、创建并归组会话，再触发 Windows 标准预设实际公开的 `pwsh` 工具。工具经官方 Windows ACL 沙箱 runner 在会话工作区内写入并回读校验文件；验证随后检查持久化会话历史、真实 Renderer 可见结果、截图、Cordis 释放和回环端口关闭。设置 `DSH_DESKTOP_AGENT_TOOLCHAIN_SCENARIO=background` 时，同一门禁改走正式后台作业并检查返回的作业编号与异步文件结果；设置为 `cancel` 时启动长任务后走正式 `session.cancel`，要求中止结果可见且目标文件不会生成；设置为 `terminal` 时先通过正式 `settings.update` 把新会话权限设为 `danger-full-access`，再选择官方 `minimal` 预设，通过 `node-pty` 支撑的持久 PowerShell 工具执行同一文件闭环，并验证活动 PTY 在桌面退出时正常释放。该命令使用独立 smoke 数据目录，不读取或写入正式 `DSH_HOME`。

## 当前状态

第 0、1 阶段源码 POC 已通过，且第 2 阶段已落地目录内运行时切片：Electron 43.4.0 内置 Node 24.18.1，官方 Web Profile 和最小 Desktop Cordis 插件连续 20 轮完成启动、页面渲染、插件撤销、Host 释放和端口关闭；失败注入只显示恢复页；托盘、窗口状态、单实例、统一退出和 Windows 原生目录选择已通过 smoke。全新官方 DSH checkout 已由构建助手完成 935 个依赖安装和官方完整构建，随后真实便携 EXE 已完成工作区注册、会话归组、模型工具调用、Windows ACL 沙箱、前台及后台 PowerShell 文件读写、正式会话取消，以及 Full access 下持久 PowerShell 终端的命令、文件、Renderer 和清理闭环。Workspace write 下的持久终端仍受官方 ACL runner 与 ConPTY 组合限制，当前会在启动期返回 `PTY shell exited during startup`；标准预设的一次性 PowerShell 不受影响。皮肤平台 `0.1.1` 已完成深浅皮肤与 Harness 默认外观的标题栏颜色实测；`0.1.2` 已通过官方插件流程装入隔离桌面配置档案，等待当前窗口下次重启后做人工复核。Electron Builder NSIS 正式安装器已在全新测试 Harness 下完成首次安装、同目录覆盖、安装后便携与前台 Agent 工具链、卸载、注册项清理、用户数据保留及 Harness 摘要不变验证；当前安装器仍未签名，辅助安装界面和非静默目录选择仍需人工复核。后续发布门禁见 [打包门禁](./docs/packaging-gate.md)，完整流程见 [Electron Windows 安装器与发布流程](./docs/windows-installer-release.md)。

目录约定和构建边界见 [目录内 DSH 运行时与构建助手](./docs/folder-local-runtime.md)，详细证据见 [阶段一验证](./docs/poc-stage-1-validation.md)。用户侧的首次配置、启动、切换、升级、卸载、自动更新和问题排查见 [客户端启动器使用说明](./docs/client-launcher-usage.md)；安装器的打包、发布和门禁见 [打包门禁](./docs/packaging-gate.md) 与 [Windows 安装器与发布流程](./docs/windows-installer-release.md)。正式发布不代表代码签名、Preview 数据迁移或更新失败回滚已经完成。
