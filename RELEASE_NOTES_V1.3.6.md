# FaultDetect v1.3.6

## 现场诊断证据补全

- 请求体证据默认关闭，用户确认后才捕获 POST/PUT/PATCH/DELETE 请求体。
- Password、Token、Secret、API Key、手机号和证件号自动脱敏。
- 请求快照展示脱敏请求体、Content-Type、响应体、状态和耗时。
- 请求体只用于当前进程内分析和交接，不进入历史数据库。

## Trace 日志入口

- Trace ID 支持一键复制。
- 支持配置日志查询 URL 模板，例如：
  `https://log.example.com/search?traceId={traceId}`
- 模板只保存在本机 localStorage。
- 支持生成 Trace ID + 操作 + 接口 + 状态 + 问题层 + 下一步的交接包。

## 企业环境降级

- 连接拒绝、DNS、断网、超时、证书和进程崩溃会显示明确错误页。
- 对 Chromium 内置错误页增加文本识别兜底，避免一直停留在加载状态。
- SSO/OAuth/SAML/Okta/Microsoft 登录弹窗允许作为应用内认证窗口打开。
- 客户端证书错误不会被自动绕过。
- 系统代理、VPN、MFA、客户端证书和企业策略仍需目标环境实测。

## 范围

- 支持 HTTP/HTTPS、XHR/Fetch、失败页面导航、GET 自动诊断和 POST 原始快照。
- 不覆盖 WebSocket、SSE、手机 App 和 Windows 原生客户端。

## 交付

- 文件：`FaultDetect-1.3.6-portable.exe`
- 大小：167,010,699 bytes
- SHA-256：`B046631DED8191B47929B5C16A5079BEF669D6AE796EA06D119B6CC52F48E576`
- 可执行 jar SHA-256：`37884D550E52D729209A85B525A39252CB9976477699EF50F0D51A9A88FFD5B3`
- Windows x64 便携版，不需要安装 Java、Node.js 或浏览器。
