param(
    [string]$Version = "1.3.0",
    [string]$JavaHome = "E:\JDK11",
    [string]$MavenHome = "E:\apache-maven-3.9.16"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$frontend = Join-Path $root "frontend-vue3"
$backend = Join-Path $root "java-backend"
$desktop = Join-Path $root "desktop"
$static = Join-Path $backend "src\main\resources\static"
$maven = Join-Path $MavenHome "bin\mvn.cmd"

& (Join-Path $PSScriptRoot "check-secrets.ps1")

$desktopVersion = (Get-Content (Join-Path $desktop "package.json") -Raw | ConvertFrom-Json).version
$frontendVersion = (Get-Content (Join-Path $frontend "package.json") -Raw | ConvertFrom-Json).version
[xml]$pom = Get-Content (Join-Path $backend "pom.xml") -Raw
if ($desktopVersion -ne $Version -or $frontendVersion -ne $Version -or $pom.project.version -ne $Version) {
    throw "Version mismatch: requested=$Version desktop=$desktopVersion frontend=$frontendVersion backend=$($pom.project.version)"
}

Push-Location $frontend
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "frontend npm ci failed" }
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "frontend build failed" }
} finally {
    Pop-Location
}

$assetDir = Join-Path $static "assets"
if (Test-Path -LiteralPath $assetDir) {
    Remove-Item -LiteralPath $assetDir -Recurse -Force
}
New-Item -ItemType Directory -Path $assetDir | Out-Null
Copy-Item -LiteralPath (Join-Path $frontend "dist\index.html") -Destination (Join-Path $static "index.html") -Force
Copy-Item -Path (Join-Path $frontend "dist\assets\*") -Destination $assetDir -Force

$oldJavaHome = $env:JAVA_HOME
$oldPath = $env:PATH
$env:JAVA_HOME = $JavaHome
$env:PATH = (Join-Path $JavaHome "bin") + ";" + $env:PATH
try {
    Push-Location $backend
    try {
        & $maven -B clean package -DskipTests
        if ($LASTEXITCODE -ne 0) { throw "backend build failed" }
    } finally {
        Pop-Location
    }
} finally {
    $env:JAVA_HOME = $oldJavaHome
    $env:PATH = $oldPath
}

Push-Location $desktop
try {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw "desktop npm ci failed" }
    $env:JAVA_HOME = $JavaHome
    npm run jre
    if ($LASTEXITCODE -ne 0) { throw "desktop JRE build failed" }
    npx electron-builder --win portable --publish never
    if ($LASTEXITCODE -ne 0) { throw "Electron portable build failed" }
} finally {
    Pop-Location
}

$exe = Join-Path $desktop "release_app\FaultDetect-$Version-portable.exe"
$jar = Join-Path $backend "target\fault-detect-system.jar"
if (-not (Test-Path -LiteralPath $exe)) {
    throw "Desktop portable exe missing: $exe"
}
$result = [ordered]@{
    version = $Version
    exe = $exe
    size = (Get-Item -LiteralPath $exe).Length
    sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $exe).Hash
    jar_sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $jar).Hash
}
$metadata = Join-Path $desktop "release_app\FaultDetect-$Version-release.json"
$result | ConvertTo-Json | Set-Content -LiteralPath $metadata -Encoding utf8
$result | Format-List
Write-Host "Release metadata: $metadata"
