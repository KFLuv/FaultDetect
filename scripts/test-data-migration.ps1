param(
    [string]$JavaHome = "E:\JDK11",
    [string]$BaseUrl = "http://127.0.0.1:8000"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$dataDir = Join-Path $env:TEMP ("faultdetect-migration-" + [guid]::NewGuid().ToString("N"))
$jar = Join-Path $root "java-backend\target\fault-detect-system.jar"
$seed = Join-Path $PSScriptRoot "seed_legacy_history.py"

if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    throw "端口 8000 已被占用，迁移测试需要独立端口"
}
if (-not (Test-Path -LiteralPath $jar)) {
    throw "未找到后端 jar：$jar"
}

python $seed $dataDir | Out-Null
$env:FAULT_DETECT_DATA_DIR = $dataDir
$process = Start-Process -FilePath (Join-Path $JavaHome "bin\javaw.exe") `
    -ArgumentList "-jar", "`"$jar`"" `
    -WorkingDirectory (Split-Path -Parent $jar) `
    -WindowStyle Hidden `
    -PassThru

function Wait-Health {
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $health = Invoke-RestMethod -Uri "$BaseUrl/api/health"
            if ($health.status -eq "ok") { return $health }
        } catch {
        }
        Start-Sleep -Seconds 1
    }
    throw "后端未能启动"
}

try {
    $health = Wait-Health
    $history = Invoke-RestMethod -Uri "$BaseUrl/api/history?limit=20"
    $legacy = $history.history | Where-Object { $_.report_id -eq "legacy001" } | Select-Object -First 1

    $payload = @{
        url = "$BaseUrl/api/health"
        symptom = "migration-new-case"
        authorized_target = $true
        enable_service_check = $false
        enable_contrast = $false
        enable_llm = $false
        timeout = 5
    } | ConvertTo-Json
    $newCase = Invoke-RestMethod -Uri "$BaseUrl/api/detect" `
        -Method Post -ContentType "application/json" -Body $payload
    Invoke-RestMethod -Uri "$BaseUrl/api/history/$($newCase.report_id)/follow-up" `
        -Method Post -ContentType "application/json" `
        -Body (@{
            status = "closed"
            owner = "migration-test"
            note = "restart persistence"
            closed_reason = "verified migration"
        } | ConvertTo-Json) | Out-Null

    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 2
    $process = Start-Process -FilePath (Join-Path $JavaHome "bin\javaw.exe") `
        -ArgumentList "-jar", "`"$jar`"" `
        -WorkingDirectory (Split-Path -Parent $jar) `
        -WindowStyle Hidden `
        -PassThru
    $health2 = Wait-Health
    $history2 = Invoke-RestMethod -Uri "$BaseUrl/api/history?limit=20"
    $legacy2 = $history2.history | Where-Object { $_.report_id -eq "legacy001" } | Select-Object -First 1
    $newCase2 = $history2.history | Where-Object { $_.report_id -eq $newCase.report_id } | Select-Object -First 1

    $acceptance = (
        $legacy.report_id -eq "legacy001" -and
        $legacy.case_status -eq "new" -and
        $legacy2.report_id -eq "legacy001" -and
        $newCase2.case_status -eq "closed" -and
        $newCase2.owner -eq "migration-test"
    )
    $result = [ordered]@{
        legacy_recovered = $legacy.report_id
        legacy_default_status = $legacy.case_status
        new_case = $newCase.report_id
        restart_status = $newCase2.case_status
        restart_owner = $newCase2.owner
        version = $health2.version
        result = if ($acceptance) { "passed" } else { "failed" }
    }
    $result | ConvertTo-Json | Set-Content -LiteralPath (
        Join-Path $root "docs\testing\FaultDetect-Migration-20261106.json"
    ) -Encoding utf8
    $result | Format-List
    if (-not $acceptance) {
        throw "数据迁移验证失败"
    }
} finally {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    $resolved = [System.IO.Path]::GetFullPath($dataDir)
    $tempRoot = [System.IO.Path]::GetFullPath($env:TEMP)
    if ($resolved.StartsWith($tempRoot, [System.StringComparison]::OrdinalIgnoreCase) -and
        (Test-Path -LiteralPath $resolved)) {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
