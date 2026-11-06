# FaultDetect v1.3.4 内嵌采集与教学网站验证

日期：2026-11-06
验收对象：`FaultDetect-1.3.4-portable.exe`

## 教学网站

- 订单管理系统：`/demo/sites/orders.html`
- 账号与权限中心：`/demo/sites/account.html`
- 审批中心：`/demo/sites/approval.html`

用户打开的是完整网页，不是 API 地址。进入网站后点击页面里的业务按钮，再由 FaultDetect 记录请求。

## 验证结果

- 三个教学网页均返回 HTML 200。
- 订单网站 GET 500 可完成采集和诊断。
- 账号网站可产生 401。
- 审批网站 POST 500 被标记为不可自动重放。
- 按钮文字可以关联到请求。
- 业务系统在 FaultDetect 主窗口内显示，不再单独弹窗。
- 原生剪贴板可以复制请求交接信息。
- 浏览器 UI 回归运行时错误为 0。

## 问答口径

- URL 自带 token 查询参数时按原 URL 发送。
- 内嵌采集自动带入 Cookie、Authorization 和自定义认证头。
- 手动输入 URL 不读取用户原来浏览器的 Cookie。
- 未知问题确认最终根因后才归档到场景库。
