# DSH 客户端启动器 Windows 安装器与发布流程

> 状态：`0.1.2` 使用固定的正式产品身份、未签名 NSIS 安装器和 GitHub 正式更新通道；最终 ASAR 的自动更新器加载门禁与本机安装生命周期门禁已经通过，`0.1.1` 到 `0.1.2` 的真实在线升级在本版本公开后验证，代码签名和从旧 Preview 迁移尚未完成。

## 1. 目标与范围

本项目为 DeepSeek Harness 提供独立的 Windows 客户端启动器。安装器只交付 Electron 启动器，不携带、不复制、不构建也不修改 DeepSeek Harness 源码、运行时、配置或插件。

第一版要验证完整闭环：

1. 从已通过便携门禁的启动器构建 Windows x64 应用目录。
2. 生成支持用户选择安装根目录的 NSIS 安装器。
3. 把启动器安装到用户指定 DSH 根目录下的专属子目录。
4. 验证首次安装、覆盖升级、卸载和数据保留。
5. 生成并校验正式产物，先创建 GitHub 草稿 Release，核对后再公开。

自动更新检查与下载已经接入第一版；正式 Release 同时提供 `latest.yml`、安装器和 blockmap。代码签名、真实升级回归、更新失败回滚和旧 Preview 数据迁移必须继续单独设计和验证。

内部兼容说明：当前仓库名、npm 包名、部分环境变量和历史诊断标识仍使用 `dsh-desktop-shell` / `DSH_DESKTOP_*`。它们是技术标识，不代表对外产品名称；用户可见名称统一为“DSH 客户端启动器”。

## 2. 与 Todo 项目的关系

Todo 项目已经验证“隔离候选包 → 本机试装 → CI 构建 → 草稿 Release → 校验产物 → 正式发布”的顺序。本项目复用这套发布纪律，但不复用 Tauri 的构建命令、更新签名或 `latest.json` 格式。

| 项目 | Todo | DSH 客户端启动器 |
| --- | --- | --- |
| 桌面框架 | Tauri | Electron |
| Windows 安装器 | Tauri NSIS | Electron Builder NSIS |
| 应用内容 | 应用自身完整运行时 | 只有启动器，DSH 仍由所在目录提供 |
| 安装位置 | 独立应用目录 | 用户指定的 `DSH 根目录\client-launcher` |
| 更新元数据 | Tauri `.sig` 与 `latest.json` | `electron-updater` 使用 Electron Builder 生成的 `latest.yml` |
| 签名 | Tauri updater 签名与 Windows 代码签名分开 | `0.1.2` 尚未签名；后续接入 Windows Authenticode，自动更新信任链单独确认 |

## 3. 安装、升级与卸载不变式

- 安装器不得下载、复制、构建或修改 DSH。
- 安装器不得安装、启用、停用或卸载任何 DSH 插件。
- 安装目录只能是用户明确选择的 DSH 根目录下的专属启动器子目录。
- 升级只能替换启动器目录中的产品文件，不得清理 DSH 根目录中的其他内容。
- 卸载只能删除启动器安装目录、快捷方式和本产品注册项，不得删除 DSH、插件、工作区或用户数据。
- 安装失败必须显式报错，不搜索其他 DSH，也不回退到内置副本。
- 便携门禁是安装器的前置条件；安装器不得掩盖便携应用本身的启动失败。
- 已公开的版本和安装器视为不可变产物；修复必须提升版本号并创建新 Release。

## 4. 技术实现

当前实现采用 `electron-builder` `26.15.3` 的 NSIS target：

