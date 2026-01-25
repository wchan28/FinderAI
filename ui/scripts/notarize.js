const { notarize } = require('@electron/notarize');
const { execSync } = require('child_process');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  if (electronPlatformName !== 'darwin') {
    return;
  }

  if (process.env.SKIP_NOTARIZATION === 'true') {
    console.log('Skipping notarization - SKIP_NOTARIZATION is set');
    return;
  }

  if (process.env.CSC_IDENTITY_AUTO_DISCOVERY === 'false') {
    console.log('Skipping notarization - code signing is disabled');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appPath}...`);

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (appleId && appleIdPassword && teamId) {
    console.log('Using Apple ID credentials from environment variables');
    await notarize({
      appPath,
      appleId,
      appleIdPassword,
      teamId,
    });
  } else {
    console.log('Using keychain profile for notarization');
    await notarize({
      appPath,
      keychainProfile: 'FinderAI-notarize',
    });
  }

  console.log('Notarization complete!');

  console.log('Stapling notarization ticket...');
  try {
    execSync(`xcrun stapler staple "${appPath}"`, { stdio: 'inherit' });
    console.log('Stapling complete!');
  } catch (error) {
    console.error('Stapling failed:', error.message);
    throw error;
  }
};
