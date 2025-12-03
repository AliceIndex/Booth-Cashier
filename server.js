const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const iconv = require('iconv-lite'); // 追加：Shift_JIS エンコード用

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = path.join(__dirname);
const LOG_DIR = path.join(ROOT, 'log');
// 定数（既存: MASTER_LOG を残しても良いが、以降はテキスト出力を行わない）
const MASTER_LOG = path.join(LOG_DIR, 'purchase_log.txt');
const MASTER_CSV = path.join(LOG_DIR, 'purchase_log.csv');
const API_KEY = process.env.LOG_API_KEY || ''; // 必要なら環境変数で設定
const COUNTER_FILE = path.join(LOG_DIR, 'purchase_counter.csv');
const TRANSACTIONS_DIR = path.join(LOG_DIR, 'transactions');

// 日時を取得する関数
function getCurrentDate() {
    const d = new Date();
    const year=d.getFullYear();
    const month=String(d.getMonth()+1).padStart(2,'0');
    const date=String(d.getDate()).padStart(2,'0');
    const CurrentDate = year+month+date;
    return CurrentDate;
}

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

// contents.csv マップ（商品名 -> { id, type, name, price }）
let contentsMapByName = new Map();
let contentsMapById = new Map();

function loadContentsMap() {
    try {
        const csvPath = path.join(ROOT, 'data', 'contents.csv');
        if (!fs.existsSync(csvPath)) return;
        const buf = fs.readFileSync(csvPath);
        // decode Shift_JIS (cp932)
        const text = iconv.decode(buf, 'shift_jis');
        const lines = text.replace(/\r/g,'').split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length <= 1) return;
        const headers = lines[0].split(',').map(h => h.trim());
        const idx = {}; headers.forEach((h,i)=> idx[h] = i);
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g,'').trim());
            const id = cols[idx['id']] || cols[idx['商品ID']] || cols[0] || '';
            const type = (cols[idx['type']] || cols[1] || '').toLowerCase();
            const name = cols[idx['商品名']] || cols[idx['name']] || cols[2] || '';
            const priceStr = cols[idx['価格']] || cols[idx['price']] || cols[3] || '';
            const price = Number(priceStr || 0);
            if (!name) continue;
            const item = { id: String(id), type, name, price };
            contentsMapByName.set(name, item);
            contentsMapById.set(String(id), item);
        }
        console.log('Loaded contents.csv items:', contentsMapByName.size);
    } catch (e) {
        console.error('Failed to load contents.csv', e);
    }
}

// ロード実行（サーバ起動時）
loadContentsMap();

// CSV ヘッダー作成（存在しなければ） - Shift_JIS で書く
function ensureCsvHeader() {
    if (!fs.existsSync(MASTER_CSV)) {
        const header = [
            '取引番号','日時','商品ID','種別','商品名','オプション','単価','数量','行合計','合計','受取額','お釣り'
        ].join(',') + '\n';
        fs.writeFileSync(MASTER_CSV, iconv.encode(header, 'shift_jis'));
    }
}

// strict: contentsMapByName / contentsMapById を使って「実際に登録された商品」のみを保存する

function normalizeName(s){ return (s||'').replace(/\s+/g,' ').trim(); }

