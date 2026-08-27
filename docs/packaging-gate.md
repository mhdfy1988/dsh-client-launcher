# Desktop 打包门禁

## 当前状态

目录内 DSH 模式的 Windows x64 便携包已通过启动门禁。Electron 壳封装在 `app.asar`，不再复制 DSH 运行时；便携目录放入目标 DSH 根目录的子目录后，默认使用上一级当前 DSH。壳不修改官方 DSH 源码或任何插件。

验证使用从官方 GitHub 获取的全新 DSH checkout。构建助手在隔离目录完成 935 个 workspace 依赖安装和官方完整构建；修复源码 workspace 的 ESM 裸包解析后，文件夹内 Shell 在未设置 `DSH_DESKTOP_RUNTIME_DIR` 时完成官方 Web Profile 装载、页面就绪、Desktop effect 挂载与撤销、Cordis Host 释放和 Electron 正常退出。

Windows 原生目录选择器另有 Electron 进程语义差异：官方插件用 `process.execPath` 启动其 Node worker，而 Electron 中该路径是桌面 EXE；即使切换到 Electron Node 模式，实际选中路径的返回链仍不稳定。壳只在精确匹配该 worker 路径时改用 Electron 原生单目录选择器，并按 DSH 既有 worker 协议返回 `done`；真实 Electron smoke 已验证取消返回 `path:null`，以及选中全新测试仓库后返回精确绝对路径。官方 DSH 源码和插件保持不变。

## 已排除的方案

直接把 DSH 放入 `app.asar/node_modules` 不可用。DSH Profile 会创建 Windows Junction，而 Junction 不能指向 ASAR 虚拟目录。仅解包 `node_modules` 也不可靠，因为壳的静态导入与 Profile 解析会形成两套模块来源。复制完整外置运行时虽然可启动，但与“使用当前文件夹 DSH”的产品目标不符，已从当前方案删除。

当前实现不保留上述路径作为回退。上一级目录不是有效 DSH 或缺少构建产物时直接显示恢复页；只有识别为源码工作区时才显示构建按钮。

## 构建与验证

```powershell
pnpm.cmd run package:portable
$env:DSH_DESKTOP_SMOKE_RUNTIME_DIR = 'D:\path\to\fresh-deepseek-harness'
pnpm.cmd run smoke:directory-picker
pnpm.cmd run smoke:portable
```

`package:portable` 只把编译后的壳放入 ASAR。正式目录布局把整个便携目录放在 DSH 根的 `desktop-shell` 子目录；`DSH_DESKTOP_RUNTIME_DIR` 只用于开发或诊断时显式覆盖当前 DSH。

## 尚未完成

1. 在便携产物内单独验证 PowerShell、`node-pty` 和 Windows ACL 相关原生能力；目录选择器的 Electron 原生适配已通过真实选择与取消 smoke。
2. 验证真实用户操作、长时间托盘驻留、睡眠恢复和系统关机退出。
3. 选择 NSIS 安装器并验证安装、覆盖安装、卸载和数据保留策略。
4. 完成代码签名、更新检查、更新失败回滚和版本兼容策略。

便携启动门禁通过不等于正式 Desktop 可以发布；当前仍不接入正式 `DSH_HOME`。
