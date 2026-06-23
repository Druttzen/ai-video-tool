# Starts Canvas Vite dev server, then Electron with hot-reload canvas URL.
$ErrorActionPreference = "Continue"
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$canvasPort = 5174
$canvasUrl = "http://localhost:$canvasPort"

function Test-PortListening([int]$Port) {
  return [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue)
}

if (-not (Test-PortListening $canvasPort)) {
  Write-Host "Starting Canvas dev server on $canvasUrl ..."
  Start-Process -FilePath "npm.cmd" -ArgumentList "run", "canvas:dev" -WorkingDirectory $root -WindowStyle Hidden
  $deadline = (Get-Date).AddSeconds(45)
  while ((Get-Date) -lt $deadline) {
    if (Test-PortListening $canvasPort) { break }
    Start-Sleep -Milliseconds 400
  }
  if (-not (Test-PortListening $canvasPort)) {
    Write-Warning "Canvas dev server did not start on port $canvasPort — Electron will fall back to built canvas if available."
  } else {
    Write-Host "Canvas dev server ready."
  }
} else {
  Write-Host "Canvas dev server already listening on $canvasUrl"
}

$env:CANVAS_DEV_URL = $canvasUrl
Write-Host "Launching Electron (CANVAS_DEV_URL=$canvasUrl) ..."
& npm run electron
