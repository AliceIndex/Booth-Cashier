const path = require('path');
const { ROOT, prepareDist, runPkgBuild } = require('./build-common');
const { patchSubsystemToGui } = require('./patch-subsystem');

const DIST_BIN = path.join(ROOT, 'dist', 'bin');
const TARGET_EXE = path.join(DIST_BIN, 'booth-cashier.exe');

console.log('====================================================');
console.log('BUILDING PRODUCTION EXECUTABLE (GUI Subsystem)');
console.log('====================================================');

console.log('\n=== [1/3] Preparing output directories & assets ===');
prepareDist(DIST_BIN);

console.log('\n=== [2/3] Building executable with @yao-pkg/pkg ===');
runPkgBuild(TARGET_EXE);

console.log('\n=== [3/3] Patching PE Subsystem to GUI (hide console) ===');
patchSubsystemToGui(TARGET_EXE);

console.log('\n====================================================');
console.log(`Build complete! Executable generated at:`);
console.log(`  ${TARGET_EXE}`);
console.log('====================================================');
