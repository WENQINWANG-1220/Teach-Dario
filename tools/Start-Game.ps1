param([switch]$NoBrowser, [ValidateRange(1024,65525)][int]$PreferredPort = 5190)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction SilentlyContinue
if ($nodeCommand) { $nodePath = $nodeCommand.Source }
else {
    $nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
    if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js 20 or newer is required.' }
}
$buildEntry = Join-Path $projectRoot 'dist\index.html'
$needsBuild = -not (Test-Path -LiteralPath $buildEntry)
if (-not $needsBuild) {
    $buildTime = (Get-Item -LiteralPath $buildEntry).LastWriteTimeUtc
    $inputs = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot 'src'), (Join-Path $projectRoot 'public') -Recurse -File)
    foreach ($name in @('index.html', 'package.json', 'package-lock.json', 'tsconfig.json', 'vite.config.ts')) { $inputs += Get-Item -LiteralPath (Join-Path $projectRoot $name) }
    $needsBuild = @($inputs | Where-Object { $_.LastWriteTimeUtc -gt $buildTime }).Count -gt 0
}
if ($needsBuild) {
    $tsc = Join-Path $projectRoot 'node_modules\typescript\bin\tsc'
    $vite = Join-Path $projectRoot 'node_modules\vite\bin\vite.js'
    if (-not (Test-Path -LiteralPath $tsc) -or -not (Test-Path -LiteralPath $vite)) { throw 'Build dependencies missing. Run npm install inside baby-steps first.' }
    Push-Location $projectRoot
    try {
        & $nodePath $tsc --noEmit
        if ($LASTEXITCODE -ne 0) { throw 'TypeScript check failed.' }
        & $nodePath $vite build
        if ($LASTEXITCODE -ne 0) { throw 'Build failed.' }
    } finally { Pop-Location }
}
$runtimeDir = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
for ($port = $PreferredPort; $port -le ($PreferredPort + 10); $port++) {
    $url = "http://127.0.0.1:$port/"
    try {
        $health = (Invoke-WebRequest -Uri ($url + 'api/health') -UseBasicParsing -TimeoutSec 1).Content | ConvertFrom-Json
        if ($health.service -eq 'baby-steps' -and $health.project.TrimEnd('\', '/') -eq $projectRoot.TrimEnd('\', '/')) { if (-not $NoBrowser) { Start-Process $url }; Write-Output "Baby Steps: $url"; exit 0 }
        continue
    } catch {
        $listener = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Loopback, $port)
        try { $listener.Start(); $listener.Stop(); break } catch { continue }
    }
}
if ($port -gt ($PreferredPort + 10)) { throw 'Game ports are occupied.' }
$helper = Join-Path $PSScriptRoot 'serve.mjs'
$server = Start-Process -FilePath $nodePath -ArgumentList @(('"' + $helper + '"'), "$port") -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $runtimeDir 'server.log') -RedirectStandardError (Join-Path $runtimeDir 'server-error.log')
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Milliseconds 150
    try {
        $health = (Invoke-WebRequest -Uri ($url + 'api/health') -UseBasicParsing -TimeoutSec 1).Content | ConvertFrom-Json
        if ($health.service -eq 'baby-steps') { if (-not $NoBrowser) { Start-Process $url }; Write-Output "Baby Steps: $url"; exit 0 }
    } catch { if ($server.HasExited) { throw 'Server failed. Check .runtime/server-error.log.' } }
}
throw 'Server startup timed out.'
