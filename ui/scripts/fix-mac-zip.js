const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

exports.default = async function (context) {
  if (process.platform !== 'darwin') {
    return;
  }

  const artifacts = context.artifactPaths.filter(
    (p) => p.endsWith('.zip') && p.includes('mac')
  );

  for (const zipPath of artifacts) {
    console.log(`Fixing ZIP for Gatekeeper: ${path.basename(zipPath)}`);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-zip-'));

    try {
      execSync(`unzip -q "${zipPath}" -d "${tempDir}"`, { stdio: 'inherit' });

      const deletedCount = execSync(
        `find "${tempDir}" -name "._*" -type f -delete -print | wc -l`
      )
        .toString()
        .trim();
      console.log(`  Removed ${deletedCount} AppleDouble files`);

      fs.unlinkSync(zipPath);

      execSync(
        `ditto -c -k --sequesterRsrc --keepParent "${tempDir}/FinderAI.app" "${zipPath}"`,
        { stdio: 'inherit' }
      );

      console.log(`  Re-created ZIP with ditto: ${path.basename(zipPath)}`);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
};