// ブロック（1取引）からアイテム配列を抽出し、contents マップで補完・検証する
function extractItemsFromBlock(lines) {
    const headerRegex = /^(フード:?|ドリンク:?)/i;
    const items = [];
    for (let i = 0; i < lines.length; i++) {
        const l = lines[i].trim();
        if (headerRegex.test(l)) {
            const type = /^フード/i.test(l) ? 'food' : 'drink';
            let j = i + 1;
            while (j < lines.length && !/^(合計:|受取額:|お釣り:|取引番号:|日時:)/.test(lines[j])) {
                const itemLine = lines[j].replace(/^\s+/, '');
                // 形式: 名前(オプション)（￥価格）[ x数量] など（日本語括弧を使用）
                const itemMatch = itemLine.match(/^(.+?)(?:（(.+?)）)?（￥?(\d+)）(?:\s*x\s*(\d+))?$/);
                if (itemMatch) {
                    let namePart = normalizeName(itemMatch[1]);
                    let option = (itemMatch[2] || '').trim();
                    let price = itemMatch[3] || '';
                    let qty = Number(itemMatch[4] || '1') || 1;
                    // 名前内にオプションが入っている場合の保険
                    const optMatch = namePart.match(/^(.+?)（(.+)）$/);
                    if (optMatch && !option) {
                        namePart = normalizeName(optMatch[1]);
                        option = optMatch[2];
                    }
                    // マッチ判定: id を先に探し、なければ name で照合（完全一致）
                    let matched = contentsMapByName.get(namePart) || null;
                    // または名前が "1234 商品名" のように先頭に id が付与されている場合も補正
                    if (!matched) {
                        const prefMatch = namePart.match(/^(\d{3,6})\s+(.+)$/);
                        if (prefMatch) {
                            const maybeId = prefMatch[1];
                            const maybeName = normalizeName(prefMatch[2]);
                            matched = contentsMapById.get(maybeId) || contentsMapByName.get(maybeName) || null;
                            if (matched) namePart = matched.name;
                        }
                    }
                    if (matched) {
                        const finalPrice = price || String(matched.price || '');
                        items.push({
                            id: matched.id,
                            type: matched.type || type,
                            name: matched.name,
                            option: option || '',
                            price: finalPrice,
                            qty: Number(qty)
                        });
                    } else {
                        // 未登録商品は保存しない（スキップ）
                    }
                }
                j++;
            }
            i = j - 1;
        } else {
            // ヘッダ無しでもアイテム形式に合致すれば処理（保険）
            const itemMatch = l.match(/^(.+?)(?:（(.+?)）)?（￥?(\d+)）(?:\s*x\s*(\d+))?$/);
            if (itemMatch) {
                let namePart = normalizeName(itemMatch[1]);
                let option = (itemMatch[2] || '').trim();
                let price = itemMatch[3] || '';
                let qty = Number(itemMatch[4] || '1') || 1;
                let matched = contentsMapByName.get(namePart) || null;
                if (!matched) {
                    const prefMatch = namePart.match(/^(\d{3,6})\s+(.+)$/);
                    if (prefMatch) {
                        const maybeId = prefMatch[1];
                        const maybeName = normalizeName(prefMatch[2]);
                        matched = contentsMapById.get(maybeId) || contentsMapByName.get(maybeName) || null;
                        if (matched) namePart = matched.name;
                    }
                }
                if (matched) {
                    const finalPrice = price || String(matched.price || '');
                    items.push({
                        id: matched.id,
                        type: matched.type || '',
                        name: matched.name,
                        option: option || '',
                        price: finalPrice,
                        qty: Number(qty)
                    });
                }
            }
        }
    }
    return items;
}

// テキストログをパースし、登録商品だけの CSV 行を返す。
// 取引に商品が一件も含まれないブロックは無視される（CSV/テキスト保存されない）
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

        // メタ情報抽出
        lines.forEach(l => {
            if (l.startsWith('取引番号:')) txNo = l.replace('取引番号:', '').trim();
            if (l.startsWith('日時:')) datetime = l.replace('日時:', '').trim();
            if (l.startsWith('合計:')) total = l.replace(/合計:\s*￥?/,'').trim();
            if (l.startsWith('受取額:')) received = l.replace(/受取額:\s*￥?/,'').trim();
            if (l.startsWith('お釣り:')) change = l.replace(/お釣り:\s*￥?/,'').trim();
        });

        // items を抽出（contents マップで検証）
        const items = extractItemsFromBlock(lines);

        if (!items || items.length === 0) {
            // このブロックに登録商品が無ければ、保存しない（スキップ）
            return;
        }

        // txNo が無ければサーバーで発番
        if (!txNo) txNo = getServerTxNo();

        // CSV 行を作成（1 商品 = 1 行）
        items.forEach(it => {
            const lineTotal = (Number(it.price || 0) * Number(it.qty || 1)) || 0;
            rows.push({
                txNo: txNo,
                datetime: datetime || '',
                id: it.id || '',
                type: it.type || '',
                name: it.name || '',
                option: it.option || '',
                price: String(it.price || ''),
                qty: String(it.qty || '1'),
                lineTotal: String(lineTotal),
                total: total || '',
                received: received || '',
                change: change || ''
            });
        });
    });
    return rows;
}

