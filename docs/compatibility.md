# 兼容性基线

| 项目 | 固定版本或范围 | 当前结论 |
| --- | --- | --- |
| Windows | Windows 11 x64 | POC 目标；Windows 10 未验证 |
| Node.js | `^22.19.0 || >=24.0.0` | 本机 Node 24.14.0 符合 |
| Electron | `43.4.0` | 已锁定，需持续验证内置 Node 和原生 ABI |
| DeepSeek Harness | `0.1.1-rc.2` | 已锁定，不承诺其他 RC 兼容 |
| pnpm | `11.7.0` | 已锁定 |
| React / ReactDOM | `18.3.1` / `18.3.1` | Desktop 根显式固定，避免发布闭包错误提升 ReactDOM 19 |
| Profile | `desktop-poc` | 只位于隔离 `.poc/dsh-home` |
| Web Host | `127.0.0.1:0` | 不支持 LAN 或远程访问 |

普通 Cordis Host/Client/Bundle 插件预计不需要重新打包 Desktop，但必须在第 3 阶段逐个完成最终 Electron 产物 smoke。带 `.node`、DLL、驱动或 Electron 主进程依赖的插件不在该保证内。
