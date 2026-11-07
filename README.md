# FaultDetect

FaultDetect 是一个面向**非技术业务人员和客户对接人员**的 Web HTTP 现场第一响应工作台。

当开发、运维或技术人员无法第一时间到场时，FaultDetect 帮助现场人员先完成任务复现、请求证据采集、问题层次判断和研发交接。产品以**可复现、可审计、只读安全**为约束，不替代最终根因确认和人工修复。

用户输入故障 URL、症状和可选认证信息后，系统执行 7 步标准检测、差分隔离实验和规则归因，输出包含现象、排查过程、结论、证据与验证动作的诊断报告。

它不是“聊天框加几个工具”，而是把 AI 放在明确边界内：

- 规则负责观测、权限、风险和归因骨架；
- LLM 默认关闭，只在用户主动开启且配置可用时补充分析；
- LLM 失败时自动降级，不影响规则结论；
- 所有目标请求只使用 GET / HEAD，不向被测系统写入数据。

## 当前验证状态

### 已验证

- 后端可以构建和启动，健康检查返回 `ok`。
- 观测层使用两套独立实现比对，严格一致为 **7/8**。
- 归因层使用 10 条固定事实，验证问题能落到正确层次，当前 **10/10**。
- 完整诊断链路返回状态码、检测步骤、差分实验、假设、证据、报告和历史记录。
- 无效 URL 返回 400，不会让服务崩溃。
- 桌面版包含内嵌 JRE，目标机器无需安装 Java。
- `FaultDetect-1.3.8-portable.exe` 已通过 Electron 桌面窗口启动验证，不再调用系统浏览器。
- 本地后端被终止后，桌面端可以自动重启并重试当前检测请求，不再直接显示 `fail to fetch`。
- 业务人员可以在应用内打开目标业务系统，点击“开始记录本次问题”后自动采集请求，不需要使用 F12。
- 采集窗口默认待机，只有本次问题记录期间的请求会进入候选列表；正常浏览不会混入。
- 左侧“使用教学”页提供内置模拟业务系统，可以直接演练正常请求、失败请求和提交类请求。
- 业务系统直接显示在 FaultDetect 主窗口内，不再单独弹出采集窗口。
- 汇报文本、研发交接包和请求交接信息使用 Electron 原生剪贴板。
- 检测结果默认只显示结论、建议和汇报，完整诊断流程按需展开，并可清除本次结果。
- POST/写请求可生成原始失败快照，包含脱敏响应体、Trace ID、耗时和初步问题层，但不会自动重放。
- 请求体证据默认关闭，确认后才采集并脱敏 Password、Token、手机号、证件号和 API Key。
- Trace ID 可复制，并可配置带 `{traceId}` 占位符的本地日志平台 URL 模板。
- “新增场景”支持保存前验证，展示是否会命中、当前最强对照场景和需要补充的区分特征。
- 状态码知识库支持按状态码、名称、说明、类别和排查建议搜索。
- 同一份未知场景报告重复归档时会返回已有场景，不再生成重复场景。
- 后端只监听 `127.0.0.1`，API 还会再次校验回环地址。
- 每次检测必须确认已获得目标系统授权。
- 历史任务支持状态、负责人、备注、导出、重新检测和单条删除。
- 支持在“模型设置”中写入本机 API Key、测试连接，并按单次检测选择是否启用 LLM 增强。

### 已知边界

- SC_08 独立真值为 `DNS_FAIL`，系统当前归入 `CONN_REFUSED / 网络不通`。层次正确，但粒度不足，因此严格统计为不一致。
- 观测层准确不等于最终根因一定正确。
- 归因层是固定用例验证，不代表所有真实系统都能一次定位。
- 当前没有第二个人独立完成现场验收，不宣称已有真实用户规模或商业验证。
- 外部系统行为、日志和数据库状态仍需按报告中的验证动作现场复核。

## 非技术人员怎么用

1. 打开左侧“使用教学”，先在内置模拟业务系统里走一遍。
2. 粘贴真实 Web 业务系统首页，在 FaultDetect 内置窗口里正常登录。
3. 进入目标页面后点击“开始记录本次问题”。
4. 点击出问题的业务按钮，系统会关联按钮文字和它触发的请求。
5. 完成采集后选择失败请求，确认授权并执行只读检测。

内置采集只监听 FaultDetect 自己的业务系统窗口，不会监听原来的 Chrome / Edge 页面，也不会监听手机或桌面原生 App。后两类场景分别需要浏览器扩展或 SDK / 代理接入。

