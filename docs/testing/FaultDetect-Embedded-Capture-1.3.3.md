# FaultDetect v1.3.3 内嵌采集与教学验证

日期：2026-11-06
验收对象：`FaultDetect-1.3.3-portable.exe`

## 本次修复

- 业务系统从独立 BrowserWindow 改为 FaultDetect 主窗口内的 WebContentsView。
- 汇报、未知场景交接包和请求交接信息改为 Electron 原生剪贴板。
- 检测结果默认展示结论、建议和汇报，完整流程按需展开，并支持清除本次结果。
- 差分隔离实验改为高级选项，默认关闭。
- 教学页增加 7 个可复制的本地检测地址。

## 教学案例

| 案例 | 地址 | 预期 |
| --- | --- | --- |
| 正常查询 | `/demo/api/ok` | HTTP 200 |
| 后端异常 | `/demo/api/error` | HTTP 500 |
| 接口不存在 | `/demo/api/not-found` | HTTP 404 |
| 登录态失效 | `/demo/api/unauthorized` | HTTP 401 |
| 空数据 | `/demo/api/empty` | HTTP 200 + `data=[]` |
| 上游不可用 | `/demo/api/unavailable` | HTTP 503 |
| 提交审批失败 | `/demo/api/post-error` | POST HTTP 500，不自动重放 |

## 验证结果

- 业务页面在 FaultDetect 主窗口内显示，没有独立采集窗口。
- 录制开关开启前的请求不会进入候选列表。
- 按钮文字能关联到请求，GET 500 可以完成检测。
- POST 请求只允许复制交接信息，不自动重放。
- 原生剪贴板可成功写入 Windows 系统剪贴板。
- 7 个教学地址的 HTTP 状态全部符合预期。
- 高级诊断默认收起，清除本次结果后状态横幅消失。
- 浏览器 UI 回归运行时错误为 0。

## 数据边界

- 内置采集自动带入 Cookie、Authorization 和自定义认证头。
- URL 自带 token 查询参数时按原 URL 发送，历史记录会对常见敏感参数脱敏。
- 手动输入 URL 不会从原来的 Chrome / Edge 读取 Cookie。
- 未知问题需要用户确认最终根因后，才会归档到自定义场景库。
