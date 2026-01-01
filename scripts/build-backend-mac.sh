#!/bin/bash
# Build script for FinderAI Python backend on macOS
# Creates a standalone executable using PyInstaller

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
BACKEND_DIR="$PROJECT_ROOT/backend"
OUTPUT_DIR="$PROJECT_ROOT/ui/python-dist/mac"

echo "=== FinderAI Backend Build (macOS) ==="
echo "Project root: $PROJECT_ROOT"
echo "Backend dir: $BACKEND_DIR"
echo "Output dir: $OUTPUT_DIR"

cd "$BACKEND_DIR"

# Clean previous build artifacts
echo ""
echo "Cleaning previous builds..."
rm -rf build dist build_venv __pycache__
rm -rf "$OUTPUT_DIR"

# Create virtual environment for isolated build
echo ""
echo "Creating virtual environment..."
python3 -m venv build_venv
source build_venv/bin/activate

# Upgrade pip
echo ""
echo "Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo ""
echo "Installing dependencies..."
pip install -r requirements.txt

# Install PyInstaller
echo ""
echo "Installing PyInstaller..."
pip install pyinstaller

# Build with PyInstaller
echo ""
echo "Building executable with PyInstaller..."
pyinstaller finderai_server.spec --clean --noconfirm

# Move output to expected location
echo ""
echo "Moving output to $OUTPUT_DIR..."
mkdir -p "$OUTPUT_DIR"
cp -r dist/finderai-server/* "$OUTPUT_DIR/"

# Cleanup
echo ""
echo "Cleaning up..."
deactivate
rm -rf build_venv build dist

echo ""
echo "=== Build complete ==="
echo "Output: $OUTPUT_DIR"
ls -la "$OUTPUT_DIR"
