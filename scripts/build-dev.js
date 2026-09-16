const path = require('path');
const { ROOT, prepareDist, runPkgBuild } = require('./build-common');

const DIST_DEV = path.join(ROOT, 'dist', 'dev');
const TARGET_EXE = path.join(DIST_DEV, 'booth-cashier-dev.exe');

console.log('====================================================');
console.log('BUILDING DEVELOPER / DEBUG EXECUTABLE (With Console)');
console.log('====================================================');

console.log('\n=== [1/2] Preparing dev output directory & assets ===');
prepareDist(DIST_DEV);

console.log('\n=== [2/2] Building executable with @yao-pkg/pkg (Console Subsystem) ===');
runPkgBuild(TARGET_EXE);

console.log('\n====================================================');
console.log('Developer Build complete!');
console.log(`Executable (with console output):`);
console.log(`  ${TARGET_EXE}`);
console.log('\nDouble-clicking this exe will launch a terminal window');
console.log('showing real-time server logs and API activity.');
console.log('====================================================');
