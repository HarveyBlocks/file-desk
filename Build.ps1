# Compose the independently maintained Web and Desktop builds.
[CmdletBinding()]
param()
$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
Push-Location -LiteralPath (Join-Path $projectRoot 'Web')
try {
    npm.cmd ci --prefer-offline --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw 'Web dependency installation failed.' }
    npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw 'Web production build failed.' }
}
finally { Pop-Location }
$publishRoot = Join-Path $projectRoot 'output/desktop'
dotnet publish (Join-Path $projectRoot 'Desktop/Desktop.csproj') -c Release -r win-x64 --self-contained false -p:PublishSingleFile=true -p:IncludeNativeLibrariesForSelfExtract=true -o $publishRoot
if ($LASTEXITCODE -ne 0) { throw 'Desktop publication failed.' }
Copy-Item -LiteralPath (Join-Path $publishRoot 'FileDesk.exe') -Destination (Join-Path $projectRoot 'FileDesk.exe') -Force
Write-Output 'FileDesk.exe is ready. Keep it in the project root.'
