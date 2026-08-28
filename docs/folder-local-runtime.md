# DSH 客户端启动器：目录内运行时与构建助手

## 状态

目录内运行时、源码工作区检查、显式构建助手和解析适配已经实现，并在全新官方 DSH checkout 上通过便携启动 smoke。

## 目录约定

客户端启动器安装在目标 DSH 根目录的 `client-launcher` 子目录：

```text
deepseek-harness/
├─ package.json
├─ node_modules/ 或 apps/cli/node_modules/
├─ packages/ 与 apps/                 # 源码工作区才有
└─ client-launcher/
   ├─ dsh-client-launcher.exe
   └─ resources/app.asar
```

打包后的启动器默认把自身目录的上一级作为 DSH 根目录。`DSH_DESKTOP_RUNTIME_DIR` 可为开发和诊断显式指定另一目录；未设置时不搜索磁盘、不连接其他 DSH 实例，也不回退到启动器内副本。源码运行默认使用启动器自身固定的开发依赖。

## 支持的 DSH 布局

### 已安装运行时

根目录包含 `package.json` 与 `node_modules/@deepseek-ai/dsh/package.json`。启动器从该包清单建立模块解析器，并验证 app-boot、cmdline、launch-environment 和 host-webserver 的公开入口。

### 官方源码工作区

根目录包含 `package.json`、`pnpm-lock.yaml`、`pnpm-workspace.yaml` 与 `apps/cli/package.json`。源码工作区的发布包不位于根 `node_modules`；启动器以 `apps/cli/package.json` 为安装锚点，通过 `apps/cli/node_modules` 解析工作区包，并要求相关 `lib` 入口已经生成。

## 启动状态

```text
定位目录
  → 识别已安装运行时或源码工作区
  → 验证必要包和构建产物
  → 就绪：启动隔离 Profile 与 Host
  → 未就绪：显示诊断和显式构建操作
```

不满足任一条件时快速失败。启动器不自动选择其他版本，也不保留 `resources/dsh-runtime` 静默回退。

## 构建助手

构建助手只面向识别成功的官方源码工作区，并且只能由用户在恢复页明确触发：

1. 校验当前 Electron Node 版本满足 DSH `engines.node`。
2. 如果工作区依赖入口缺失，运行 `pnpm.cmd install --frozen-lockfile`。
3. 运行仓库现有的 `pnpm.cmd run build`。
4. 重新执行运行时就绪检查。
5. 成功后重启客户端启动器；失败时保留完整命令输出，不回退其他运行时。

构建助手不编辑 DSH 源码、配置或插件。依赖安装会更新 `node_modules`，构建会生成或更新 `lib` 等产物；恢复页必须在执行前明确提示这两类写入。

Electron 的 Node 私有 ESM Loader 在 Cordis 内不可用时，启动器注册一个进程内同步解析钩子：先执行 Node 默认解析，只有裸包名失败时才改用 Profile 的 `profiles/node_modules` 回退目录。钩子随 Host 退出撤销，不写入 DSH 目录，也不改变插件内容。

## 不变式

- 客户端启动器不复制、改写或补丁 DSH 源码。
- DSH 包、Profile 模块回退和 Cordis 插件树来自同一个运行时根。
- Host 仍只绑定 `127.0.0.1` 与系统分配端口。
- 运行数据仍使用启动器隔离目录，不自动接入正式 `DSH_HOME`。
- 构建失败可见，且不会触发外部 `dsh web`、内置副本或其他安装目录回退。

## 验证隔离

实现验证必须从官方 GitHub 重新获取一个全新 DSH checkout。不得在用户当前使用的 DSH 目录执行依赖安装、构建、启动或 Profile 写入。测试 checkout、依赖、构建产物和运行数据均使用独立目录；测试 Host 使用随机回环端口，不占用或替换当前 3082 服务。

## 源码证据

- DSH `packages/boot/app-boot/src/profile.ts`：Profile 模块回退由安装锚点的依赖闭包生成。
- DSH `packages/boot/app-boot/src/index.ts`：`bareModuleBaseUrl` 只在 Node 私有 ESM Loader 可用时改变裸包解析基准。
- [Node.js `node:module` 文档](https://nodejs.org/api/module.html#moduleregisterhooksoptions)：同步 `registerHooks()` 支持可撤销的 `resolve` 钩子，注册后应使用动态导入加载需要适配的模块。
