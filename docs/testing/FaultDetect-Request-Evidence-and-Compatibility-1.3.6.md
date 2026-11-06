# FaultDetect v1.3.6 请求体证据与兼容性验证

日期：2026-11-07
验收对象：`FaultDetect-1.3.6-portable.exe`

## 请求体证据

- 请求体默认关闭。
- 用户确认后捕获 POST/PUT/PATCH/DELETE 请求体。
- Password、Token、Secret、API Key、手机号和证件号在展示前脱敏。
- 快照包含请求体、Content-Type、响应体、状态、耗时和 Trace ID。
- 请求体不进入历史数据库，只用于当前会话和研发交接。

## Trace 日志入口

- Trace ID 支持一键复制。
- 支持本地保存日志 URL 模板。
- `{traceId}` 或 `{trace_id}` 会替换为当前 Trace ID。
- 模板只保存在本机 localStorage。

## 兼容性降级

- 连接拒绝、DNS 失败、断网、超时、证书和网页进程异常会显示明确错误页。
- Chromium 内置错误页会被识别并转为中文兼容性提示。
- SSO/OAuth/SAML/Okta/Microsoft 登录弹窗允许作为应用内认证窗口打开。
- 证书错误不会自动绕过。

## 自动化结果

- GET 和 POST 原始响应快照通过。
- POST 请求体脱敏通过。
- Trace ID 和日志模板通过。
- 连接拒绝错误页通过。
- 原生剪贴板通过。
- 三个内置演示网站通过。
- LTing 点击 AI 管家捕获 13 条 XHR。
- SauceDemo 登录进入商品页。
- 公共 500 页面捕获 `mainFrame` HTTP 500。
- 浏览器 UI 回归运行时错误为 0。
