# FaultDetect 自动化回归报告

生成时间：2026-11-07 22:50:32

## 结论

- 健康检查：ok
- 观测层严格一致：7/8（87.5%）
- 归因层固定用例：10/10（100%）
- 未授权目标拦截：HTTP 400
- 授权诊断、跟进、导出、单条删除：通过
- 验收结果：通过，含 1 条已声明边界

## 观测层

| 用例 | 独立真值 | 系统实测 | 结果 | 说明 |
| --- | --- | --- | --- | --- |
| SC_01 | 200 | 200 | 通过 |  |
| SC_02 | 404 | 404 | 通过 |  |
| SC_03 | 500 | 500 | 通过 |  |
| SC_04 | 200 | 200 | 通过 |  |
| SC_05 | 200 | 200 | 通过 |  |
| SC_06 | TIMEOUT | TIMEOUT | 通过 |  |
| SC_07 | CONN_REFUSED | CONN_REFUSED | 通过 |  |
| SC_08 | DNS_FAIL | CONN_REFUSED | 已知差异 | （已知粒度差异：真值为 DNS 解析失败，系统归类到「连接被拒绝 / 网络不通」，故障层次判断正确，但未细分 DNS 与端口两类原因） |

## 归因层

| 用例 | 场景 | 期望归属 | 实际归属 | 结果 |
| --- | --- | --- | --- | --- |
| AT_01 | 数据库单行查询返回多行 | database | database | 通过 |
| AT_02 | 唯一约束冲突 | database | database | 通过 |
| AT_03 | 参数校验失败 | frontend | frontend | 通过 |
| AT_04 | 请求方法错误 | frontend | frontend | 通过 |
| AT_05 | 服务限流 | service | service | 通过 |
| AT_06 | 网关无法连接后端 | service | service | 通过 |
| AT_07 | 网关等待后端超时 | performance | performance | 通过 |
| AT_08 | 域名解析失败 | network | network | 通过 |
| AT_09 | 连接超时 | network | network | 通过 |
| AT_10 | 跨域配置拦截 | config | config | 通过 |

## 口径

观测层要求类别完全一致，DNS 解析失败不能与连接被拒绝合并成通过。归因层只验证系统能否把固定事实归到正确层次，不代表真实现场最终根因。该报告由 scripts/run-faultdetect-regression.ps1 生成，可重复执行。
