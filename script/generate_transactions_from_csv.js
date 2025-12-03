const fs = require('fs');
const path = require('path');
const iconv = require('iconv-lite');

const ROOT = path.join(__dirname, '..');
const CSV_PATH = path.join(ROOT, 'log', 'purchase_log.csv');
const TRANSACTIONS_DIR = path.join(ROOT, 'log', 'transactions');

function parseCsv(text) {
  const lines = text.replace(/\r/g,'').split('\n').filter(Boolean);
  if (lines.length === 0) return [];
  // ヘッダーの分割（カンマだが引用符対応）
  const splitLine = (ln) => {
    const res = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < ln.length; i++) {
      const ch = ln[i];
      if (ch === '"') { inQuote = !inQuote; continue; }
      if (ch === ',' && !inQuote) { res.push(cur); cur = ''; continue; }
      cur += ch;
    }
    res.push(cur);
    return res.map(s => s.replace(/^"|"$/g,''));
  };
  const headers = splitLine(lines[0]).map(h => h.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = splitLine(lines[i]);
    if (cols.length === 0) continue;
    const obj = {};
    headers.forEach((h, idx) => obj[h] = cols[idx] !== undefined ? cols[idx] : '');
    rows.push(obj);
  }
  return rows;
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function buildTransactionText(txNo, rows) {
  const datetime = rows[0]['日時'] || new Date().toLocaleString('ja-JP');
  let txt = `取引番号: ${txNo}\n`;
  txt += `日時: ${datetime}\n`;
  const foods = rows.filter(r => (r['種別']||'').toLowerCase() === 'food');
  const drinks = rows.filter(r => (r['種別']||'').toLowerCase() === 'drink');
  if (foods.length) {
    txt += 'フード:\n';
    foods.forEach(it => {
      const id = it['商品ID'] ? (it['商品ID'] + ' ') : '';
      const name = it['商品名'] || '';
      const opt = it['オプション'] ? `（${it['オプション']}）` : '';
      const price = it['単価'] || it['価格'] || '';
      const qty = it['数量'] || '1';
      txt += `  ${id}${name}${opt}（￥${price}） x${qty}\n`;
    });
  }
  if (drinks.length) {
    txt += 'ドリンク:\n';
    drinks.forEach(it => {
      const id = it['商品ID'] ? (it['商品ID'] + ' ') : '';
      const name = it['商品名'] || '';
      const opt = it['オプション'] ? `（${it['オプション']}）` : '';
      const price = it['単価'] || it['価格'] || '';
      const qty = it['数量'] || '1';
      txt += `  ${id}${name}${opt}（￥${price}） x${qty}\n`;
    });
  }
  // 合計系は最初の行を参照（同一取引のはず）
  const total = rows[0]['合計'] || '';
  const received = rows[0]['受取額'] || '';
  const change = rows[0]['お釣り'] || '';
  if (total !== '') txt += `合計: ￥${total}\n`;
  if (received !== '') txt += `受取額: ￥${received}\n`;
  if (change !== '') txt += `お釣り: ￥${change}\n`;
  return txt;
}

(async function main(){
  try {
    if (!fs.existsSync(CSV_PATH)) {
      console.error('purchase_log.csv が見つかりません:', CSV_PATH);
      process.exitCode = 1;
      return;
    }
    const buf = fs.readFileSync(CSV_PATH);
    // Shift_JIS としてデコード（ファイルは Shift_JIS で保存されている想定）
    const text = iconv.decode(buf, 'shift_jis');
    const rows = parseCsv(text);
    if (rows.length === 0) {
      console.log('CSV にデータがありません。');
      return;
    }
    ensureDir(TRANSACTIONS_DIR);
    // グループ化
    const grouped = rows.reduce((m, r) => {
      const tx = (r['取引番号'] || r['txNo'] || '').toString().trim();
      if (!tx) return m;
      if (!m[tx]) m[tx] = [];
      m[tx].push(r);
      return m;
    }, {});
    let created = 0, skipped = 0;
    for (const [txNo, groupRows] of Object.entries(grouped)) {
      const outPath = path.join(TRANSACTIONS_DIR, `${txNo}.txt`);
      if (fs.existsSync(outPath)) {
        skipped++;
        continue;
      }
      const txt = buildTransactionText(txNo, groupRows);
      fs.writeFileSync(outPath, iconv.encode(txt, 'shift_jis'));
      created++;
    }
    console.log(`完了: 作成 ${created} 件, 既存スキップ ${skipped} 件, 合計取引 ${Object.keys(grouped).length} 件`);
  } catch (err) {
    console.error('エラー:', err);
    process.exitCode = 1;
  }
})();