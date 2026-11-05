# FaultDetect v1.3.1

## 修复

- 修复点击“开始检测”时直接弹出 `fail to fetch` 的问题。
- 本地诊断服务断开时，桌面端会自动重启后端并重试当前请求。
- 自动恢复失败时显示可执行的中文说明，不再暴露浏览器原生英文错误。
- 后端异常退出后会清理启动状态，避免后续重启被旧进程状态阻塞。

## 桌面端

- Electron 原生桌面窗口直接加载 FaultDetect。
- 自动启动内置 JRE 和 Spring Boot 后端。
- 不调用系统浏览器。
- 数据继续保存在 `%LOCALAPPDATA%\FaultDetectSystem\data`。

## 交付

- 文件：`FaultDetect-1.3.1-portable.exe`
- 大小：166,973,502 bytes
- SHA-256：`A0EEDA18EBDFC5386D9D7A515AF645B1D55478D0FA549DB1102147CCD0B5EAA2`
- 可执行 jar SHA-256：`08201A028DEE8C382F5D3F7E448D35695763A4BA1B6043845322E080EF641C3D`
- Windows x64 便携版，不需要安装 Java、Node.js 或浏览器。
