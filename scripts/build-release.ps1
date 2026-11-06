param(
    [string]$Version = "1.3.4",
    [string]$JavaHome = "E:\JDK11",
    [string]$MavenHome = "E:\apache-maven-3.9.16"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend-vue3"
$backend = Join-Path $root "java-backend"
$static = Join-Path $backend "src\main\resources\static"
$distRoot = Join-Path $root "dist"
$bundle = Join-Path $distRoot "FaultDetect-$Version"
$appDir = Join-Path $bundle "app"
$runtimeDir = Join-Path $bundle "runtime"
$payload = Join-Path $distRoot "payload-$Version.zip"
$singleExe = Join-Path $distRoot "FaultDetect-$Version.exe"
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
$mavenCmd = Join-Path $MavenHome "bin\mvn.cmd"

& (Join-Path $PSScriptRoot "check-secrets.ps1")

if (-not (Test-Path -LiteralPath $csc)) {
    throw "未找到 csc.exe：$csc"
}
if (-not (Test-Path -LiteralPath (Join-Path $JavaHome "bin\jlink.exe"))) {
    throw "未找到 jlink：$JavaHome"
}
if (-not (Test-Path -LiteralPath $mavenCmd)) {
    throw "未找到 Maven：$mavenCmd"
}

Push-Location $frontend
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "npm ci failed" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
} finally {
    Pop-Location
}

Copy-Item -LiteralPath (Join-Path $frontend "dist\index.html") -Destination (Join-Path $static "index.html") -Force
$assetDir = Join-Path $static "assets"
if (Test-Path -LiteralPath $assetDir) {
    Remove-Item -LiteralPath $assetDir -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $assetDir | Out-Null
Copy-Item -Path (Join-Path $frontend "dist\assets\*") -Destination (Join-Path $static "assets") -Force

$oldJavaHome = $env:JAVA_HOME
$oldPath = $env:PATH
$env:JAVA_HOME = $JavaHome
$env:PATH = (Join-Path $JavaHome "bin") + ";" + $env:PATH
try {
    Push-Location $backend
    try {
        & $mavenCmd -B clean package -DskipTests
        if ($LASTEXITCODE -ne 0) { throw "backend build failed" }
    } finally {
        Pop-Location
    }
} finally {
    $env:JAVA_HOME = $oldJavaHome
    $env:PATH = $oldPath
}

if (Test-Path -LiteralPath $bundle) {
    Remove-Item -LiteralPath $bundle -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $appDir | Out-Null
Copy-Item -LiteralPath (Join-Path $backend "target\fault-detect-system.jar") -Destination (Join-Path $appDir "fault-detect-system.jar") -Force

$modules = @(
    "java.base",
    "java.logging",
    "java.sql",
    "java.naming",
    "java.net.http",
    "java.desktop",
    "java.xml",
    "java.management",
    "java.security.jgss",
    "java.instrument",
    "jdk.unsupported",
    "jdk.crypto.ec"
) -join ","
& (Join-Path $JavaHome "bin\jlink.exe") --add-modules $modules --output $runtimeDir --strip-debug --no-header-files --no-man-pages --compress=2
if ($LASTEXITCODE -ne 0) { throw "jlink failed" }

& $csc /nologo /target:winexe /codepage:65001 `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    "/out:$(Join-Path $bundle "FaultDetect-$Version.exe")" `
    (Join-Path $root "tools\launcher.cs")
if ($LASTEXITCODE -ne 0) { throw "green launcher build failed" }

if (Test-Path -LiteralPath $payload) {
    Remove-Item -LiteralPath $payload -Force
}
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $bundle,
    $payload,
    [System.IO.Compression.CompressionLevel]::Optimal,
    $false
)

if (Test-Path -LiteralPath $singleExe) {
    Remove-Item -LiteralPath $singleExe -Force
}
& $csc /nologo /target:winexe /codepage:65001 `
    /r:System.Windows.Forms.dll /r:System.Drawing.dll `
    /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll `
    "/resource:$payload,payload.zip" `
    "/out:$singleExe" `
    (Join-Path $root "tools\single-exe-launcher.cs")
if ($LASTEXITCODE -ne 0) { throw "single exe build failed" }

$hash = Get-FileHash -Algorithm SHA256 -LiteralPath $singleExe
$result = [ordered]@{
    version = $Version
    single_exe = $singleExe
    size = (Get-Item -LiteralPath $singleExe).Length
    sha256 = $hash.Hash
    green_bundle = $bundle
}
$resultPath = Join-Path $distRoot "FaultDetect-$Version-release.json"
$result | ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding utf8
$result | Format-List
Write-Host "Release metadata: $resultPath"
