# Resolve the project from the script location, regardless of the caller's directory.
Push-Location -LiteralPath $PSScriptRoot
try {
    npm.cmd run dev
}
finally {
    Pop-Location
}
