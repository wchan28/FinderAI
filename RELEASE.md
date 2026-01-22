# Release Process

This document describes the process for creating a new release of FinderAI/Docora.

## Prerequisites

- Apple Developer account with notarization keychain profile set up (`FinderAI-notarize`)
- GitHub CLI (`gh`) installed and authenticated
- Access to the FinderAI GitHub repository

## Process Overview

1. **Commit all changes** to the main branch
2. **Trigger CI build** via GitHub Actions
3. **Download artifacts** from the workflow run
4. **Notarize and staple** macOS builds
5. **Create release** on GitHub

## Detailed Steps

### 1. Trigger Build

Go to GitHub Actions and trigger the "Build All Platforms" workflow:
- https://github.com/wchan28/FinderAI/actions/workflows/build.yml
- Click "Run workflow"
- Wait for all jobs to complete

### 2. Download Artifacts

Download the three build artifacts:
- `FinderAI-mac-arm64.zip` - Contains ARM64 Mac build
- `FinderAI-mac-x64.zip` - Contains Intel Mac build
- `FinderAI-windows.zip` - Contains Windows build

Extract each to `~/Downloads/FinderAI-mac-arm64/`, `~/Downloads/FinderAI-mac-x64/`, and `~/Downloads/` respectively.

### 3. Notarize Mac Builds

Notarize both Mac builds in parallel:

```bash
# Notarize ARM64 (in parallel)
xcrun notarytool submit ~/Downloads/FinderAI-mac-arm64/FinderAI-mac.zip \
  --keychain-profile "FinderAI-notarize" \
  --wait &

# Notarize x64 (in parallel)
xcrun notarytool submit ~/Downloads/FinderAI-mac-x64/FinderAI-mac.zip \
  --keychain-profile "FinderAI-notarize" \
  --wait &

# Wait for both to complete
wait
```

### 4. Staple Mac Builds

After notarization completes, staple the ticket and re-create ZIPs without AppleDouble files:

```bash
# Staple ARM64
cd ~/Downloads/FinderAI-mac-arm64
unzip -q -o FinderAI-mac.zip
find FinderAI.app -name "._*" -type f -delete
xcrun stapler staple FinderAI.app
rm FinderAI-mac.zip
ditto -c -k --sequesterRsrc --keepParent FinderAI.app FinderAI-mac.zip
rm -rf FinderAI.app

# Staple x64
cd ~/Downloads/FinderAI-mac-x64
unzip -q -o FinderAI-mac.zip
find FinderAI.app -name "._*" -type f -delete
xcrun stapler staple FinderAI.app
rm FinderAI-mac.zip
ditto -c -k --sequesterRsrc --keepParent FinderAI.app FinderAI-mac.zip
rm -rf FinderAI.app
```

**Critical:** Always use `--sequesterRsrc` with `ditto` to prevent AppleDouble files from being included in the ZIP.

### 5. Verify No AppleDouble Files

Verify that the stapled ZIPs don't contain AppleDouble files:

```bash
# Check ARM64
unzip -l ~/Downloads/FinderAI-mac-arm64/FinderAI-mac.zip | grep "\._" | wc -l
# Should output: 0

# Check x64
unzip -l ~/Downloads/FinderAI-mac-x64/FinderAI-mac.zip | grep "\._" | wc -l
# Should output: 0
```

### 6. Prepare Release Assets

Create release directory and prepare files:

```bash
mkdir -p ~/Downloads/release-v{VERSION}

# Copy Mac builds
cp ~/Downloads/FinderAI-mac-arm64/FinderAI-mac.zip \
   ~/Downloads/release-v{VERSION}/FinderAI-arm64-mac.zip
cp ~/Downloads/FinderAI-mac-arm64/FinderAI-mac.zip.blockmap \
   ~/Downloads/release-v{VERSION}/FinderAI-arm64-mac.zip.blockmap

cp ~/Downloads/FinderAI-mac-x64/FinderAI-mac.zip \
   ~/Downloads/release-v{VERSION}/FinderAI-x64-mac.zip
cp ~/Downloads/FinderAI-mac-x64/FinderAI-mac.zip.blockmap \
   ~/Downloads/release-v{VERSION}/FinderAI-x64-mac.zip.blockmap

# Extract Windows build
cd ~/Downloads/release-v{VERSION}
unzip -o ~/Downloads/FinderAI-windows.zip

# Rename Windows files (remove version number)
mv "FinderAI Setup 1.0.5.exe" "FinderAI-Setup.exe"
mv "FinderAI Setup 1.0.5.exe.blockmap" "FinderAI-Setup.exe.blockmap"
```

