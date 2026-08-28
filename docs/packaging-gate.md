# DSH 客户端启动器打包门禁

## 当前状态

目录内 DSH 模式的 Windows x64 便携包已通过启动门禁。客户端启动器封装在 `app.asar`，不再复制 DSH 运行时；便携目录放入目标 DSH 根目录的子目录后，默认使用上一级当前 DSH。启动器不修改官方 DSH 源码或任何插件。

验证使用从官方 GitHub 获取的全新 DSH checkout。构建助手在隔离目录完成 935 个 workspace 依赖安装和官方完整构建；修复源码 workspace 的 ESM 裸包解析后，目录内启动器在未设置 `DSH_DESKTOP_RUNTIME_DIR` 时完成官方 Web Profile 装载、页面就绪、Desktop effect 挂载与撤销、Cordis Host 释放和 Electron 正常退出。

Windows 原生目录选择器另有 Electron 进程语义差异：官方插件用 `process.execPath` 启动其 Node worker，而 Electron 中该路径是桌面 EXE；即使切换到 Electron Node 模式，实际选中路径的返回链仍不稳定。启动器只在精确匹配该 worker 路径时改用 Electron 原生单目录选择器，并按 DSH 既有 worker 协议返回 `done`；真实 Electron smoke 已验证取消返回 `path:null`，以及选中全新测试仓库后返回精确绝对路径。官方 DSH 源码和插件保持不变。

Windows ACL 沙箱 runner 同样由官方代码通过 `process.execPath` 启动。启动器不替换 runner，只在命令和官方包路径同时精确匹配时给该子进程设置 `ELECTRON_RUN_AS_NODE=1`；全新 DSH checkout 的真实 Agent smoke 已验证工作区模式下前台与后台 `pwsh` 经该 runner 执行、文件写入回读、正式会话取消、会话历史与 Renderer 投影。该变量不写入父进程，也不影响目录选择器或其他子进程。

持久终端从当前 DSH Profile 实际解析出的 `node-pty` 加载。启动器在 DSH 导入前只修正 ACL runner 的 Electron Node 启动语义，并跟踪该模块创建的活动 PTY；统一退出时先请求交互式 shell 正常结束，再调用 DSH 原有 Host 释放。Full access 下的官方 `minimal` 预设已在真实便携 EXE 中完成持久 PowerShell 命令、文件、会话历史、Renderer 和退出清理闭环。Workspace write 下的 ACL runner + ConPTY 组合仍在终端启动阶段失败，标准预设的一次性 PowerShell 不受此限制。

## 已排除的方案

直接把 DSH 放入 `app.asar/node_modules` 不可用。DSH Profile 会创建 Windows Junction，而 Junction 不能指向 ASAR 虚拟目录。仅解包 `node_modules` 也不可靠，因为启动器的静态导入与 Profile 解析会形成两套模块来源。复制完整外置运行时虽然可启动，但与“使用当前文件夹 DSH”的产品目标不符，已从当前方案删除。

当前实现不保留上述路径作为回退。上一级目录不是有效 DSH 或缺少构建产物时直接显示客户端选择/恢复页；只有识别为源码工作区时才显示构建按钮。

## 构建与验证

```powershell
pnpm.cmd run package:portable
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
```

`package:portable` 只把编译后的启动器放入 ASAR。正式目录布局把整个便携目录放在 DSH 根的 `client-launcher` 子目录；`DSH_DESKTOP_RUNTIME_DIR` 只用于开发或诊断时显式覆盖当前 DSH。

## NSIS 正式安装器验证

Electron Builder `26.15.3` 已作为安装器层接入，不替换当前经过验证的 `@electron/packager` 应用目录。`package:installer` 先重新生成具有正式产品名、应用标识、EXE 元数据和安装身份的便携目录，再用辅助模式 NSIS 包装；安装器不携带 DSH。

`smoke:installer` 只接受显式的隔离 DSH checkout。门禁开始前会检查正式版和历史 Preview 进程，发现任一客户端仍运行时明确失败，不自动终止用户进程。当前门禁覆盖当前用户首次静默安装、同目录覆盖安装、两轮安装后启动、桌面及开始菜单快捷方式生成、卸载、快捷方式与注册项清理和异步自删除等待，并核对用户数据保留、DSH `package.json` 与锁文件摘要不变、Git 工作区状态回到安装前。安装后的前台 Agent 工具链也已单独通过。

安装配置同时生成 `resources/app-update.yml`，正式打包版本由 `electron-updater` 使用该配置检查 GitHub 正式 Release；开发、便携和 smoke 会因未打包或显式禁用而跳过。发布必须同时上传正式 `latest.yml`、安装器和 blockmap；当前安装器未签名，真实升级下载、重启安装和失败恢复仍需单独验证。

启动器页面脚本会先从 HTML 模板生成，再执行 JavaScript 语法检查；安装版首次启动同时验证独立 `poc` 数据目录已创建，避免客户端注册表因父目录缺失而写入失败。

辅助安装器保留 Electron Builder 标准安装范围页，由用户选择“当前用户”或“所有用户”，随后把应用文件名作为子目录追加到用户选择的位置。DSH 布局仍由客户端启动器现有运行时检查统一判断；安装器不复制一套容易漂移的 DSH 识别逻辑，选错目录时应用快速失败并显示恢复页。当前 Windows 自动化控制器无法捕获 NSIS 原生窗口，读取界面时返回 `SetIsBorderRequired ... 不支持此接口`。人工试装已经验证“所有用户”范围、目录选择、安装注册项、公共桌面与公共开始菜单快捷方式和真实启动；自动化门禁另行覆盖当前用户快捷方式及卸载清理。

## 尚未完成

1. 跟进 Workspace write 下官方 ACL runner 与 ConPTY 的启动兼容性；在该组合可用前，不把受限持久终端计入发布能力。
2. 验证真实用户操作、长时间托盘驻留、睡眠恢复和系统关机退出。
3. 人工复核新版错误目录恢复操作；错误目录快速失败与严格目录边界已经通过，正确目录结构、打开当前安装位置和退出按钮已由单元测试覆盖。正常目录的辅助安装范围选择、目录选择和真实启动已经通过，快捷方式生命周期由自动化门禁覆盖。
4. 继续验证多客户端切换、默认客户端失效恢复和独立 `DSH_HOME` 的长期使用路径；首次配置与默认客户端自动直达已经完成人工验证。
5. 完成代码签名、公开 feed 的真实升级回归、更新失败回滚和版本兼容策略；自动检查与下载代码及正式更新配置已经接入。

完整的安装、首次使用、升级、卸载和问题处理步骤见 [客户端启动器使用说明](./client-launcher-usage.md)；本轮曾发现的内嵌脚本语法错误和安装版 `poc` 目录缺失问题也已记录在该文档中。

正式发布不代表代码签名、真实在线升级回归或正式 `DSH_HOME` 共享已经完成。
