// electron-builder afterPack hook (macOS only).
// We have no paid Apple Developer ID, so electron-builder skips code signing.
// An UNSIGNED app — especially on Apple Silicon — is reported by macOS as
// "damaged and can't be opened". An ad-hoc signature ("-") fixes that, so users
// only see the normal "unidentified developer" prompt (right-click → Open).
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function adhocSign(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  console.log(`  • ad-hoc signing ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
};
