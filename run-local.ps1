$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$port = if ($env:LINE_LOCAL_PORT) { [int]$env:LINE_LOCAL_PORT } else { 5174 }
$url = "http://127.0.0.1:$port/"

Write-Host "LINE- local preview"
Write-Host "Root: $root"
Write-Host "URL : $url"
Write-Host "Press Ctrl+C to stop."

Set-Location -LiteralPath $root
python -m http.server $port --bind 127.0.0.1 --directory .
