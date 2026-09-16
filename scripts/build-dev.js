const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const DIST_DEV = path.join(ROOT, 'dist', 'dev');
const TARGET_EXE = path.join(DIST_DEV, 'booth-cashier-dev.exe');

console.log('====================================================');
console.log('BUILDING DEVELOPER / DEBUG EXECUTABLE (With Console)');
console.log('====================================================');

console.log('\n=== [1/2] Preparing dev output directory ===');
if (!fs.existsSync(DIST_DEV)) {
  fs.mkdirSync(DIST_DEV, { recursive: true });
}

// 初期 data / log フォルダの作成
const devData = path.join(DIST_DEV, 'data');
const devLog = path.join(DIST_DEV, 'log');
if (!fs.existsSync(devData)) fs.mkdirSync(devData, { recursive: true });
if (!fs.existsSync(devLog)) fs.mkdirSync(devLog, { recursive: true });

const srcCsv = path.join(ROOT, 'data', 'contents.csv');
const destCsv = path.join(devData, 'contents.csv');
if (fs.existsSync(srcCsv) && !fs.existsSync(destCsv)) {
  fs.copyFileSync(srcCsv, destCsv);
  console.log('Copied default contents.csv to dist/dev/data/');
}

// 静的ファイル（HTML, css, script）を dist/dev にも同期コピー
['index.html', 'cashier.html', 'admin.html', 'portal.html'].forEach(html => {
  const src = path.join(ROOT, html);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST_DEV, html));
});
['css', 'script'].forEach(dir => {
  const srcDir = path.join(ROOT, dir);
  const destDir = path.join(DIST_DEV, dir);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, destDir, { recursive: true, force: true });
  }
});
console.log('Synchronized static assets to dist/dev/');

console.log('\n=== [2/2] Building executable with @yao-pkg/pkg (Console Subsystem) ===');
// サブシステムパッチを行わず、コンソール（ターミナル）を表示するバイナリを生成
const pkgCmd = `npx @yao-pkg/pkg server.js -c package.json --targets node22-win-x64 --output "${TARGET_EXE}"`;
console.log(`Running: ${pkgCmd}`);
execSync(pkgCmd, { cwd: ROOT, stdio: 'inherit' });

console.log('\n====================================================');
console.log('Developer Build complete!');
console.log(`Executable (with console output):`);
console.log(`  ${TARGET_EXE}`);
console.log('\nDouble-clicking this exe will launch a terminal window');
console.log('showing real-time server logs and API activity.');
console.log('====================================================');

