param(
    [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$ErrorActionPreference = "Stop"
$patterns = @(
    'sk-[A-Za-z0-9_-]{16,}',
    '(?i)(?:api[_-]?key|faultdetect\.llm\.api-key)\s*=\s*["'']?[A-Za-z0-9_-]{16,}["'']?',
    '(?i)Authorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{20,}',
    '\b192\.168\.\d{1,3}\.\d{1,3}\b',
    '\b10\.\d{1,3}\.\d{1,3}\.\d{1,3}\b',
    '\b172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}\b',
    ('(?i)\bcgn\b|cgnpc|' + [char]0x4E2D + [char]0x5E7F + [char]0x6838)
)

$relativePaths = & git -C $Root ls-files --cached --others --exclude-standard
if ($LASTEXITCODE -ne 0) {
    throw "git ls-files failed while collecting files for the secret scan"
}
$files = $relativePaths |
    Where-Object {
        $_ -match '\.(java|xml|yml|yaml|json|js|vue|md|py|ps1|html|css)$' -and
        $_ -notmatch '^docs[\\/]testing[\\/]FaultDetect-Regression-.*\.json$' -and
        (Join-Path $Root $_) -ne $PSCommandPath
    } |
    ForEach-Object { Get-Item -LiteralPath (Join-Path $Root $_) -ErrorAction SilentlyContinue }

$findings = @()
foreach ($file in $files) {
    $lines = Get-Content -LiteralPath $file.FullName -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt $lines.Count; $i++) {
        foreach ($pattern in $patterns) {
            if ($lines[$i] -match $pattern) {
                $relative = $file.FullName.Substring($Root.Length).TrimStart('\')
                $findings += "${relative}:$($i + 1)"
                break
            }
        }
    }
}

if ($findings.Count -gt 0) {
    Write-Error ("Potential secrets or unsanitized values found:`n" + (($findings | Sort-Object -Unique) -join "`n"))
    exit 1
}

Write-Host "No high-confidence secrets or internal identifiers found."
