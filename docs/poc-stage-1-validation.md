# DSH 客户端启动器第 0、1 阶段验证

## 验证信息

- 日期：2026-08-28
- 仓库：`D:\deepseek\dsh-desktop-shell`
- 客户端启动器：`0.1.2`
- Electron：`43.4.0`
- Electron 内置 Node：`24.18.1`
- Node modules ABI：`148`
- DeepSeek Harness：`0.1.1-rc.2`
- Profile：隔离数据目录中的 `web`
- 数据：仓库 `.poc`，未读取或写入正式 `DSH_HOME`

## 已通过

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 独立工程 | 通过 | 独立 Git 仓库、锁文件、`upstream.json`、CHANGELOG、架构和兼容文档存在 |
| 官方装配 | 通过 | 只使用发布包、`app-boot`、Web Profile 与 Bundle；官方源码未改动 |
| 启动器插件 | 通过 | 最小 Desktop Cordis effect 每轮输出 mounted/unmounted |
| Renderer | 通过 | 无凭据隔离环境渲染 DSH 页面标题 `DSH Local Build`，可见正文长度 56 |
| 生命周期 | 通过 | 20/20 冷启动和退出；每轮实际端口在退出后不可访问 |
| 失败恢复 | 通过 | 强制启动失败只产生 recovery ready，不产生主窗口 ready，随后完整释放 |
| 原生 ABI | 当前源码 POC 通过 | Electron 内普通 PowerShell、`node-pty`/ConPTY、`koffi`/Win32 调用成功；活动 PTY 在 Host 退出前正常结束并释放 |
| 依赖闭包 | 通过 | `pnpm peers check` 无问题；React 与 ReactDOM 均固定为 18.3.1 |
| 残留检查 | 通过 | 验证后无本项目 Electron 进程，3082 未监听且未被 POC 使用 |
| 窗口生命周期首切片 | 通过 | 托盘初始化、窗口隐藏/恢复、窗口状态持久化、单实例唤醒和统一退出由 `smoke:window-state`、`smoke:single-instance` 验证 |
| 目录内运行时便携包 | 通过 | 全新官方 DSH checkout 完成 935 个依赖安装和官方构建；启动器从上一级识别该工作区并完成页面启动和退出 |
| Windows 原生目录选择 | 通过 | Electron 原生选择器取消时返回 `done(path:null)`；选中全新测试仓库时返回 `done(path:"D:\\deepseek\\dsh-desktop-fresh-test")`；其他子进程与父进程环境不变 |
| 工作区选择与会话创建 | 通过 | 客户端启动器从当前 DSH 注入 `config/agent-presets`；真实点击 `test` 后装载 `standard` 预设并创建空白会话，控制台无 `agent-preset-not-found` |
| 自绘标题栏与主题跟随 | 通过 | 沙箱 preload 读取 DSH 设计变量并发出主题事件；无边框窗口的自绘三键使用同一文字和强调色，支持拖动、双击最大化及最大化/还原状态同步，拖动区不绘制额外分隔线 |
| 第三方皮肤标题栏跟随 | 通过（`0.1.1`） | 在隔离数据目录中的 `web` 配置档案实测“梦境仙游”浅色、“虚空低语”`rgb(13, 17, 20)` 和 Harness 默认 `rgb(255, 255, 255)` 三条路径的页面与标题栏最终颜色一致；`0.1.2` 已通过官方插件流程安装，等待当前窗口下次重启后人工复核 |
| 自动更新配置与安装器资源 | 通过（代码与正式安装包） | `electron-updater` 仅在已打包且存在 `resources/app-update.yml` 时启用；正式安装器资源包含 GitHub Release 配置并生成对应 `latest.yml`；最终 `app.asar` 已由真实 Electron 加载 `autoUpdater`，开发、便携和 smoke 跳过网络检查；代码签名、真实下载重启和回滚仍未完成 |
| 当前 Harness 可见性 | 通过（`0.1.2`） | 自定义标题栏显示当前 Harness 名称，悬停显示完整目录；托盘菜单显示同一名称，真实渲染 smoke 已验证 |
| 便携 Agent 工具链 | 通过 | 全新 DSH checkout 的官方无密钥模型 mock → 真实便携 EXE → `workspace.create` → 带 `workspaceId` 的 `session.create` → `session.prompt` → Windows ACL 沙箱 runner → 前台/后台 `pwsh` 与正式 `session.cancel` → 工作区文件或中止结果 → 会话历史与 Renderer → Host 释放和端口关闭 |
| 持久 PowerShell 终端 | Full access 通过 | 正式 `settings.update` → `danger-full-access` → 官方 `minimal` 预设 → `node-pty` 持久 `pwsh` → 文件写入回读 → 会话历史与 Renderer → 活动 PTY 正常退出 → Host 释放和端口关闭 |

## 验证命令

```powershell
pnpm.cmd install --frozen-lockfile=false
pnpm.cmd run typecheck
pnpm.cmd run test
pnpm.cmd run smoke:abi
pnpm.cmd run smoke:recovery
pnpm.cmd run smoke:window-state
pnpm.cmd run smoke:single-instance
$env:DSH_DESKTOP_POC_ITERATIONS='20'
pnpm.cmd run smoke:lifecycle
$env:DSH_DESKTOP_SMOKE_RUNTIME_DIR='D:\path\to\fresh-deepseek-harness'
pnpm.cmd run smoke:directory-picker
pnpm.cmd run smoke:portable
$env:DSH_DESKTOP_INSTALLER_SMOKE_RUNTIME_DIR='D:\path\to\fresh-deepseek-harness'
pnpm.cmd run smoke:installer
pnpm.cmd run smoke:agent-toolchain
$env:DSH_DESKTOP_AGENT_TOOLCHAIN_SCENARIO='background'
pnpm.cmd run smoke:agent-toolchain
$env:DSH_DESKTOP_AGENT_TOOLCHAIN_SCENARIO='cancel'
pnpm.cmd run smoke:agent-toolchain
$env:DSH_DESKTOP_AGENT_TOOLCHAIN_SCENARIO='terminal'
pnpm.cmd run smoke:agent-toolchain
pnpm.cmd peers check
pnpm.cmd run versions
```

