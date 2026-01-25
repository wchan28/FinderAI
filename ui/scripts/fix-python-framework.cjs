const fs = require('fs');
const path = require('path');

exports.default = async function fixPythonFramework(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') {
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const basePath = path.join(
    appOutDir,
    `${appName}.app`,
    'Contents',
    'Resources',
    'python-backend',
    '_internal'
  );

  const frameworkNames = ['Python.framework', 'Python3.framework'];

  for (const frameworkName of frameworkNames) {
    const frameworkPath = path.join(basePath, frameworkName);
    if (fs.existsSync(frameworkPath)) {
      console.log(`Removing problematic ${frameworkName} at ${frameworkPath}...`);
      fs.rmSync(frameworkPath, { recursive: true, force: true });
      console.log(`${frameworkName} removed successfully.`);
    }
  }
};
