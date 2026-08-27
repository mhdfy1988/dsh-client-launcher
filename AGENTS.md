# DSH Desktop Shell 协作规则

本仓库是 DeepSeek Harness 的独立 Windows 桌面宿主，不是官方 Harness 源码分叉。

- 禁止直接修改或复制后改写 `D:\deepseek\deepseek-harness-master` 的源码。
- Harness 只通过已发布 npm 包、公开导出、Profile、Bundle、Service 和 Client 扩展点接入。
- 源码 POC 使用仓库 `.poc` 下的隔离数据目录；打包产物使用 Electron `userData/poc`，两者都不读取或写入用户正式 `DSH_HOME`。
- 一个 Electron 进程只能拥有一个活动 Cordis Host；退出必须先释放 Cordis tree，再退出 Electron。
- Host 只绑定 `127.0.0.1` 与操作系统分配端口，不得监听 `0.0.0.0`。
- 不允许用外部 `dsh web`、无沙箱 PowerShell或强制杀进程作为静默回退。
- Electron Renderer 必须保持 `nodeIntegration: false`、`contextIsolation: true` 和 `sandbox: true`。
- 沙箱 preload 必须保持单文件自包含，或在构建时打成单文件；不得让 TypeScript 产物在运行时 `require` 相邻自定义模块。
- GUI 进程写入父进程拥有的诊断管道时必须忽略 `EPIPE`，但其他输出错误仍应显式失败。
- DSH 用 `process.execPath` 启动 Node 子进程时，必须先验证 Electron 语义；兼容处理只能精确匹配目标子进程，不得全局设置 `ELECTRON_RUN_AS_NODE`。
- 当前 POC 只保留已经验证的托盘、窗口状态、自绘标题栏和主题同步；更新器、插件市场和安装器必须等发布阶段单独设计并验证。
- 新行为需要对应测试和文档；版本发布前维护 `CHANGELOG.md`。
- 文档校验必须显式枚举 `docs/` 和根文档；不得从仓库根递归后再过滤 `node_modules`、`lib` 或 `.poc`。
