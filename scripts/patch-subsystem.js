const fs = require('fs');
const path = require('path');

/**
 * Windows PE (Portable Executable) バイナリの Subsystem を
 * CUI (3: コンソール) から GUI (2: Windows) に書き換えます。
 * これにより、ダブルクリック時に黒いターミナル画面が表示されなくなります。
 */
function patchSubsystemToGui(exePath) {
  if (!fs.existsSync(exePath)) {
    throw new Error(`Target exe not found: ${exePath}`);
  }

  const fd = fs.openSync(exePath, 'r+');
  try {
    // 0x3C にある PE ヘッダーオフセット (e_lfanew) を取得
    const peOffsetBuf = Buffer.alloc(4);
    fs.readSync(fd, peOffsetBuf, 0, 4, 0x3c);
    const peOffset = peOffsetBuf.readUInt32LE(0);

    // PE シグネチャ確認
    const peSigBuf = Buffer.alloc(4);
    fs.readSync(fd, peSigBuf, 0, 4, peOffset);
    if (peSigBuf.toString('ascii') !== 'PE\0\0') {
      throw new Error('Invalid PE signature');
    }

    // Optional Header Magic を確認 (PE32: 0x10b, PE32+: 0x20b)
    const magicBuf = Buffer.alloc(2);
    fs.readSync(fd, magicBuf, 0, 2, peOffset + 24);
    const magic = magicBuf.readUInt16LE(0);

    let subsystemOffset;
    if (magic === 0x20b) {
      // 64-bit (PE32+)
      subsystemOffset = peOffset + 24 + 68;
    } else if (magic === 0x10b) {
      // 32-bit (PE32)
      subsystemOffset = peOffset + 24 + 68;
    } else {
      throw new Error(`Unsupported PE magic: 0x${magic.toString(16)}`);
    }

    // 現在の Subsystem 値を取得
    const subBuf = Buffer.alloc(2);
    fs.readSync(fd, subBuf, 0, 2, subsystemOffset);
    const currentSubsystem = subBuf.readUInt16LE(0);

    console.log(`Current PE Subsystem: ${currentSubsystem} (${currentSubsystem === 3 ? 'CUI / Console' : currentSubsystem === 2 ? 'GUI / Windows' : 'Other'})`);

    if (currentSubsystem === 3) {
      // 3 (CUI) -> 2 (GUI) にパッチ
      subBuf.writeUInt16LE(2, 0);
      fs.writeSync(fd, subBuf, 0, 2, subsystemOffset);
      console.log(`Successfully patched PE Subsystem to 2 (GUI / Windows). Terminal will NOT be shown on launch.`);
    } else if (currentSubsystem === 2) {
      console.log(`Subsystem is already 2 (GUI). No patch needed.`);
    } else {
      console.warn(`Unexpected subsystem value: ${currentSubsystem}`);
    }
  } finally {
    fs.closeSync(fd);
  }
}

// コマンドライン引数から実行された場合
if (require.main === module) {
  const targetExe = process.argv[2];
  if (!targetExe) {
    console.error('Usage: node patch-subsystem.js <path-to-exe>');
    process.exit(1);
  }
  try {
    patchSubsystemToGui(path.resolve(targetExe));
  } catch (err) {
    console.error('Failed to patch PE subsystem:', err);
    process.exit(1);
  }
}

module.exports = { patchSubsystemToGui };

