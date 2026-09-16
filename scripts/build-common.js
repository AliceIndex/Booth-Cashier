const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

/**
 * ビルド出力先ディレクトリの準備（フォルダ作成、アセット同期）
 * @param {string} distDir 出力先ディレクトリ
 */
function prepareDist(distDir) {
  if (!fs.existsSync(distDir)) {
    fs.mkdirSync(distDir, { recursive: true });
  }

  // 初期 data / log フォルダの作成
  const distData = path.join(distDir, 'data');
  const distLog = path.join(distDir, 'log');
  if (!fs.existsSync(distData)) fs.mkdirSync(distData, { recursive: true });
  if (!fs.existsSync(distLog)) fs.mkdirSync(distLog, { recursive: true });

  // 初期 contents.csv コピー
  const srcCsv = path.join(ROOT, 'data', 'contents.csv');
  const destCsv = path.join(distData, 'contents.csv');
  if (fs.existsSync(srcCsv) && !fs.existsSync(destCsv)) {
    fs.copyFileSync(srcCsv, destCsv);
    console.log(`Copied default contents.csv to ${path.relative(ROOT, destCsv)}`);
  }

  // 静的ファイル（HTML, CSS, JS）の同期コピー
  ['index.html', 'cashier.html', 'admin.html', 'portal.html'].forEach(html => {
    const src = path.join(ROOT, html);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(distDir, html));
    }
  });

  ['css', 'js'].forEach(dir => {
    const srcDir = path.join(ROOT, dir);
    const destDir = path.join(distDir, dir);
    if (fs.existsSync(srcDir)) {
      fs.cpSync(srcDir, destDir, { recursive: true, force: true });
    }
  });

  console.log(`Synchronized static assets (HTML, css, js) to ${path.relative(ROOT, distDir)}/`);
}

/**
 * @yao-pkg/pkg による Windows 実行ファイル生成
 * @param {string} targetExe 出力先 exe フルパス
 */
function runPkgBuild(targetExe) {
  const pkgCmd = `npx @yao-pkg/pkg server.js -c package.json --targets node22-win-x64 --output "${targetExe}"`;
  console.log(`Running: ${pkgCmd}`);
  execSync(pkgCmd, { cwd: ROOT, stdio: 'inherit' });
}

module.exports = {
  ROOT,
  prepareDist,
  runPkgBuild
};