// POST /api/save-log の処理：テキスト受信時も、登録商品が一つも無ければ保存しないようにする。
// 既存のハンドラ内のテキスト処理部分を以下のロジックに置き換えてください：

/*
    // 既存:
    // textEntry = payload.trim();
    // csvRows = parseTextLogToCsvRows(textEntry);
    //
    // 置換後:
*/
    // payload は文字列（テキストログ）の場合
    // textEntry をそのまま丸ごと保存せず、登録商品を含むブロックのみを集める
    // 呼び出し元で csvRows を取得し、保存対象のテキストブロックは再構築して保存する


// POST /api/save-log の処理：テキスト受信時も、登録商品が一つも無ければ保存しないようにする。
app.post('/api/save-log', requireApiKey, (req, res) => {
    try {
        const payload = (req.is('application/json')) ? req.body : (req.body || '').toString();
        let textEntry = '';
        let csvRows = [];
        if (typeof payload === 'string') {
            textEntry = payload.trim();
            csvRows = parseTextLogToCsvRows(textEntry);
        } else if (typeof payload === 'object' && payload !== null) {
            // JSON -> 既存処理で csvRows を作る（略 / 既存実装を利用）
            const txs = Array.isArray(payload) ? payload : [payload];
            txs.forEach(tx => {
                const nowStr = tx.datetime || new Date().toLocaleString('ja-JP');
                const txNo = tx.txNo && String(tx.txNo).trim() !== '' ? String(tx.txNo) : getServerTxNo();
                if (Array.isArray(tx.items) && tx.items.length) {
                    tx.items.forEach(it => {
                        // items はサーバー側でも contentsMapById/Name で検証済みであることを期待
                        csvRows.push({
                            txNo: txNo,
                            datetime: nowStr,
                            id: it.id || '',
                            type: it.type || '',
                            name: it.name || '',
                            option: it.option || '',
                            price: it.price != null ? String(it.price) : '',
                            qty: it.qty != null ? String(it.qty) : (it.quantity != null ? String(it.quantity) : '1'),
                            lineTotal: ( (Number(it.price || 0) * Number(it.qty || 1)) || '' ),
                            total: tx.total != null ? String(tx.total) : '',
                            received: tx.received != null ? String(tx.received) : '',
                            change: tx.change != null ? String(tx.change) : ''
                        });
                    });
                }
            });
            // テキスト部分は不要（CSV のみ出力する方針）
            textEntry = '';
        } else {
            return res.status(400).json({ error: 'Unsupported payload' });
        }

        if (!csvRows || csvRows.length === 0) {
            // 登録済み商品が無く CSV 行がない場合は保存しない
            return res.status(200).json({ ok: true, written: { csv: MASTER_CSV, rows: 0 }, message: 'No registered items to save' });
        }

        // CSV に追記（Shift_JIS）
        ensureCsvHeader();
        const csvLines = csvRows.map(r => {
            const cols = [
                r.txNo || '',
                r.datetime || '',
                r.id || '',
                r.type || '',
                r.name || '',
                r.option || '',
                r.price || '',
                r.qty || '1',
                r.lineTotal || '',
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

        // 取引別ファイルを作成（transactions/<yyyymmdd>/<txNo>.txt） - 既存ファイルがあればスキップ
        const grouped = new Map();
        csvRows.forEach(r => {
            const tx = r.txNo || 'unknown';
            if (!grouped.has(tx)) grouped.set(tx, []);
            grouped.get(tx).push(r);
        });

        grouped.forEach((rows, txNo) => {
            // 日付ディレクトリを決定（行の日時を優先、無ければサーバー現在日時）
            let datetimeStr = (rows[0] && rows[0].datetime) ? rows[0].datetime : '';
            let d = new Date(datetimeStr);
            if (isNaN(d.getTime())) d = new Date();
            const pad = n => String(n).padStart(2, '0');
            const dateDirName = `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}`; // yyyymmdd

            const dayDir = path.join(TRANSACTIONS_DIR, dateDirName);
            if (!fs.existsSync(dayDir)) fs.mkdirSync(dayDir, { recursive: true });

            // 再構築するテキスト内容
            const datetime = (rows[0] && rows[0].datetime) ? rows[0].datetime : new Date().toLocaleString('ja-JP');
            let txt = `取引番号: ${txNo}\n`;
            txt += `日時: ${datetime}\n`;

            // 種別ごとにグループ化（food / drink / others をサポート）
            const toType = s => (s || '').toString().trim().toLowerCase();
            const foods = rows.filter(r => toType(r.type) === 'food');
            const drinks = rows.filter(r => toType(r.type) === 'drink');
            const others = rows.filter(r => toType(r.type) === 'others');

            if (foods.length) {
                txt += 'フード:\n';
                foods.forEach(it => {
                    txt += `  ${it.id ? it.id + ' ' : ''}${it.name}${it.option ? '（' + it.option + '）' : ''}（￥${it.price}） x${it.qty}\n`;
                });
            }
            if (drinks.length) {
                txt += 'ドリンク:\n';
                drinks.forEach(it => {
                    txt += `  ${it.id ? it.id + ' ' : ''}${it.name}${it.option ? '（' + it.option + '）' : ''}（￥${it.price}） x${it.qty}\n`;
                });
            }
            if (others.length) {
                txt += 'その他:\n';
                others.forEach(it => {
                    txt += `  ${it.id ? it.id + ' ' : ''}${it.name}${it.option ? '（' + it.option + '）' : ''}（￥${it.price}） x${it.qty}\n`;
                });
            }

            const total = rows[0] && rows[0].total ? rows[0].total : String(rows.reduce((s,r)=> s + Number(r.lineTotal||0),0));
            const received = rows[0] && rows[0].received ? rows[0].received : '';
            const change = rows[0] && rows[0].change ? rows[0].change : '';
            txt += `合計: ￥${total}\n`;
            if (received !== '') txt += `受取額: ￥${received}\n`;
            if (change !== '') txt += `お釣り: ￥${change}\n`;

            const outPath = path.join(dayDir, `${txNo}.txt`);
            if (fs.existsSync(outPath)) {
                // 既存ファイルがあればスキップ
                return;
            }
            fs.writeFileSync(outPath, iconv.encode(txt, 'shift_jis'));
        });
        
        console.log("Success : Save TransactionData from Client.")
        return res.json({ ok: true, written: { csv: MASTER_CSV, rows: csvRows.length, transactionsDir: TRANSACTIONS_DIR } });
    } catch (err) {
        console.error('save-log error', err);
        return res.status(500).json({ error: 'Failed to save log' });
    }
});

// GET /api/logs: テキストログではなく CSV を返す（存在しなければ空を返す）
app.get('/api/logs', requireApiKey, (req, res) => {
    try {
        if (!fs.existsSync(MASTER_CSV)) {
            res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
            return res.send('');
        }
        const buf = fs.readFileSync(MASTER_CSV);
        res.setHeader('Content-Type', 'text/csv; charset=Shift_JIS');
        res.send(buf);
    } catch (err) {
        console.error('read logs error', err);
        res.status(500).send('Failed to read logs');
    }
});

// GET /api/download-log: マスターのダウンロードは CSV のみ提供する
app.get('/api/download-log', requireApiKey, (req, res) => {
    if (!fs.existsSync(MASTER_CSV)) return res.status(404).send('No csv');
    res.download(MASTER_CSV, 'purchase_log.csv', err => {
        if (err) {
            console.error('download error', err);
            res.status(500).send('Download failed');
        }
    });
});

// GET /api/download-csv は既存のまま CSV をダウンロード（保護）
app.get('/api/download-csv', requireApiKey, (req, res) => {
    if (!fs.existsSync(MASTER_CSV)) return res.status(404).send('No csv');
    res.download(MASTER_CSV, 'purchase_log.csv', err => {
        if (err) {
            console.error('download csv error', err);
            res.status(500).send('Download failed');
        }
    });
});

// DELETE /api/clear-logs: テキストログは削除せず CSV のみを対象にする
app.delete('/api/clear-logs', requireApiKey, (req, res) => {
    try {
        if (fs.existsSync(MASTER_CSV)) fs.unlinkSync(MASTER_CSV);
        // テキストログ（purchase_log.txt）や日別テキストは生成しなくなったため削除対象から外す
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

function readServerCounter() {
    try {
        if (!fs.existsSync(COUNTER_FILE)) return 9001;
        const s = fs.readFileSync(COUNTER_FILE, 'utf8').trim();
        const lines = s.split(/\r?\n/).filter(Boolean);
        if (!lines.length) return [getCurrentDate(), 9001];
        for (let i = 0; i < lines.length; i++) {
            if(lines[i].split(" ").includes(getCurrentDate())){
                const n = Number(lines[i].split(" ")[1]);
                if (!isNaN(n) && n >= 9001 && n <= 9999) {
                    return [getCurrentDate(), n];
                }else{
                    return [getCurrentDate(), 9001];
                }
            }
        }
    } catch (e) {
        console.error('readServerCounter error', e);
        return [getCurrentDate(), 9001];
    }
}

function writeServerCounter(counter) {
    try {
        if (!fs.existsSync(COUNTER_FILE)) return;
        const s = fs.readFileSync(COUNTER_FILE, 'utf8').trim();
        const lines = s.split(/\r?\n/).filter(Boolean);
        if (!lines.length) return;
        for (let i = 0; i < lines.length; i++) {
            if(lines[i].split(" ").includes(getCurrentDate())){
                const n = Number(lines[i].split(" ")[1]);
                if (!isNaN(n) && n >= 9001 && n <= 9999) {
                    if(n >= counter){
                        lines[i] = getCurrentDate()+" "+String(n+1);
                    }else{
                        lines[i] = getCurrentDate()+" "+String(counter);
                    }
                }else{
                    return;
                }
            }
        }
        const updatedContent = lines.join('\n');
        fs.writeFileSync(COUNTER_FILE, updatedContent, 'utf8');
    } catch (e) {
        console.error('writeServerCounter error', e);
    }
}

// サーバー側で取引番号を取得（9001〜9999、インクリメントして永続化）
function getServerTxNo() {
    const current = readServerCounter();
    const txNo = current[1];
    let next = current + 1;
    if (next > 9999) next = 9001;
    return txNo;
}

app.get('/api/get-TxNo', requireApiKey, (req, res) => {
    console.log("send ServerTxNo from Server.")
    return res.send(getServerTxNo()), err => {
        console.error('get-TxNo error', err);
        res.status(500).send('Failed to get TxNo');
    };
});

app.post('/api/update-counter', requireApiKey, (req, res) => {
    try {
        const payload = req.body;
        const n = Number(payload.counter);
        if (isNaN(n)) {
            return res.status(400).json({ error: 'Invalid counter value' });
        }else{
            if (n < 9001 || n > 9999) {
                return res.status(400).json({ error: 'Counter value out of range' });
            }
        }
        writeServerCounter(n);
        console.log("update ServerTxNo from Client.")
        return res.json({ ok: true });
    } catch (err) {
        console.error('update-counter error', err);
        return res.status(500).json({ error: 'Failed to update counter' });
    }
});