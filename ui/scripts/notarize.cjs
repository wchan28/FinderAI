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

  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;
  const hasAppleCredentials = appleId && appleIdPassword && teamId;

  if (process.env.CI === 'true' && !hasAppleCredentials) {
    console.log('Skipping notarization in CI - Apple credentials not provided');
    console.log('To enable notarization, set APPLE_ID, APPLE_APP_SPECIFIC_PASSWORD, and APPLE_TEAM_ID');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);

  console.log(`Notarizing ${appPath}...`);

  if (hasAppleCredentials) {
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
      keychainProfile: 'Docora-notarize',
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