- 内置采集会自动带入业务请求里的 Cookie、Authorization 和自定义认证头。
- URL 自身包含 token 查询参数时会按原 URL 发送，但常见敏感参数会进入历史前脱敏。
- 手动输入 URL 时，系统不会从用户原来的浏览器中自动读取 Cookie。
- POST 请求不会自动重放；失败快照用于第一层归因和研发交接，不替代服务端日志与 Trace 平台。
- 网页 DNS、连接拒绝、超时和证书错误会明确降级，不会一直停在加载中。
- 未知问题先进入未知场景模式；只有用户确认最终根因和解决动作后，才会归档到自定义场景库。

## 密钥边界与核对

- 仓库不包含真实 DeepSeek 或其他模型 Key。
- FaultDetect 的真实 Key 只保存在仓库外的 `%USERPROFILE%\.faultdetect\application.properties`。
- 2026-11-06 已核对当前工作区和全部 Git 历史，未发现当前实际使用的 DeepSeek Key。
- 界面只返回打码 Key，不返回明文；导出文件和运行日志也不包含 Key。

## 产品闭环

```text
输入 URL 与症状
    ↓
TCP / HTTP 并行观测
    ↓
状态码、响应体、异常类和关键信息提取
    ↓
只读差分隔离实验
    ↓
知识库匹配 + 通用规则多假设排序
    ↓
可复制诊断报告
    ↓
历史记录、现场复核与后续跟进
```

### 它到底能做什么

FaultDetect 的定位是 **Web HTTP 现场排障工作台**，不是所有系统都能自动修好的诊断器。

它能做：

- 在应用内打开 Web 业务系统，自动关联按钮和失败请求；
- 对 GET / HEAD 做只读探测、差分实验和分层归因；
- 对 POST 等写请求生成脱敏失败快照，不自动重放；
- 分析网络、HTTP、认证、权限、接口契约、服务、网关、数据库线索、业务码和前端表现；
- 输出证据链、假设、反证条件、验证动作和研发交接包。

它不能直接做：

- 自动修复、自动提交或自动修改目标系统；
- 监听原浏览器、手机 App、原生桌面客户端和系统级全部流量；
- 完整诊断 WebSocket、SSE、文件上传事务和一次性验证码流程；
- 替代服务端日志、APM、数据库审计和抓包。

完整能力矩阵和全部限制见：

- [能力与适配边界](docs/能力与适配边界.md)
- [1.3.0 到 1.3.8 产品迭代脉络](docs/迭代脉络-1.3.0到1.3.8.md)
- [FaultDetect 产品全景拆解](docs/FaultDetect-产品全景拆解-v1.3.8.md)
- 教学页的“全部内置可匹配故障场景”会动态展示当前 132 个场景名称。

失败路径同样被纳入产品：

- URL 不合法：直接返回明确错误。
- 目标不可达：停止推断不可观测的事实，转入服务与网络检查。
- 缺少实时数据：标记需要现场确认，不伪造。
- LLM 不可用：返回降级状态，保留规则结论。
- 观测粒度不足：保留差异，不用“宽容统计”掩盖。

## 核心能力

### 7 步排障 Workflow

1. 解析输入 URL；
2. 检查目标服务与端口；
3. 发起只读 HTTP 探测；
4. 分析状态码和响应内容；
5. 提取业务码、错误信息、异常类与堆栈线索；
6. 执行只读差分对照；
7. 生成证据链、假设排序和汇报文本。

### 观测层与归因层分开

| 层级 | 回答的问题 | 验证方式 |
| --- | --- | --- |
| 观测层 | 系统有没有看错状态码、超时、编码和连通性 | 8 条双实现真值用例 |
| 归因层 | 系统能不能把事实归到数据库、后端、前端、网络或配置层 | 10 条固定事实用例 |
| 结论层 | 最终根因和修复建议是什么 | 证据链、反证条件、验证动作与现场复核 |

把两层混成一个百分比，会让系统显得更准，但产品判断更差。因此 FaultDetect 分开呈现。

### 差分隔离实验

- 去掉认证头；
- 去掉全部自定义头；
- 更换 HEAD；
- 切换协议；
- 追加随机参数；
- 原样重放。

每次只改变一个变量，用对照组差异缩小问题层次。全部为幂等只读请求。

### 多假设而不是单一猜测

通用规则会输出多条候选假设，每条包含：

- 假设描述；
- 置信度；
- 支持证据；
- 反证条件；
- 可执行验证动作。

知识库命中只作为高置信快速路径，不能在证据不足时替代推理。

### 汇报与跟进

