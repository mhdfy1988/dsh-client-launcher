# DSH Desktop 第 0、1 阶段验证

## 验证信息

- 日期：2026-08-27
- 仓库：`D:\deepseek\dsh-desktop-shell`
- Desktop：`0.0.1-poc.0`
- Electron：`43.4.0`
- Electron 内置 Node：`24.18.1`
- Node modules ABI：`148`
- DeepSeek Harness：`0.1.1-rc.2`
- Profile：隔离的 `desktop-poc`
- 数据：仓库 `.poc`，未读取或写入正式 `DSH_HOME`

## 已通过

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| 独立工程 | 通过 | 独立 Git 仓库、锁文件、`upstream.json`、CHANGELOG、架构和兼容文档存在 |
| 官方装配 | 通过 | 只使用发布包、`app-boot`、Web Profile 与 Bundle；官方源码未改动 |
| Desktop 插件 | 通过 | 最小 Desktop Cordis effect 每轮输出 mounted/unmounted |
| Renderer | 通过 | 无凭据隔离环境渲染标题 `DSH Local Build`，可见正文长度 56 |
| 生命周期 | 通过 | 20/20 冷启动和退出；每轮实际端口在退出后不可访问 |
| 失败恢复 | 通过 | 强制启动失败只产生 recovery ready，不产生主窗口 ready，随后完整释放 |
| 原生 ABI | 当前源码 POC 通过 | Electron 内普通 PowerShell、`node-pty`/ConPTY、`koffi`/Win32 调用成功 |
| 依赖闭包 | 通过 | `pnpm peers check` 无问题；React 与 ReactDOM 均固定为 18.3.1 |
| 残留检查 | 通过 | 验证后无本项目 Electron 进程，3082 未监听且未被 POC 使用 |
| 窗口生命周期首切片 | 通过 | 托盘初始化、窗口隐藏/恢复、窗口状态持久化、单实例唤醒和统一退出由 `smoke:window-state`、`smoke:single-instance` 验证 |
| 目录内运行时便携包 | 通过 | 全新官方 DSH checkout 完成 935 个依赖安装和官方构建；Shell 从上一级识别该工作区并完成页面启动和退出 |
| Windows 原生目录选择 | 通过 | Electron 原生选择器取消时返回 `done(path:null)`；选中全新测试仓库时返回 `done(path:"D:\\deepseek\\dsh-desktop-fresh-test")`；其他子进程与父进程环境不变 |
| 工作区选择与会话创建 | 通过 | Desktop 启动器从当前 DSH 注入 `config/agent-presets`；真实点击 `test` 后装载 `standard` 预设并创建空白会话，控制台无 `agent-preset-not-found` |
| 自绘标题栏与主题跟随 | 通过 | 沙箱 preload 读取 DSH 设计变量并发出主题事件；无边框窗口的自绘三键使用同一文字和强调色，支持拖动、双击最大化及最大化/还原状态同步，拖动区不绘制额外分隔线 |
| 第三方皮肤标题栏跟随 | 通过（`0.1.1`） | 在隔离 `desktop-poc` 配置档案实测“梦境仙游”浅色、“虚空低语”`rgb(13, 17, 20)` 和 Harness 默认 `rgb(255, 255, 255)` 三条路径的页面与标题栏最终颜色一致；`0.1.2` 已通过官方插件流程安装，等待当前窗口下次重启后人工复核 |

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
pnpm.cmd peers check
pnpm.cmd run versions
```

关键结果：

```text
tests 14, pass 14, fail 0
DSH_DESKTOP_PICKER_WORKER_READY
picker smoke message {"kind":"done","path":"D:\\deepseek\\dsh-desktop-fresh-test"}
DSH_DESKTOP_POC_ABI_OK {"electron":"43.4.0","node":"24.18.1","modules":"148","platform":"win32","arch":"x64"}
recovery smoke ok
window-state smoke ok
single-instance smoke ok
DSH_DESKTOP_POC_RENDERER_READY {"title":"DSH Local Build","bodyLength":56}
lifecycle 20/20 ok
No peer dependency issues found
```

## 安装问题与最终处理

第一次使用 pnpm 默认 isolated linker 时，Windows 拒绝创建依赖内部符号链接并返回 `EPERM`。项目因此固定 `node-linker=hoisted`，不要求管理员权限或开发者模式。

第二次安装进入 pnpm 11 的依赖构建审查门禁。项目没有批准全部脚本，而是复用 DSH 官方白名单：只允许 `node-pty`、`koffi` 与 DSH 子进程包执行必要构建，明确拒绝 Google GenAI 与 Protobuf 的非必要脚本。安装随后完成。

依赖审计发现自动提升的 React 18 与 ReactDOM 19 不匹配；项目根按社区已验证口径同时固定为 18.3.1，`pnpm peers check` 随后无问题。

## 尚未完成

- ASAR 壳与目录内当前 DSH 的便携启动已通过门禁；便携产物原生 ABI 和 NSIS 安装包仍属于发布门禁。
- 尚未验证 Windows ACL 沙箱工具的完整真实 Agent 调用链。
- 尚未接入正式 `DSH_HOME`，也没有做双实例并发写入验证。
- 尚未实现 Profile 切换和正式插件安装；窗口与托盘生命周期的首个源码切片已完成。
- 尚未完成代码签名、覆盖安装、更新或回滚。

因此当前结论仅为：第 0、1 阶段源码 POC 通过，第 2 阶段已完成首个窗口生命周期切片；不能称为正式 Desktop 已完成。
