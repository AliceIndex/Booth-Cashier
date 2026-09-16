const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { patchSubsystemToGui } = require('./patch-subsystem');

const ROOT = path.resolve(__dirname, '..');
const DIST_BIN = path.join(ROOT, 'dist', 'bin');
const TARGET_EXE = path.join(DIST_BIN, 'booth-cashier.exe');

console.log('=== [1/3] Preparing output directories ===');
if (!fs.existsSync(DIST_BIN)) {
  fs.mkdirSync(DIST_BIN, { recursive: true });
}

// 初期 data / log フォルダの作成
const distData = path.join(DIST_BIN, 'data');
const distLog = path.join(DIST_BIN, 'log');
if (!fs.existsSync(distData)) fs.mkdirSync(distData, { recursive: true });
if (!fs.existsSync(distLog)) fs.mkdirSync(distLog, { recursive: true });

const srcCsv = path.join(ROOT, 'data', 'contents.csv');
const destCsv = path.join(distData, 'contents.csv');
if (fs.existsSync(srcCsv) && !fs.existsSync(destCsv)) {
  fs.copyFileSync(srcCsv, destCsv);
  console.log('Copied default contents.csv to dist/bin/data/');
}

// 静的ファイル（HTML, css, script）を dist/bin にも同期コピー（冗長性・安全性向上）
['index.html', 'cashier.html', 'admin.html', 'portal.html'].forEach(html => {
  const src = path.join(ROOT, html);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(DIST_BIN, html));
});
['css', 'script'].forEach(dir => {
  const srcDir = path.join(ROOT, dir);
  const destDir = path.join(DIST_BIN, dir);
  if (fs.existsSync(srcDir)) {
    fs.cpSync(srcDir, destDir, { recursive: true, force: true });
  }
});
console.log('Synchronized static assets to dist/bin/');

console.log('=== [2/3] Building executable with @yao-pkg/pkg ===');
// @yao-pkg/pkg を実行（-c package.json で assets 設定を確実に反映）
const pkgCmd = `npx @yao-pkg/pkg server.js -c package.json --targets node22-win-x64 --output "${TARGET_EXE}"`;
console.log(`Running: ${pkgCmd}`);
execSync(pkgCmd, { cwd: ROOT, stdio: 'inherit' });

console.log('=== [3/3] Patching PE Subsystem to GUI (hide console) ===');
patchSubsystemToGui(TARGET_EXE);

console.log('====================================================');
console.log(`Build complete! Executable generated at:`);
console.log(`  ${TARGET_EXE}`);
console.log('====================================================');

