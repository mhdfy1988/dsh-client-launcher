# 架构

## 当前 POC

```text
Electron main
  ├─ 单实例与退出协调
  ├─ app.asar：仅桌面壳代码
  ├─ 上一级目录：当前 DSH 已安装运行时或源码工作区
  ├─ 显式依赖安装与官方构建助手
  ├─ Profile 裸包解析适配
  ├─ Windows 目录选择请求的 Electron 原生适配
  ├─ app-boot + 隔离 desktop-poc Profile
  │    ├─ @deepseek-ai/dsh-base
  │    ├─ @deepseek-ai/dsh-web-app
  │    ├─ 当前 DSH 自带的 config/agent-presets
  │    └─ 最小 Desktop Cordis 插件
  ├─ 127.0.0.1:系统分配端口
  └─ sandboxed BrowserWindow
```

Electron 启动器位于 Cordis 外，负责定位上一级 DSH、检查运行时、必要时由用户触发官方构建，再启动插件树。壳通过当前 DSH 的安装锚点动态解析直接包；Profile 装配后注册可撤销的 Node 同步解析钩子，只为默认解析失败的裸包名使用 Profile 回退目录。Web Bundle 只声明 `agent-presets` 行，官方 CLI 还会把当前安装的 `config/agent-presets` 作为系统可信根注入该行；桌面壳执行相同的启动器装配，且在 `standard/preset.yml` 缺失时直接终止启动，避免工作区可创建但会话无法创建。`src/plugin.ts` 位于 Cordis 内，只注册一个可撤销 effect，用来证明 Desktop 自有能力能遵守官方插件生命周期。Agent、模型、会话、工具、权限和 Web 页面全部由当前目录的 Harness 提供。

DSH 的 Windows 原生目录选择器通过 `process.execPath` 启动 Node worker，但 Electron Host 中该值指向桌面可执行文件，而且官方 worker 的实际选中路径返回链在 Electron 子进程中不稳定。壳在 Node 内置 `spawn` 出口安装可撤销适配器：仅当命令是当前 Electron 可执行文件、且唯一参数明确指向 `@deepseek-ai/dsh-host-directory-picker-native/lib/worker.cjs` 时，使用 Electron `dialog.showOpenDialog` 打开单目录选择器，并生成只实现 DSH 所需 `message`、`error`、`exit`、`kill` 和 `unref` 行为的进程代理。代理发送既有 `{kind:'done', path}` 消息，取消时路径为 `null`；父进程环境、其他插件子进程和重启环境不变。

窗口与托盘由 Electron 主进程负责：主窗口关闭事件默认隐藏窗口，不销毁 Host；托盘菜单负责显示窗口、请求重启或统一退出；第二个实例只发送唤醒动作，不创建第二个 Host。托盘、窗口和 EXE 使用同一份多尺寸 Windows 图标；源 SVG 复用 DSH 官方鲸鱼路径并增加高对比圆形底板。托盘是桌面壳能力，不修改官方插件源码。

标题栏由壳层提供 36px 可拖动区域，窗口使用 `frame: false`，由沙箱 preload 绘制最小化、最大化/还原和关闭按钮；按钮区域不可拖动，标题栏空白区域支持拖动与双击最大化。按钮通过固定 IPC 命令调用当前 `BrowserWindow`，主进程拒绝非当前窗口发送者和协议外命令；关闭命令继续进入既有“隐藏到托盘”生命周期。沙箱 preload 优先读取 `--dsw-alias-bg-base`、`--dsw-alias-label-primary` 和 `--dsw-alias-state-business-primary` 的最终计算颜色；它只监听 DSH 主题呈现器实际修改的根节点属性、正文属性、头部样式与系统深浅模式，并把同一渲染帧内的变化合并到下一帧处理。首帧采样后再做一次下一帧确认；正文背景色或文字色存在皮肤过渡时，过渡完成或取消事件会再触发最终校正。主题节点变化还会启动一个不阻塞首帧的 450ms 尾随确认，用于皮肤规则被直接移除而浏览器不发送过渡事件的路径。背景、文字和强调色通过只写 IPC 发送给主进程，主进程校验并归一化不透明颜色后立即更新窗口背景；preload 同时用这些颜色呈现自绘按钮。皮肤未提供这些变量时回退到页面计算色和基础配色。会话内容等正文子节点变化不会触发标题栏重新采样。

## 数据所有权

源码 POC 强制覆盖当前进程的 `DSH_HOME`，固定写入仓库 `.poc/dsh-home`；Electron userData 固定写入 `.poc/electron-user-data`。便携包将两者写入 Electron 用户数据根，smoke 使用每轮独立目录。当前实现不支持共享用户正式 Harness home。

## 关闭顺序

`SIGINT`、`SIGTERM`、`before-quit`、托盘退出和 smoke 定时器最终都调用同一个控制器：

1. 销毁 BrowserWindow。
2. `host.fiber.dispose()` 释放整个 Cordis tree。
3. WebServer 关闭 HTTP 与 WebSocket。
4. Desktop 插件撤销 effect。
5. 撤销模块解析与目录选择适配器。
6. `app.exit(code)` 结束 Electron。

第二次退出请求会立即升级为强制退出；第一次优雅释放最多等待 5 秒。失败不会静默改用外部 `dsh web`。

## 后续边界

Profile 切换、插件安装、NSIS 安装器和更新器不属于当前 POC。托盘、隐藏/恢复窗口、窗口状态持久化、单实例唤醒、目录内 DSH 定位和显式构建助手已完成验证，仍需补充便携包原生 ABI 门禁、真实用户操作和安装器验证。
