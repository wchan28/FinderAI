const fs = require('fs');
const path = require('path');

exports.default = async function fixPythonFramework(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const frameworkPath = path.join(
    appOutDir,
    `${appName}.app`,
    'Contents',
    'Resources',
    'python-backend',
    '_internal',
    'Python3.framework'
  );

  if (fs.existsSync(frameworkPath)) {
    console.log(`Removing problematic Python3.framework at ${frameworkPath}...`);
    fs.rmSync(frameworkPath, { recursive: true, force: true });
    console.log('Python3.framework removed successfully.');
  }
};