- 使用维护中的默认 NSIS 脚本，只通过 `include` 宏补充本项目所需的目录检查和卸载边界，不复制整份安装脚本。
- 使用辅助安装模式，设置 `oneClick: false`，让用户明确确认安装位置。
- 保留 Electron Builder 标准安装范围页，由用户选择“当前用户”或“所有用户”；“所有用户”按标准流程请求管理员权限。
- 无论安装范围如何，安装器都只写入用户选择的 DSH 根目录下的 `client-launcher` 子目录；运行数据仍按当前 Windows 用户隔离。
- 启动器首次启动进入客户端选择页。用户明确选择并启动某个 DSH 后保存默认客户端；后续启动前重新检测，检测通过才直接进入。正式打包运行不覆盖 `DSH_HOME`，由当前 Harness 使用继承环境或 `~/.dsh`；源码和 smoke 才使用隔离 `DSH_HOME`。
- 不采用 `nsis-web`；第一版安装器必须包含完整启动器载荷并支持离线安装。

`@electron/packager` 便携构建已经通过真实 DSH 工具链门禁，因此安装器只包装重新生成的正式便携目录，不替换应用打包入口。安装后的 EXE 复用相同的便携 smoke 和 Agent 工具链验证，避免维护两个行为不同的应用产物。

## 5. 目录与身份

正式目录布局：

```text
deepseek-harness/
├─ package.json
├─ node_modules/ 或官方源码工作区
└─ client-launcher/
   ├─ dsh-client-launcher.exe
   ├─ resources/
   │  └─ app.asar
   └─ 其他 Electron 运行文件
```

辅助安装器要求用户选择 DSH 根目录，并由 Electron Builder 的 NSIS 模板追加 `client-launcher` 子目录。旧 Preview 使用独立的 `dsh-client-launcher-preview`，不会被正式安装器覆盖。安装器不复制 DSH 布局解析规则，当前目录是否属于受支持的已安装运行时或官方源码工作区，仍由启动器启动时的既有检查统一判断；选错目录时快速失败并显示恢复页，不搜索其他 DSH。

候选试装包与正式包必须使用不同身份：

| 字段 | 候选试装 | 正式发布 |
| --- | --- | --- |
| 产品名 | `DSH 客户端启动器（预览版）` | `DSH 客户端启动器` |
| 应用标识 | `local.dsh.client.launcher.preview` | `local.dsh.client.launcher` |
| EXE 名称 | `dsh-client-launcher-preview.exe` | `dsh-client-launcher.exe` |
| 默认子目录 | `dsh-client-launcher-preview` | `client-launcher` |
| 安装器文件名 | `DSH-Client-Launcher-Preview-<version>-<arch>-setup.exe` | `DSH-Client-Launcher-<version>-<arch>-setup.exe` |
| 用户数据 | 独立候选目录 | 正式目录，版本间保持稳定 |

正式应用标识、产品名和用户数据目录一旦公开发布即属于兼容事实，后续不得随意替换。

## 6. 用户流程

### 第 1 轮：候选试装

1. 运行类型、单元、恢复页、窗口、目录选择、便携和 Agent 工具链门禁。
2. 生成未签名候选 NSIS 安装器。
3. 安装到全新测试 DSH checkout 的 `dsh-client-launcher-preview` 子目录。
4. 启动真实安装产物，验证工作区、会话、一次性 PowerShell、后台任务、取消、Full access 持久终端、皮肤标题栏、托盘和统一退出。
5. 完成验证后卸载候选包，确认没有修改或删除测试 DSH 与插件。

### 第 2 轮：首次正式安装

1. 用户从 GitHub Release 下载完整 NSIS 安装器。
2. 用户选择本机 DSH 根目录，而不是启动器子目录或仅含单个 EXE 的目录。
3. 安装器验证目录并安装到 `client-launcher`。
4. 用户从开始菜单、桌面快捷方式或安装目录启动 DSH 客户端启动器。
5. 启动器执行目录内运行时检查；不满足条件时显示诊断和构建入口，不搜索其他 DSH。
6. 首次选择并启动 DSH 后，后续启动可在检测通过时直接进入；使用说明见 [客户端启动器使用说明](./client-launcher-usage.md)。

### 第 3 轮：覆盖升级

1. 关闭窗口并从托盘执行统一退出，确认 Electron 和 Cordis Host 已释放。
2. 运行更高版本安装器并选择同一 DSH 根目录。
3. 安装器只替换启动器目录内的产品文件。
4. 重启后验证版本、窗口状态、皮肤、工作区和会话数据仍然存在。
5. 验证 DSH 版本、源码、构建产物和插件目录摘要未发生变化。

