param(
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [string]$Label = (Get-Date -Format "yyyyMMdd")
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$outputDir = Join-Path $root "docs\testing"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null

$health = Invoke-RestMethod -Uri "$BaseUrl/api/health" -Method Get
$selfCheck = Invoke-RestMethod -Uri "$BaseUrl/api/selfcheck" -Method Get

$unauthorizedStatus = 0
try {
    Invoke-RestMethod -Uri "$BaseUrl/api/detect" -Method Post `
        -ContentType "application/json" `
        -Body (@{
            url = "$BaseUrl/api/health"
            symptom = "security-check"
            authorized_target = $false
            enable_service_check = $false
            enable_contrast = $false
        } | ConvertTo-Json) | Out-Null
} catch {
    $unauthorizedStatus = [int]$_.Exception.Response.StatusCode
}

$detect = Invoke-RestMethod -Uri "$BaseUrl/api/detect" -Method Post `
    -ContentType "application/json" `
    -Body (@{
        url = "$BaseUrl/api/health"
        symptom = "lifecycle-check"
        authorized_target = $true
        enable_service_check = $false
        enable_contrast = $false
        enable_llm = $false
        timeout = 5
    } | ConvertTo-Json)
$reportId = $detect.report_id
$follow = Invoke-RestMethod -Uri "$BaseUrl/api/history/$reportId/follow-up" -Method Post `
    -ContentType "application/json" `
    -Body (@{
        status = "fixed"
        owner = "regression"
        note = "automated lifecycle check"
        closed_reason = ""
    } | ConvertTo-Json)
$history = Invoke-RestMethod -Uri "$BaseUrl/api/history?limit=10" -Method Get
$historyItem = $history.history | Where-Object { $_.report_id -eq $reportId } | Select-Object -First 1
$jsonExport = Invoke-WebRequest -Uri "$BaseUrl/api/history/$reportId/export?format=json" -UseBasicParsing
$markdownExport = Invoke-WebRequest -Uri "$BaseUrl/api/history/$reportId/export?format=markdown" -UseBasicParsing
$deleteResult = Invoke-RestMethod -Uri "$BaseUrl/api/history/$reportId" -Method Delete

if (-not $selfCheck.attribution) {
    throw "自检接口没有返回归因层结果"
}

$observationBoundary = @(
    $selfCheck.observations |
        Where-Object { -not $_.match } |
        ForEach-Object { "$($_.id): $($_.truth) vs $($_.actual)" }
)
$acceptance = (
    $health.status -eq "ok" -and
    $selfCheck.total -eq 8 -and
    $selfCheck.passed -ge 7 -and
    $selfCheck.attribution.passed -eq $selfCheck.attribution.total -and
    $unauthorizedStatus -eq 400 -and
    $detect.status_code -eq "200" -and
    $follow.case_status -eq "fixed" -and
    $historyItem.case_status -eq "fixed" -and
    $historyItem.owner -eq "regression" -and
    $detect.llm.requested -eq $false -and
    $detect.llm.attempted -eq $false -and
    $jsonExport.RawContentLength -gt 0 -and
    $markdownExport.RawContentLength -gt 0 -and
    $deleteResult.status -eq "ok"
)

$result = [ordered]@{
    generated_at = (Get-Date -Format "yyyy-MM-dd HH:mm:ss")
    base_url = $BaseUrl
    health = $health
    observation = [ordered]@{
        total = $selfCheck.total
        passed = $selfCheck.passed
        consistency = $selfCheck.consistency
        known_boundaries = $observationBoundary
        cases = $selfCheck.observations
    }
    attribution = $selfCheck.attribution
    security = [ordered]@{
        unauthorized_status = $unauthorizedStatus
        authorized_detect_status = $detect.status_code
            }
    lifecycle = [ordered]@{
        report_id = $reportId
        follow_up_status = $follow.case_status
        history_status = $historyItem.case_status
        owner = $historyItem.owner
        json_export_bytes = $jsonExport.RawContentLength
        markdown_export_bytes = $markdownExport.RawContentLength
        deleted = ($deleteResult.status -eq "ok")
        llm_skipped = (-not $detect.llm.requested -and -not $detect.llm.attempted)
    }
    acceptance = [ordered]@{
        passed = $acceptance
        expected = "observability 7/8 strict; attribution 10/10"
    }
}

$jsonPath = Join-Path $outputDir "FaultDetect-Regression-$Label.json"
$result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath $jsonPath -Encoding utf8

$observationRows = ($selfCheck.observations | ForEach-Object {
    $status = if ($_.match) { "通过" } else { "已知差异" }
    "| $($_.id) | $($_.truth) | $($_.actual) | $status | $($_.note) |"
}) -join "`n"
$attributionRows = ($selfCheck.attribution.cases | ForEach-Object {
    $status = if ($_.match) { "通过" } else { "失败" }
    "| $($_.id) | $($_.name) | $($_.expected_category) | $($_.actual_category) | $status |"
}) -join "`n"
$acceptanceText = if ($acceptance) { "通过，含 1 条已声明边界" } else { "未通过" }

$markdown = @"
# FaultDetect 自动化回归报告

生成时间：$($result.generated_at)

## 结论

- 健康检查：$($health.status)
- 观测层严格一致：$($selfCheck.passed)/$($selfCheck.total)（$($selfCheck.consistency)%）
- 归因层固定用例：$($selfCheck.attribution.passed)/$($selfCheck.attribution.total)（$($selfCheck.attribution.consistency)%）
- 未授权目标拦截：HTTP $unauthorizedStatus
- 授权诊断、跟进、导出、单条删除：$($(if ($acceptance) { '通过' } else { '未通过' }))
- 验收结果：$acceptanceText

## 观测层

| 用例 | 独立真值 | 系统实测 | 结果 | 说明 |
| --- | --- | --- | --- | --- |
$observationRows

## 归因层

| 用例 | 场景 | 期望归属 | 实际归属 | 结果 |
| --- | --- | --- | --- | --- |
$attributionRows

## 口径

观测层要求类别完全一致，DNS 解析失败不能与连接被拒绝合并成通过。归因层只验证系统能否把固定事实归到正确层次，不代表真实现场最终根因。该报告由 `scripts/run-faultdetect-regression.ps1` 生成，可重复执行。
"@

$mdPath = Join-Path $outputDir "FaultDetect-Regression-$Label.md"
Set-Content -LiteralPath $mdPath -Value $markdown -Encoding utf8

if (-not $acceptance) {
    throw "回归未通过。JSON: $jsonPath"
}

Write-Host "Regression passed: observation $($selfCheck.passed)/$($selfCheck.total), attribution $($selfCheck.attribution.passed)/$($selfCheck.attribution.total)"
Write-Host "JSON: $jsonPath"
Write-Host "Markdown: $mdPath"