- 报告按“现象 / 排查过程 / 结论”组织；
- 支持一键复制；
- 检测历史保留 URL、状态码、归属和置信度；
- 可重新检测同一目标并对照前后结果。

### 知识库规模

当前内置 132 个故障场景和 59 个状态码，用于辅助匹配和教学。它们不是主卖点，也不能替代真实现场证据。

## AI 与规则边界

### 规则负责

- 目标和请求方法限制；
- 超时与失败状态；
- 用户数据隔离；
- 差分实验矩阵；
- 归因规则；
- 证据等级；
- 结论和报告结构。

### LLM 只负责

- 对已有事实补充解释；
- 补充验证动作；
- 在规则结论不足时提供候选思路。

LLM 默认关闭。未配置、网络不可达、超时或返回格式异常时，系统明确标记为降级，不伪造成功。

## 安全设计

- 目标请求只使用 GET / HEAD。
- 不执行登录、提交、删除、发送等写操作。
- 自定义请求头只允许合法名称，禁止换行注入。
- LLM 默认关闭，外部调用不是基础流程依赖。
- 配置中的 Key 通过环境变量或本地配置注入，不写入仓库。
- 运行数据、历史数据库、构建产物和 IDE 文件不进入 Git。

## 快速开始

### 桌面 EXE

双击 `FaultDetect-1.3.8-portable.exe`。程序会在 Electron 桌面窗口中直接打开界面，自动启动内置 JRE 和本地后端，不依赖系统浏览器。

目标机器无需安装 Java、Node.js 或浏览器。业务数据默认保存在 `%LOCALAPPDATA%\FaultDetectSystem\data\`。

GitHub Release 包：

- 大小：167,007,247 bytes
- SHA-256：`DC70CD351A4AFA53DD5F422DE7F83C83EB18E05443DF9A186C3E7986A1BA35A6`
- 下载：<https://github.com/KFLuv/FaultDetect/releases/tag/v1.3.8>

### 本地构建

```powershell
cd frontend-vue3
npm ci
npm run build

cd ..\java-backend
mvn clean package -DskipTests
java -jar target\fault-detect-system.jar
```

访问：

- 页面：<http://localhost:8000>
- 健康检查：<http://localhost:8000/api/health>
- 系统自检：<http://localhost:8000/api/selfcheck>

### Docker

当前正式定位为本机单用户安全模式。Docker 文件暂保留用于构建研究，不作为 v1.3.8 的受支持运行方式。

```bash
docker compose -f docker-compose-java.yml up -d
```

## API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/selfcheck` | 观测层与归因层自检 |
| GET | `/api/status-codes` | 状态码知识库 |
| GET | `/api/scenarios?code=500` | 场景列表 |
| POST | `/api/detect` | 执行诊断 |
| POST | `/api/add-scenario` | 新增自定义场景 |
| POST | `/api/scenario-preview` | 保存前验证自定义场景是否会被命中 |
| GET | `/demo/capture.html` | 内置教学业务系统 |
| GET | `/demo/api/ok` | 教学用正常查询 |
| GET | `/demo/api/error` | 教学用失败查询 |
| GET | `/demo/api/not-found` | 教学用 404 |
| GET | `/demo/api/unauthorized` | 教学用 401 |
| GET | `/demo/api/empty` | 教学用空数据 200 |
| GET | `/demo/api/unavailable` | 教学用 503 |
| POST | `/demo/api/post-error` | 教学用提交类请求，不自动重放 |
| GET | `/api/history` | 诊断任务列表 |
| GET | `/api/history/{reportId}` | 完整报告 |
| POST | `/api/history/{reportId}/follow-up` | 状态、负责人和跟进备注 |
| GET | `/api/history/{reportId}/export?format=json` | 导出 JSON |
| GET | `/api/history/{reportId}/export?format=markdown` | 导出 Markdown |
| DELETE | `/api/history/{reportId}` | 删除单条报告 |
| DELETE | `/api/history` | 清空历史 |
| GET | `/api/stats` | 统计信息 |

`POST /api/detect` 主要字段：

| 字段 | 说明 |
| --- | --- |
| `url` | 目标地址，必填 |
| `symptom` | 故障现象 |
| `headers` | 可选认证头 |
| `timeout` | 探测超时，范围 3 到 30 秒 |
| `authorized_target` | 必须为 `true`，确认已获目标系统授权 |
| `enable_service_check` | 是否检查 TCP 服务存活 |
| `enable_contrast` | 是否执行只读差分实验 |
| `enable_llm` | 是否请求可选 LLM 增强，默认关闭 |

### LLM 本机配置