### 第 4 轮：卸载

1. 从 Windows“已安装的应用”卸载“DSH 客户端启动器”；旧 Preview 仍使用自己的独立卸载项。
2. 删除启动器文件、快捷方式和本产品卸载注册项。
3. 默认保留用户数据，避免误删会话和设置；需要清理时由后续显式入口单独确认。
4. 验证 DSH 根目录、插件、工作区和用户数据均未被连带删除。

## 7. 构建命令与产物

在仓库根目录执行：

```powershell
pnpm.cmd install
pnpm.cmd run typecheck
pnpm.cmd test
pnpm.cmd run smoke:recovery
pnpm.cmd run smoke:portable
pnpm.cmd run smoke:agent-toolchain
pnpm.cmd run package:installer
```

所有会执行 `clean` 或 `build` 的门禁必须串行运行；并行执行会同时删除和生成 `lib`，在 Windows 上产生 `EPERM`，该错误不代表应用生命周期失败。

主要产物：

- 便携目录：`.artifacts/portable/dsh-client-launcher-win32-x64/`
- 正式安装器便携目录：`.artifacts/portable-release/dsh-client-launcher-win32-x64/`
- 正式安装器：`.artifacts/installer/DSH-Client-Launcher-<version>-x64-setup.exe`
- 更新元数据：`.artifacts/installer/latest.yml` 与同名安装器 `.blockmap`

`0.1.2` 安装器大小为 `100,063,722` 字节，SHA-256 为 `07E318B88BC5A1555D34F95E630BDF0CE18B4A6298658F74B9DCF5D45615FD9A`。`latest.yml`、安装器和 blockmap 的版本与文件名一致。`0.1.0` 的历史安装器因未携带自动更新器依赖不能自行升级；`0.1.1` 保留为本次真实 GitHub 自动更新测试起点。

安装器生命周期验证只接受显式隔离的全新 DSH checkout：

```powershell
$env:DSH_DESKTOP_INSTALLER_SMOKE_RUNTIME_DIR = 'D:\path\to\fresh-deepseek-harness'
pnpm.cmd run smoke:installer
```

该 smoke 会先拒绝任何仍在运行的新旧启动器进程，再覆盖当前用户首次安装、同目录覆盖安装、安装后启动、快捷方式、卸载、注册项清理、用户数据保留以及 DSH 文件边界校验。所有用户范围、非静默目录选择和错误目录恢复页仍需要人工复核。

机器上已经安装正式产品且需要保留该版本进行真实自动更新时，不运行同产品身份的安装器生命周期 smoke；它会改写正式卸载注册项和快捷方式。此时复用上一版本已通过的 NSIS 生命周期证据，并要求本版本通过最终 ASAR 更新器加载、便携运行、资产摘要和公开 Release 资产校验。

## 8. 实现阶段

### 阶段 A：安装器基线（已完成）

- 接入 Electron Builder 和独立配置。
- 固定正式版本、产品名、应用标识、图标和输出文件名。
- 生成独立正式便携目录与未签名 NSIS 安装器。
- 让现有便携 smoke 覆盖安装后的应用目录，证明 NSIS 没有改变应用行为。

### 阶段 B：目录约束与卸载边界（自动化已完成）

- 使用 Electron Builder 辅助安装模板固定应用子目录；DSH 识别继续复用启动器现有检查，不在 NSIS 中复制。
- 明确进程仍在运行时的失败提示，不强杀 DSH 或 Electron 进程。
- 验证安装、覆盖安装和卸载只接触产品拥有的文件。
- 建立安装前后 Git 状态、`package.json` 和锁文件摘要对照。

### 阶段 C：安装器实机门禁（部分完成）

- 在全新 DSH checkout 上完成完整工具链回归。
- 已完成正式身份的当前用户首次静默安装、同目录覆盖安装和卸载；早期 Preview 人工试装已验证“所有用户”范围、目录选择和安装后真实启动，正式身份仍需补一次非静默人工复核。
- 仍需补充普通用户权限、中文路径、空格路径、非系统盘路径、长时间托盘驻留、睡眠恢复和系统关机退出验证。

