# FaultDetect v1.3.0

## 桌面应用

- 新增 Electron 原生桌面窗口。
- 页面直接加载在应用窗口内，不再调用系统浏览器。
- 自动启动内置 JRE 和 Spring Boot 后端。
- 自动复用本机历史数据目录 `%LOCALAPPDATA%\FaultDetectSystem\data`。
- 端口已有服务时复用现有实例。
- 单实例运行，重复启动会聚焦已有窗口。
- 退出桌面端时自动关闭由本应用启动的后端。

## 保留能力

- 6 个左侧任务入口。
- 安全模式和目标授权确认。
- 7 步排障 Workflow。
- 观测层和归因层分离自检。
- 任务状态、负责人、备注、导出、删除和重新检测。
- LLM 模型设置和单次增强开关。
- 未知场景模式、研发交接包、自动场景学习和规则候选。

## 交付

- Windows x64 便携版 EXE。
- 内置 JRE、后端 jar 和桌面窗口。
- 不需要安装 Java、Node.js 或浏览器。
- 文件：`FaultDetect-1.3.0-portable.exe`
- 大小：166,975,625 bytes
- SHA-256：`91EF744644AD2FCE4F1721E6BE96D51A4ADA272AC49EEB7BAC3B1C82AC9BBE2A`
- 可执行 jar SHA-256：`B5EEBA36C69E5D6BC5D24043A835A6D2752CBEDC8D029BD28810DA54F0AE2D7E`
