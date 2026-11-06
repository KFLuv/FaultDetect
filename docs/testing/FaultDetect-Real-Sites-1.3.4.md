# FaultDetect v1.3.4 真实网页兼容性验证

日期：2026-11-06
验收对象：`FaultDetect-1.3.4-portable.exe`

## 测试目标

验证 FaultDetect 内的 `<webview>` 不只会加载本地演示页，也能打开真实 Web 系统并完成页面交互。

## LTing

- 地址：`http://127.0.0.1:8078/chat/login.html`
- 页面标题：`用户登录`
- 登录表单正常渲染。
- 点击“游客登录（免注册直达）”后进入：
  `http://127.0.0.1:8078/chat/home.html`
- 开始记录后点击“AI 管家”，捕获 13 条真实 XHR。
- 请求关联的按钮文字为“AI 管家”，并自动带入 `JSESSIONID` Cookie。

## SauceDemo

- 地址：`https://www.saucedemo.com/`
- 页面标题：`Swag Labs`
- 使用公开测试账号完成登录。
- 成功进入：
  `https://www.saucedemo.com/inventory.html`
- 商品页 `Products` 内容正常显示。

## 公共 500 测试站

- 地址：`https://the-internet.herokuapp.com/status_codes`
- 开始记录后点击 `500` 链接。
- FaultDetect 捕获到 `GET`、HTTP 500、`resourceType=mainFrame`，操作名称为“500”。
- 选择该请求执行诊断后，实际重测结果为：
  `504 pending → 504（超时）`

浏览器里点击到的页面导航明确是 500，但 FaultDetect 后端从当前网络重新请求该公共站点时超时，因此诊断结论变成性能问题。这个差异必须保留，不能把原始 500 伪造成后端复测结果。

## 结论

FaultDetect 的内置浏览器可以加载真实本地系统和外部 HTTPS Web 系统，不是只能打开内置示例。

## 需要注意

- 能不能加载网页和能不能捕获请求是两个问题。
- 使用 XHR / Fetch 的业务按钮会产生候选请求。
- 纯服务端表单提交、WebSocket 或页面内部状态变化，不一定产生可复测的 XHR / Fetch。
- 浏览器与 FaultDetect 后端的网络路径不同，重新探测结果可能与原始页面请求不同。
- POST、提交、审批等请求仍不允许自动重放。
- 某些企业系统会限制内嵌浏览器、客户端证书或 SSO，这类情况需要单独验证。