关键结果：

```text
tests 27, pass 27, fail 0
DSH_DESKTOP_PICKER_WORKER_READY
picker smoke message {"kind":"done","path":"D:\\deepseek\\dsh-desktop-fresh-test"}
DSH_DESKTOP_POC_ABI_OK {"electron":"43.4.0","node":"24.18.1","modules":"148","platform":"win32","arch":"x64"}
DSH_DESKTOP_PACKAGED_UPDATER_OK
recovery smoke ok
window-state smoke ok
single-instance smoke ok
DSH_DESKTOP_POC_RENDERER_READY {"title":"DSH Local Build","bodyLength":56}
lifecycle 20/20 ok
{"status":"ok","scenario":"foreground","runtimeRoot":"D:\\deepseek\\dsh-desktop-fresh-test"}
{"status":"ok","scenario":"background","runtimeRoot":"D:\\deepseek\\dsh-desktop-fresh-test"}
{"status":"ok","scenario":"cancel","runtimeRoot":"D:\\deepseek\\dsh-desktop-fresh-test"}
{"status":"ok","scenario":"terminal","runtimeRoot":"D:\\deepseek\\dsh-desktop-fresh-test"}
{"status":"ok","runtimeRoot":"D:\\deepseek\\dsh-desktop-fresh-test","installer":"DSH-Client-Launcher-0.1.1-x64-setup.exe","installerSha256":"69D22DF1ACCCBD4D19686FA081DBC9B746D53F728A8FE498E239A565A3506B27","autoUpdateConfigured":true,"dataPreserved":true}
No peer dependency issues found
```

## 安装问题与最终处理

第一次使用 pnpm 默认 isolated linker 时，Windows 拒绝创建依赖内部符号链接并返回 `EPERM`。项目因此固定 `node-linker=hoisted`，不要求管理员权限或开发者模式。

第二次安装进入 pnpm 11 的依赖构建审查门禁。项目没有批准全部脚本，而是复用 DSH 官方白名单：只允许 `node-pty`、`koffi` 与 DSH 子进程包执行必要构建，明确拒绝 Google GenAI 与 Protobuf 的非必要脚本。安装随后完成。

真实 Agent 工具链第一次运行时，Windows ACL 沙箱把 `process.execPath` 当作 Node 启动器；Electron 中该值实际指向启动器 EXE，导致 `pwsh` 工具再次启动客户端启动器并超时。最终处理只精确识别官方 `dsh-sandbox-windows-acl` runner，并只给该子进程设置 `ELECTRON_RUN_AS_NODE=1`；目录选择 worker 保持原生对话框适配，其他子进程原样转发。第二个问题来自验证脚本先创建未归组会话：按官方接口改为先 `workspace.create`，再以返回的 `workspaceId` 调用 `session.create`，由 Host 原子完成会话归组。

持久终端首次验证时，`node-pty` 直接启动 ACL runner，未经过 `child_process.spawn` 适配，Electron EXE 因而再次被解释为桌面应用。启动器在当前 Profile 实际解析出的 `node-pty` 模块上增加同一精确 runner 适配后，Full access 下命令、文件和 Renderer 闭环通过。关闭仍存活的 ConPTY 时，DSH 的 Windows 强制回收链会使 Electron 在原生清理阶段退出；启动器因此在 Host 释放前请求已跟踪的交互式 shell 正常 `exit`，短暂等待后仍交回 DSH 原有生命周期。真实便携 smoke 随后以退出码 0 完成 PTY、Host 与端口清理。

依赖审计发现自动提升的 React 18 与 ReactDOM 19 不匹配；项目根按社区已验证口径同时固定为 18.3.1，`pnpm peers check` 随后无问题。

## 尚未完成

- ASAR 启动器、目录内当前 DSH 的便携启动，以及前台、后台、取消和 Full access 持久终端四条 Agent 工具链已通过门禁；NSIS 正式安装器的首次安装、覆盖、卸载和数据保留流程也已通过。
- Windows ACL 沙箱的前台与后台 `pwsh` 工具链及正式 `session.cancel` 已验证；持久终端在 Full access 下已验证。Workspace write 下，官方 ACL runner 作为 ConPTY 根进程时仍在启动阶段退出并返回 `PTY shell exited during startup`，当前不把该组合标记为通过。
- 正式打包运行已改为不覆盖 `DSH_HOME`，由 Harness 使用继承环境或 `~/.dsh`；源码和 smoke 仍保持隔离，尚未做正式数据目录下的双实例并发写入验证。
- 尚未实现 Profile 切换和正式插件安装；窗口与托盘生命周期的首个源码切片已完成。
- 尚未完成代码签名、使用更高公开版本的真实升级下载/重启和更新失败回滚；正式安装器覆盖安装流程已通过。

因此当前结论为：`0.1.2` 恢复正式 Harness 的默认数据目录与完整 Web Profile 配置，自动直达后明确显示当前 Harness，并继续满足本机源码、便携、工具链和安装器门禁；`0.1.0` 用户仍需先手动覆盖安装 `0.1.1` 或更高版本。`0.1.1` 到 `0.1.2` 的真实在线升级在本版本公开后执行，代码签名、更新失败回滚、Workspace write 持久终端和长期运行验证继续作为后续限制。