### 7. Generate Release Manifests

Generate SHA512 hashes and create auto-update manifests:

```bash
cd ~/Downloads/release-v{VERSION}

# Generate hashes
ARM64_SHA=$(shasum -a 512 FinderAI-arm64-mac.zip | awk '{print $1}' | xxd -r -p | base64)
ARM64_SIZE=$(stat -f%z FinderAI-arm64-mac.zip)

X64_SHA=$(shasum -a 512 FinderAI-x64-mac.zip | awk '{print $1}' | xxd -r -p | base64)
X64_SIZE=$(stat -f%z FinderAI-x64-mac.zip)

WIN_SHA=$(shasum -a 512 FinderAI-Setup.exe | awk '{print $1}' | xxd -r -p | base64)
WIN_SIZE=$(stat -f%z FinderAI-Setup.exe)

# Create latest-mac.yml
cat > latest-mac.yml << EOF
version: {VERSION}
files:
  - url: FinderAI-arm64-mac.zip
    sha512: $ARM64_SHA
    size: $ARM64_SIZE
  - url: FinderAI-x64-mac.zip
    sha512: $X64_SHA
    size: $X64_SIZE
path: FinderAI-arm64-mac.zip
sha512: $ARM64_SHA
releaseDate: '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'
EOF

# Create latest.yml (Windows)
cat > latest.yml << EOF
version: {VERSION}
files:
  - url: FinderAI-Setup.exe
    sha512: $WIN_SHA
    size: $WIN_SIZE
path: FinderAI-Setup.exe
sha512: $WIN_SHA
releaseDate: '$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")'
EOF
```

### 8. Create GitHub Release

Tag and create the release:

```bash
cd ~/path/to/Docora
git tag v{VERSION}
git push origin v{VERSION}

cd ~/Downloads/release-v{VERSION}
gh release create v{VERSION} \
  --repo wchan28/FinderAI \
  --title "FinderAI v{VERSION}" \
  --notes "## What's Changed

- [List changes here]

**Full Changelog**: https://github.com/wchan28/FinderAI/compare/v{PREV_VERSION}...v{VERSION}" \
  FinderAI-arm64-mac.zip \
  FinderAI-arm64-mac.zip.blockmap \
  FinderAI-x64-mac.zip \
  FinderAI-x64-mac.zip.blockmap \
  FinderAI-Setup.exe \
  FinderAI-Setup.exe.blockmap \
  latest-mac.yml \
  latest.yml \
  builder-debug.yml
```

## Important Notes

### AppleDouble Files

AppleDouble files (`._*`) are metadata files created by macOS that can cause:
1. **Gatekeeper warnings** - "Cannot verify app is free of malware"
2. **Code signing failures** - "unsealed contents present in framework"

**Prevention:**
- The `fix-mac-zip.js` script runs during CI build to remove these files
- Always use `ditto --sequesterRsrc` when creating ZIPs locally
- Verify with `unzip -l {zip} | grep "\._"` before release

### Notarization

- Notarization typically takes 2-5 minutes per build
- Can notarize ARM64 and x64 in parallel to save time
- Check status: `xcrun notarytool history --keychain-profile "FinderAI-notarize"`
- Stapling embeds the notarization ticket in the app bundle

### Auto-Updates

The `latest-mac.yml` and `latest.yml` files control auto-updates:
- electron-updater checks these files for new versions
- SHA512 hashes ensure download integrity
- File names must NOT include version numbers for marketing website compatibility

## Troubleshooting

### "Backend Not Available" Error

If users see this error, check:
1. `backend/finderai_server.spec` includes all backend modules in `hiddenimports` and `datas`
2. PyInstaller bundled the complete backend
3. Run the server executable directly to see error messages

### Gatekeeper Warnings

If users see "Cannot verify app", check:
1. App was notarized (`spctl -a -vvv {app}` should show "accepted")
2. Ticket was stapled (`stapler validate {app}` should succeed)
3. No AppleDouble files in ZIP (`unzip -l {zip} | grep "\._"` should be empty)

### Build Failures

Check GitHub Actions logs for:
- PyInstaller errors (missing modules)
- Code signing failures (certificate issues)
- electron-builder errors (packaging issues)
