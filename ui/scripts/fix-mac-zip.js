const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

exports.default = async function (context) {
  if (process.platform !== 'darwin') {
    console.log('Skipping fix-mac-zip.js: not running on macOS');
    return;
  }

  const artifacts = context.artifactPaths.filter(
    (p) => p.endsWith('.zip') && p.includes('mac')
  );

  console.log(`Found ${artifacts.length} Mac ZIP artifacts to process`);

  for (const zipPath of artifacts) {
    console.log(`\nFixing ZIP for Gatekeeper: ${path.basename(zipPath)}`);

    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fix-zip-'));
    console.log(`  Using temp directory: ${tempDir}`);

    try {
      console.log(`  Extracting ${path.basename(zipPath)}...`);
      execSync(`unzip -q "${zipPath}" -d "${tempDir}"`, { stdio: 'inherit' });

      console.log(`  Searching for AppleDouble files...`);
      const deletedFiles = execSync(
        `find "${tempDir}" -name "._*" -type f -print`
      )
        .toString()
        .trim();

      const deletedCount = deletedFiles ? deletedFiles.split('\n').length : 0;

      if (deletedCount > 0) {
        console.log(`  Found ${deletedCount} AppleDouble files:`);
        console.log(deletedFiles.split('\n').slice(0, 10).map(f => `    ${f}`).join('\n'));
        if (deletedCount > 10) {
          console.log(`    ... and ${deletedCount - 10} more`);
        }

        execSync(`find "${tempDir}" -name "._*" -type f -delete`);
        console.log(`  Deleted ${deletedCount} AppleDouble files`);
      } else {
        console.log(`  No AppleDouble files found`);
      }

      const appDir = fs.readdirSync(tempDir).find(f => f.endsWith('.app'));
      if (!appDir) {
        throw new Error('No .app directory found in extracted ZIP');
      }
      console.log(`  Found app bundle: ${appDir}`);

      console.log(`  Removing original ZIP...`);
      fs.unlinkSync(zipPath);

      console.log(`  Re-creating ZIP with COPYFILE_DISABLE (prevents AppleDouble files)...`);
      execSync(
        `cd "${tempDir}" && COPYFILE_DISABLE=1 zip -r -y "${zipPath}" "${appDir}"`,
        { stdio: 'inherit' }
      );

      const newSize = fs.statSync(zipPath).size;
      console.log(`  ✓ Re-created ZIP: ${path.basename(zipPath)} (${(newSize / 1024 / 1024).toFixed(2)} MB)`);
    } catch (error) {
      console.error(`  ✗ Error processing ${path.basename(zipPath)}:`, error.message);
      throw error;
    } finally {
      console.log(`  Cleaning up temp directory...`);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }

  console.log(`\n✓ Finished processing ${artifacts.length} Mac ZIP artifact(s)`);
};
