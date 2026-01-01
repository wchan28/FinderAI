# Build script for FinderAI Python backend on Windows
# Creates a standalone executable using PyInstaller

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Split-Path -Parent $ScriptDir
$BackendDir = Join-Path $ProjectRoot "backend"
$OutputDir = Join-Path $ProjectRoot "ui\python-dist\win"

Write-Host "=== FinderAI Backend Build (Windows) ===" -ForegroundColor Cyan
Write-Host "Project root: $ProjectRoot"
Write-Host "Backend dir: $BackendDir"
Write-Host "Output dir: $OutputDir"

Set-Location $BackendDir

# Clean previous build artifacts
Write-Host ""
Write-Host "Cleaning previous builds..." -ForegroundColor Yellow
if (Test-Path "build") { Remove-Item -Recurse -Force "build" }
if (Test-Path "dist") { Remove-Item -Recurse -Force "dist" }
if (Test-Path "build_venv") { Remove-Item -Recurse -Force "build_venv" }
if (Test-Path "__pycache__") { Remove-Item -Recurse -Force "__pycache__" }
if (Test-Path $OutputDir) { Remove-Item -Recurse -Force $OutputDir }

# Create virtual environment for isolated build
Write-Host ""
Write-Host "Creating virtual environment..." -ForegroundColor Yellow
python -m venv build_venv
& ".\build_venv\Scripts\Activate.ps1"

# Upgrade pip
Write-Host ""
Write-Host "Upgrading pip..." -ForegroundColor Yellow
pip install --upgrade pip

# Install dependencies
Write-Host ""
Write-Host "Installing dependencies..." -ForegroundColor Yellow
pip install -r requirements.txt

# Install PyInstaller
Write-Host ""
Write-Host "Installing PyInstaller..." -ForegroundColor Yellow
pip install pyinstaller

# Build with PyInstaller
Write-Host ""
Write-Host "Building executable with PyInstaller..." -ForegroundColor Yellow
pyinstaller finderai_server.spec --clean --noconfirm

# Move output to expected location
Write-Host ""
Write-Host "Moving output to $OutputDir..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null
Copy-Item -Recurse "dist\finderai-server\*" $OutputDir

# Cleanup
Write-Host ""
Write-Host "Cleaning up..." -ForegroundColor Yellow
deactivate
Remove-Item -Recurse -Force "build_venv"
Remove-Item -Recurse -Force "build"
Remove-Item -Recurse -Force "dist"

Write-Host ""
Write-Host "=== Build complete ===" -ForegroundColor Green
Write-Host "Output: $OutputDir"
Get-ChildItem $OutputDir