### 阶段 D：正式发布流水线（当前为手动流程）

- 每个版本先在本机隔离 DSH checkout 运行锁定依赖与安装器门禁；GitHub Actions 自动化留待后续。
- 校验 `package.json`、安装器配置、CHANGELOG 和标签版本一致。
- 从 `CHANGELOG.md` 当前版本段生成 Release 正文。
- 构建安装器并生成 SHA-256 摘要。
- 先创建草稿 Release，回读核对版本、正文、文件名、大小和摘要。
- 所有校验通过后再转为正式 Release；失败时保留草稿，不进入 Latest。

### 阶段 E：签名与自动更新（自动更新代码已接入）

- 评估受支持的 Windows Authenticode 签名服务。
- 签名凭据只保存在受控 CI Secrets 或签名服务中，不进入仓库。
- 启动器已接入 `electron-updater`：仅在打包资源存在 `app-update.yml` 时启动检查，发现更新后自动下载，下载完成由用户确认重启安装。
- 正式发布仍需单独验证检查频率、用户确认、下载状态、安装重启、失败恢复和版本兼容。
- 自动更新只接受正式 NSIS 产物和 `latest.yml`；不得移植 Todo 项目的 Tauri `.sig` 或 `latest.json`。
- 更新失败不得静默运行旧安装逻辑；失败状态、日志和人工恢复路径必须可见。

## 9. 发布门禁

- [ ] 当前工作区没有未解释的发布相关改动。
- [ ] 版本与 `CHANGELOG.md` 当前版本段一致。
- [x] 类型检查、单元测试和恢复页脚本语法检查通过。
- [x] 全新 DSH checkout 的前台、后台、取消和 Full access 终端工具链已在便携门禁通过。
- [x] 便携目录与正式安装后的应用行为一致。
- [x] 首次安装、同目录覆盖、卸载和数据保留通过。
- [x] 安装和卸载前后的 DSH Git 状态、包清单与锁文件摘要一致。
- [x] 正式安装器文件名、版本和 SHA-256 由生命周期 smoke 输出。
- [x] 当前用户静默安装、快捷方式生成和卸载清理由生命周期 smoke 验证。
- [ ] 正式身份的“所有用户”范围、非静默目录选择、安装路径、卸载注册项、应用启动和隔离用户数据完成人工复核；早期 Preview 已覆盖同一 NSIS 流程。
- [x] 错误目录快速失败，明确报告缺失的 DSH 根标记，不搜索其他 DSH，也不回退内置副本。
- [x] 自动更新协调器在安装包中生成 `app-update.yml`，最终 `app.asar` 由真实 Electron 成功加载 `autoUpdater`；开发、便携和 smoke 环境跳过检查。
- [ ] 新版错误目录恢复操作完成人工复核；当前 Windows 自动化控制器无法捕获 NSIS 原生窗口，曾返回 `SetIsBorderRequired ... 不支持此接口`。
- [ ] 正式签名阶段启用后，安装器和主 EXE 的签名均通过独立验证。
- [ ] 公开 GitHub Release 提供 `latest.yml`、安装器和 blockmap，并核对文件名、版本、大小与摘要。
- [ ] 使用后续更高正式版本完成真实下载、确认重启和失败恢复验证。
- [ ] 草稿 Release 正文和资产核对通过后才公开。

Workspace write 下 ACL runner 与 ConPTY 的已知限制必须继续写入 Release 说明；在官方组合可用前，不能把该权限模式下的持久终端列为正式支持能力。

## 10. 本轮问题总结

