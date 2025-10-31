const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const iconv = require('iconv-lite'); // 追加：Shift_JIS エンコード用

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname);
const LOG_DIR = path.join(ROOT, 'log');
const MASTER_LOG = path.join(LOG_DIR, 'purchase_log.txt');
const MASTER_CSV = path.join(LOG_DIR, 'purchase_log.csv');
const API_KEY = process.env.LOG_API_KEY || ''; // 必要なら環境変数で設定

app.use(cors());
app.use(express.json({ limit: '5mb' }));      // JSON 受信
app.use(express.text({ type: '*/*', limit: '10mb' })); // プレーンテキスト受信

// 静的ファイル配信
app.use(express.static(ROOT));

// 簡易APIキー検査（API_KEY が設定されている場合のみ要求）
function requireApiKey(req, res, next) {
    if (!API_KEY) return next();
    const key = req.get('x-api-key') || req.query.api_key;
    if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// logフォルダ作成
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

// ユーティリティ: 日付文字列 YYYY-MM-DD_HHMMSS
function timestampString() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// CSV ヘッダー作成（存在しなければ） - Shift_JIS で書く
function ensureCsvHeader() {
    if (!fs.existsSync(MASTER_CSV)) {
        const header = ['取引番号','日時','種別','商品名','オプション','単価','合計','受取額','お釣り'].join(',') + '\n';
        fs.writeFileSync(MASTER_CSV, iconv.encode(header, 'shift_jis'));
    }
}

// テキストログブロックをパースして CSV 用の行配列を作る
// 入力は 1 つまたは複数の取引ブロック（'---' 区切り）
function parseTextLogToCsvRows(text) {
    const blocks = text.split(/\r?\n---\r?\n/).map(b => b.trim()).filter(Boolean);
    const rows = [];
    blocks.forEach(block => {
        const lines = block.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        let txNo = '';
        let datetime = '';
        let total = '';
        let received = '';
        let change = '';
        const items = []; // { type, name, option, price }

        for (let i = 0; i < lines.length; i++) {
            const l = lines[i];
            if (l.startsWith('取引番号:')) {
                txNo = l.replace('取引番号:', '').trim();
                continue;
            }
            if (l.startsWith('日時:')) {
                datetime = l.replace('日時:', '').trim();
                continue;
            }
            if (l.startsWith('合計:')) {
                total = l.replace(/合計:\s*￥?/,'').trim();
                continue;
            }
            if (l.startsWith('受取額:')) {
                received = l.replace(/受取額:\s*￥?/,'').trim();
                continue;
            }
            if (l.startsWith('お釣り:')) {
                change = l.replace(/お釣り:\s*￥?/,'').trim();
                continue;
            }
            // フード/ドリンクヘッダはスキップ
            if (/^フード:?$/i.test(l) || /^ドリンク:?$/i.test(l)) {
                // determine type for subsequent lines
                const type = l.startsWith('フード') ? 'food' : 'drink';
                // read following indented lines as items
                let j = i+1;
                while (j < lines.length && /^\s*.+/.test(lines[j]) && !/^(合計:|受取額:|お釣り:|取引番号:|日時:)/.test(lines[j])) {
                    const itemLine = lines[j].replace(/^\s+/, '');
                    // itemLine examples:
                    // "カレー（￥500）"
                    // "コーラ（M）（￥200）"
                    // extract price at end
                    const mPrice = itemLine.match(/（￥?(\d+)）$/);
                    let price = '';
                    let namePart = itemLine;
                    if (mPrice) {
                        price = mPrice[1];
                        namePart = itemLine.slice(0, mPrice.index).trim();
                    }
                    // namePart may include option in parentheses: "コーラ（M）"
                    let name = namePart;
                    let option = '';
                    const optMatch = namePart.match(/^(.+?)（(.+)）$/);
                    if (optMatch) {
                        name = optMatch[1].trim();
                        option = optMatch[2].trim();
                    }
                    items.push({ type, name, option, price });
                    j++;
                }
                i = j - 1;
            }
        }

        // If parsed items empty but there are lines matching item pattern elsewhere, attempt a generic scan
        if (items.length === 0) {
            const genericItemRegex = /^(.+?)（￥?(\d+)）$/;
            lines.forEach(l => {
                const gm = l.match(genericItemRegex);
                if (gm) {
                    items.push({ type: 'unknown', name: gm[1].trim(), option: '', price: gm[2] });
                }
            });
        }

        if (items.length > 0) {
            items.forEach(it => {
                rows.push({
                    txNo: txNo || '',
                    datetime: datetime || '',
                    type: it.type || '',
                    name: it.name || '',
                    option: it.option || '',
                    price: it.price || '',
                    total: total || '',
                    received: received || '',
                    change: change || ''
                });
            });
        } else {
            // 取引単位のサマリ行（商品無しでも1行残す）
            rows.push({
                txNo: txNo || '',
                datetime: datetime || '',
                type: '',
                name: '',
                option: '',
                price: '',
                total: total || '',
                received: received || '',
                change: change || ''
            });
        }
    });

    return rows;
}

// POST /api/save-log 受信したテキスト/JSON をマスターと日別ファイルに追記し CSV にも追記
app.post('/api/save-log', requireApiKey, (req, res) => {
    try {
        const payload = (req.is('application/json')) ? req.body : (req.body || '').toString();
        let textEntry = '';
        let csvRows = [];
        if (typeof payload === 'string') {
            textEntry = payload.trim();
            csvRows = parseTextLogToCsvRows(textEntry);
        } else if (typeof payload === 'object' && payload !== null) {
            // Expect payload to be either a single transaction object or an array of such objects
            const txs = Array.isArray(payload) ? payload : [payload];
            const blocks = [];
            txs.forEach(tx => {
                // build human-readable text block similar to client format
                const nowStr = tx.datetime || new Date().toLocaleString('ja-JP');
                const txNo = tx.txNo || '';
                let block = '';
                if (txNo) block += `取引番号: ${txNo}\n`;
                block += `日時: ${nowStr}\n`;
                if (Array.isArray(tx.items) && tx.items.length) {
                    const foods = tx.items.filter(i => (i.type || '').toLowerCase() === 'food');
                    const drinks = tx.items.filter(i => (i.type || '').toLowerCase() === 'drink');
                    if (foods.length) {
                        block += 'フード:\n';
                        foods.forEach(it => block += `  ${it.name}${it.option ? '（' + it.option + '）' : ''}（￥${it.price}）\n`);
                    }
                    if (drinks.length) {
                        block += 'ドリンク:\n';
                        drinks.forEach(it => block += `  ${it.name}${it.option ? '（' + it.option + '）' : ''}（￥${it.price}）\n`);
                    }
                } else if (tx.text) {
                    block += tx.text + '\n';
                }
                if (tx.total != null) block += `合計: ￥${tx.total}\n`;
                if (tx.received != null) block += `受取額: ￥${tx.received}\n`;
                if (tx.change != null) block += `お釣り: ￥${tx.change}\n`;
                block += '---\n';
                blocks.push(block);
            });
            textEntry = blocks.join('\n');
            csvRows = [];
            txs.forEach(tx => {
                // transform structured tx into csv rows
                if (Array.isArray(tx.items) && tx.items.length) {
                    tx.items.forEach(it => {
                        csvRows.push({
                            txNo: tx.txNo || '',
                            datetime: tx.datetime || '',
                            type: it.type || '',
                            name: it.name || '',
                            option: it.option || '',
                            price: it.price != null ? String(it.price) : '',
                            total: tx.total != null ? String(tx.total) : '',
                            received: tx.received != null ? String(tx.received) : '',
                            change: tx.change != null ? String(tx.change) : ''
                        });
                    });
                } else {
                    csvRows.push({
                        txNo: tx.txNo || '',
                        datetime: tx.datetime || '',
                        type: '',
                        name: '',
                        option: '',
                        price: '',
                        total: tx.total != null ? String(tx.total) : '',
                        received: tx.received != null ? String(tx.received) : '',
                        change: tx.change != null ? String(tx.change) : ''
                    });
                }
            });
        } else {
            return res.status(400).json({ error: 'Unsupported payload' });
        }

        if (!textEntry.trim()) return res.status(400).json({ error: 'No log content' });

        const timestamp = new Date();
        const dateStr = timestamp.toISOString().slice(0, 10); // YYYY-MM-DD
        const dailyFile = path.join(LOG_DIR, `purchase_log-${dateStr}.txt`);

        // append テキストログ を Shift_JIS で書く
        fs.appendFileSync(MASTER_LOG, iconv.encode(textEntry + '\n', 'shift_jis'));
        fs.appendFileSync(dailyFile, iconv.encode(textEntry + '\n', 'shift_jis'));

        // write single transaction backup files (Shift_JIS)
        const singleFileName = `purchase_${dateStr}_${timestampString()}.txt`;
        const singlePath = path.join(LOG_DIR, singleFileName);
        fs.writeFileSync(singlePath, iconv.encode(textEntry, 'shift_jis'));

        // append CSV rows (Shift_JIS)
        if (csvRows && csvRows.length) {
            ensureCsvHeader();
            const csvLines = csvRows.map(r => {
                const cols = [
                    r.txNo || '',
                    r.datetime || '',
                    r.type || '',
                    r.name || '',
                    r.option || '',
                    r.price || '',
                    r.total || '',
                    r.received || '',
                    r.change || ''
                ];
                return cols.map(c => {
                    if (String(c).includes('"') || String(c).includes(',') || String(c).includes('\n')) {
                        return `"${String(c).replace(/"/g, '""')}"`;
                    }
                    return String(c);
                }).join(',');
            }).join('\n') + '\n';
            fs.appendFileSync(MASTER_CSV, iconv.encode(csvLines, 'shift_jis'));
        }

        return res.json({ ok: true, written: { master: MASTER_LOG, daily: dailyFile, single: singlePath, csv: MASTER_CSV, rows: csvRows.length } });
    } catch (err) {
        console.error('save-log error', err);
        return res.status(500).json({ error: 'Failed to save log' });
    }
});

// GET /api/logs マスターの内容を返す（Shift_JIS のまま返す）
app.get('/api/logs', requireApiKey, (req, res) => {
    try {
        if (!fs.existsSync(MASTER_LOG)) return res.type('text/plain').send('');
        const buf = fs.readFileSync(MASTER_LOG);
        res.setHeader('Content-Type', 'text/plain; charset=Shift_JIS');
        res.send(buf);
    } catch (err) {
        console.error('read logs error', err);
        res.status(500).send('Failed to read logs');
    }
});

// GET /api/download-log マスターをダウンロードさせる（res.download はそのままで OK）
app.get('/api/download-log', requireApiKey, (req, res) => {
    if (!fs.existsSync(MASTER_LOG)) return res.status(404).send('No log');
    res.download(MASTER_LOG, 'purchase_log.txt', err => {
        if (err) {
            console.error('download error', err);
            res.status(500).send('Download failed');
        }
    });
});

// GET /api/download-csv CSV をダウンロード（Shift_JIS）
app.get('/api/download-csv', requireApiKey, (req, res) => {
    if (!fs.existsSync(MASTER_CSV)) return res.status(404).send('No csv');
    res.download(MASTER_CSV, 'purchase_log.csv', err => {
        if (err) {
            console.error('download csv error', err);
            res.status(500).send('Download failed');
        }
    });
});

// DELETE /api/clear-logs マスターを消去（CSVはオプションで消す）
app.delete('/api/clear-logs', requireApiKey, (req, res) => {
    try {
        if (fs.existsSync(MASTER_LOG)) fs.unlinkSync(MASTER_LOG);
        // CSVは削除しない場合はコメントアウト
        if (req.query.delete_csv === '1' && fs.existsSync(MASTER_CSV)) fs.unlinkSync(MASTER_CSV);
        return res.json({ ok: true });
    } catch (err) {
        console.error('clear-logs error', err);
        return res.status(500).json({ error: 'Failed to clear logs' });
    }
});

// ルートフォールバック
app.get('/', (req, res) => {
    const indexPath = path.join(ROOT, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    return res.send('Booth Cashier server running');
});

app.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
});