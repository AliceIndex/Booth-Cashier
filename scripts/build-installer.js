const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');
const innosetup = require('innosetup-compiler');

const ROOT = path.resolve(__dirname, '..');
const ISS_PATH = path.join(ROOT, 'installer', 'setup.iss');
const OUTPUT_DIR = path.join(ROOT, 'dist', 'installer');

async function buildInstaller() {
  console.log('====================================================');
  console.log('STEP 1: Building Windows Executable (.exe)');
  console.log('====================================================');
  execSync('node scripts/build-exe.js', { cwd: ROOT, stdio: 'inherit' });

  console.log('\n====================================================');
  console.log('STEP 2: Compiling Windows Installer with Inno Setup');
  console.log('====================================================');

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  console.log(`Compiling ISS script: ${ISS_PATH}`);
  try {
    await innosetup(ISS_PATH, { verbose: true });
    console.log('\n====================================================');
    console.log('SUCCESS: Installer created successfully!');
    console.log(`Output Directory: ${OUTPUT_DIR}`);
    const files = fs.readdirSync(OUTPUT_DIR);
    files.forEach(f => console.log(`  - ${f}`));
    console.log('====================================================');
  } catch (err) {
    console.error('Failed to compile Inno Setup installer:', err);
    process.exit(1);
  }
}

buildInstaller();

