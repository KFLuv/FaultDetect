# FaultDetect LLM 增强验证

日期：2026-11-06
版本：FaultDetect v1.2.0

## 本机配置

- 配置文件：`%USERPROFILE%\.faultdetect\application.properties`
- Key 来源：本机用户目录
- 配置查询：只返回掩码 Key
- 保存行为：留空 Key 时保留已保存值
- 生效方式：保存后立即更新当前进程

## 连接测试

- 接口：OpenAI 兼容 Chat Completions
- 连接状态：`ok`
- 实测延迟：约 0.8 至 1.2 秒
- 错误信息不会暴露 Key

## 开关验证

### 关闭 LLM

- 请求字段：`enable_llm=false`
- `llm.requested=false`
- `llm.attempted=false`
- 继续执行 7 步观测、差分和规则归因流程

### 开启 LLM

- 请求字段：`enable_llm=true`
- `llm.requested=true`
- `llm.attempted=true`
- `llm.status=ok`
- 规则结论保持为主路径
- LLM 结论作为补充展示

## 安全边界

- Key 不进入仓库、jar、日志或 API 响应。
- 模型设置接口仅在本机回环地址可用。
- 调用失败自动降级，不影响规则结论。

## 验证限制

- 本次验证使用本人 Key。
- 不代表其他模型供应商或所有网络环境均可直接兼容。