| 问题 | 根因 | 最终处理 | 用户侧表现 |
| --- | --- | --- | --- |
| 添加客户端、选择客户端按钮无响应 | 内嵌 HTML 脚本的换行转义在模板展开后变成了非法 JavaScript | 生成后先做脚本语法检查，并将换行拼接改为安全表达式 | 客户端选择页按钮可以点击，错误会进入可见诊断 |
| 安装版注册客户端时报 `ENOENT` | 安装版首次运行时只创建了用户数据目录，没有创建其父级 POC 目录 | 主进程启动时显式创建 `poc` 和用户数据目录 | 首次安装后可保存客户端记录 |
| Windows 目录选择失败 | 官方 Node worker 在 Electron 中继承了桌面 EXE 的 `process.execPath` 语义 | 只对精确匹配的目录选择入口改用 Electron 原生文件夹选择器，保持 DSH 消息协议 | 选择目录后返回精确路径，不影响其他子进程 |
| ACL 工具再次启动桌面 EXE | Electron 的 `process.execPath` 被官方 runner 当作 Node 使用 | 仅对精确匹配的官方 ACL runner 设置 `ELECTRON_RUN_AS_NODE=1` | 一次性 PowerShell 工具链可运行，其他进程不受影响 |
| ConPTY 退出导致 Electron 异常 | 活动 PTY 在 Host 释放时仍存活，触发 Windows 原生回收链 | 统一退出前先请求活动交互式 shell 正常结束，再释放 Host | Full access 持久终端可正常清理 |
| `--prepackaged` 安装器缺少 `app-update.yml` | Electron Builder 的常规 `onAfterPack` 更新配置钩子不会在预打包目录模式下执行 | 打包脚本在 NSIS 调用前写入配置并在安装器 smoke 中回读校验，同时检查 `latest.yml` | 安装后的启动器具备 GitHub feed 配置，未配置时仍跳过网络检查 |
| 主题切换后标题栏变色慢 | 过度防抖和颜色过渡延迟了最终计算样式采样 | 改为下一渲染帧合并刷新，并增加必要的尾随确认 | 标题栏更快跟随 DSH 主题和皮肤 |
| 卸载 smoke 偶发报告快捷方式残留 | NSIS 自删除进程删除安装目录和快捷方式的时序不同，目录消失不代表快捷方式已经完成清理 | 门禁在安装目录消失后继续有界等待桌面和开始菜单快捷方式消失 | 不把异步清理时序误判为卸载边界失败 |
| 卸载器返回成功但没有卸载测试实例 | 静默安装没有固定安装范围，实际写入“所有用户”，测试却固定按“当前用户”卸载 | 首次安装、覆盖安装和卸载统一显式使用 `/currentuser` | 自动化安装范围稳定，卸载目标与安装记录一致 |
| 客户端窗口仍打开时进入卸载验证 | 进程检查只匹配隔离安装目录，漏掉旧版正式安装目录中的进程 | 门禁同时检查正式 EXE 与历史 Preview 名称，发现运行实例就停止并提示用户关闭，不自动杀进程 | 不再带着用户正在使用的客户端执行安装或卸载 |
| `0.1.0` 启动后提示缺少 `electron-updater` | 便携暂存目录只复制了启动器代码，最终 ASAR 没有生产依赖；既有 smoke 又显式关闭了更新检查 | 在隔离暂存目录只安装更新器生产依赖，并在真实 Electron 中从最终 ASAR 加载 `autoUpdater` | `0.1.1` 启动不再暂停自动更新；`0.1.0` 需手动覆盖安装一次 |

详细的首次配置、启动、切换、升级、卸载和故障处理步骤见 [客户端启动器使用说明](./client-launcher-usage.md)。

## 11. 参考依据

- Electron Builder NSIS 配置与自定义宏：<https://www.electron.build/nsis/>
- Electron Builder `26.15.3` 的辅助安装模板在 `oneClick: false` 且未强制所有用户时固定插入安装范围页；官方配置没有“保留辅助安装和目录页但强制当前用户”的对称选项，因此不接管整份 NSIS 模板实现私有分支。
- Electron Builder 自动更新：<https://www.electron.build/docs/features/auto-update/>
- Electron Windows 代码签名：<https://www.electronjs.org/docs/latest/tutorial/code-signing>
- Todo 项目既有流程：`D:\learn_code\todo\docs\Windows发布与自动更新-v0.1.md`