- `GET /api/config/llm`：读取配置状态和打码 Key
- `POST /api/config/llm`：保存到 `%USERPROFILE%\.faultdetect\application.properties`
- `POST /api/config/llm/test`：测试 OpenAI 兼容接口

保存后立即更新当前进程配置。检测页未勾选 LLM 时，不发起模型请求，继续执行 7 步规则流程。

## 验证材料

- [v1.3.0 桌面回归报告](docs/testing/FaultDetect-Regression-desktop-v1.3.0.md)
- [v1.3.1 后端断线恢复验证](docs/testing/FaultDetect-Fetch-Recovery-v1.3.1.md)
- [v1.3.2 一键采集验证](docs/testing/FaultDetect-Capture-Assistant-1.3.2.md)
- [v1.3.2 一键采集原始结果](docs/testing/FaultDetect-Capture-Assistant-1.3.2.json)
- [v1.3.2 自定义场景预检验证](docs/testing/FaultDetect-Scenario-Preflight-1.3.2.md)
- [v1.3.4 内嵌采集与教学验证](docs/testing/FaultDetect-Embedded-Capture-1.3.4.md)
- [v1.3.4 真实网页兼容性验证](docs/testing/FaultDetect-Real-Sites-1.3.4.md)
- [v1.3.5 不可重放请求快照验证](docs/testing/FaultDetect-Response-Snapshot-1.3.5.md)
- [v1.3.6 请求体证据与兼容性验证](docs/testing/FaultDetect-Request-Evidence-and-Compatibility-1.3.6.md)
- [v1.3.7 功能复核与修复验证](docs/testing/FaultDetect-Review-Fixes-1.3.7.md)
- [v1.3.8 能力与适配边界验证](docs/testing/FaultDetect-Capability-Coverage-1.3.8.md)
- [能力与适配边界](docs/能力与适配边界.md)
- [浏览器 UI 冒烟结果](docs/testing/FaultDetect-UI-Smoke-20261106.json)
- [旧库迁移报告](docs/testing/FaultDetect-Migration-20261106.json)
- [LLM 增强验证](docs/testing/FaultDetect-LLM-Validation-20261106.md)
- [未知场景模式验证](docs/testing/FaultDetect-Unknown-Mode-20261106.md)
- [现场任务验收](docs/testing/FaultDetect-Field-Task-20261105.md)
- [可重复回归脚本](scripts/run-faultdetect-regression.ps1)
- [本地故障目标](scripts/faultdetect_mock_target.py)
- [v1.3.8 发版说明](RELEASE_NOTES_V1.3.8.md)
- [产品化完整验证](docs/testing/FaultDetect-Operational-Validation-20261106.md)
- [全功能验收报告](docs/testing/FaultDetect-Full-Acceptance-20261106.md)
- [安全边界](docs/security/SECURITY-BOUNDARY.md)

重新执行回归：

```powershell
.\scripts\run-faultdetect-regression.ps1 `
  -BaseUrl http://127.0.0.1:8000 `
  -Label desktop-v1.3.8

cd frontend-vue3
npm run test:ui
```

## 公开脱敏

公开版本已经：

- 将 Java 包名统一为 `com.faultdetect`；
- 移除组织名称、内部项目路径和内网地址；
- 将示例地址替换为文档专用保留地址；
- 排除数据库、构建产物、JRE、安装包和 IDE 文件。

知识库与示例用于演示通用排障方法，不代表任何组织的真实系统结论。

## 已知限制

1. DNS 与连接拒绝仍未细分，严格观测层为 7/8。
2. 状态码 200 时，归因仍依赖响应体与症状，可能进入启发式判断。
3. 当前没有传统单元测试体系，主要依靠固定自检、回归脚本和现场任务。
4. 差分实验会增加目标请求数量，不适合禁止重复请求的系统。
5. 真实日志、数据库和业务规则仍需现场授权后复核。
6. 当前不提供局域网多人模式，API 只接受本机回环地址。
7. 内置采集只覆盖在 FaultDetect 主窗口打开的 Web 系统。
8. 差分隔离实验会增加只读请求数量，因此改为高级选项并默认关闭。

## 面试时的项目表述

> FaultDetect 是一个以只读安全、可复现和可审计为约束的排障 Workflow。系统把观测层与归因层分开验证：观测层使用两套独立 HTTP 实现做严格对比，当前 7/8，已知差异是 DNS 解析与连接拒绝未细分；归因层用 10 条固定事实验证规则能否落到正确问题层次，当前 10/10。LLM 默认关闭，只作为补充层，失败自动降级。产品最终产出可复制的现象、排查过程和结论报告，并保留历史用于跟进。
