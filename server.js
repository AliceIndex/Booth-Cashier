const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const iconv = require('iconv-lite'); // 追加：Shift_JIS エンコード用
const os = require('os');
const qrcode = require('qrcode');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

// パス定義: 静的アセットは内蔵(STATIC_ROOT)、データ/ログは外部(DATA_ROOT)
const STATIC_ROOT = __dirname;
const DATA_ROOT = process.pkg ? path.dirname(process.execPath) : __dirname;
const LOG_DIR = path.join(DATA_ROOT, 'log');
const DATA_DIR = path.join(DATA_ROOT, 'data');

const MASTER_CSV = path.join(LOG_DIR, 'purchase_log.csv');
const API_KEY = process.env.LOG_API_KEY || ''; // 必要なら環境変数で設定
const COUNTER_FILE = path.join(LOG_DIR, 'purchase_counter.csv');
const TRANSACTIONS_DIR = path.join(LOG_DIR, 'transactions');

// 日時を取得する関数
function getCurrentDate() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const date = String(d.getDate()).padStart(2, '0');
    const CurrentDate = year + month + date;
    return CurrentDate;
}

app.use(cors());
app.use(express.json({ limit: '5mb' }));      // JSON 受信
app.use(express.text({ type: '*/*', limit: '10mb' })); // プレーンテキスト受信

// 管理画面へのアクセス制限ミドルウェア
app.use('/admin.html', (req, res, next) => {
    const clientIp = req.ip || (req.socket && req.socket.remoteAddress) || (req.connection && req.connection.remoteAddress);
    // 127.0.0.1 または ::1 (IPv6) からのアクセスのみ許可
    if (clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1') {
        next();
    } else {
        res.status(403).send('Forbidden: 管理画面はサーバーPCからのみアクセス可能です。');
    }
});

// 静的ファイル配信（内蔵アセット + 外部フォルダ）
app.use(express.static(STATIC_ROOT));
if (DATA_ROOT !== STATIC_ROOT) {
    app.use(express.static(DATA_ROOT));
}

// pkg snapshot 仮想ファイルシステム用フォールバック
app.use((req, res, next) => {
    let reqPath = req.path;
    if (reqPath === '/') reqPath = '/index.html';

    const candidatePaths = [
        path.join(STATIC_ROOT, reqPath),
        path.join(DATA_ROOT, reqPath)
    ];

    for (const localFilePath of candidatePaths) {
        try {
            if (fs.existsSync(localFilePath) && fs.statSync(localFilePath).isFile()) {
                const ext = path.extname(localFilePath).toLowerCase();
                const mimeTypes = {
                    '.html': 'text/html; charset=UTF-8',
                    '.css': 'text/css; charset=UTF-8',
                    '.js': 'application/javascript; charset=UTF-8',
                    '.json': 'application/json; charset=UTF-8',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon'
                };
                const contentType = mimeTypes[ext] || 'application/octet-stream';
                res.setHeader('Content-Type', contentType);
                return res.send(fs.readFileSync(localFilePath));
            }
        } catch (e) {
            // 次の候補へ
        }
    }
    next();
});

// 簡易APIキー検査（API_KEY が設定されている場合のみ要求）
function requireApiKey(req, res, next) {
    if (!API_KEY) return next();
    const key = req.get('x-api-key') || req.query.api_key;
    if (key !== API_KEY) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

// フォルダ作成
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });
if (!fs.existsSync(TRANSACTIONS_DIR)) fs.mkdirSync(TRANSACTIONS_DIR, { recursive: true });

// 初期 contents.csv のコピー（外部に存在しない場合）
const externalCsvPath = path.join(DATA_DIR, 'contents.csv');
const internalCsvPath = path.join(STATIC_ROOT, 'data', 'contents.csv');
if (!fs.existsSync(externalCsvPath) && fs.existsSync(internalCsvPath)) {
    try {
        fs.copyFileSync(internalCsvPath, externalCsvPath);
        console.log('Copied default contents.csv to:', externalCsvPath);
    } catch (e) {
        console.error('Failed to initialize contents.csv:', e);
    }
}

// ユーティリティ: 日付文字列 YYYY-MM-DD_HHMMSS
function timestampString() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

// contents.csv マップ（商品名 -> { id, type, name, price }）
let contentsMapByName = new Map();
let contentsMapById = new Map();

function loadContentsMap() {
    try {
        let csvPath = path.join(DATA_DIR, 'contents.csv');
        if (!fs.existsSync(csvPath)) {
            csvPath = path.join(STATIC_ROOT, 'data', 'contents.csv');
        }
        if (!fs.existsSync(csvPath)) return;
        const buf = fs.readFileSync(csvPath);
        // decode Shift_JIS (cp932)
        const text = iconv.decode(buf, 'shift_jis');
        const lines = text.replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
        if (lines.length <= 1) return;
        const headers = lines[0].split(',').map(h => h.trim());
        const idx = {}; headers.forEach((h, i) => idx[h] = i);
        for (let i = 1; i < lines.length; i++) {
            const cols = lines[i].split(',').map(c => c.replace(/^"|"$/g, '').trim());
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
            '取引番号', '日時', '商品ID', '種別', '商品名', 'オプション', '単価', '数量', '行合計', '合計', '受取額', 'お釣り'
        ].join(',') + '\n';
        fs.writeFileSync(MASTER_CSV, iconv.encode(header, 'shift_jis'));
    }
}

// strict: contentsMapByName / contentsMapById を使って「実際に登録された商品」のみを保存する

function normalizeName(s) { return (s || '').replace(/\s+/g, ' ').trim(); }

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
            if (l.startsWith('合計:')) total = l.replace(/合計:\s*￥?/, '').trim();
            if (l.startsWith('受取額:')) received = l.replace(/受取額:\s*￥?/, '').trim();
            if (l.startsWith('お釣り:')) change = l.replace(/お釣り:\s*￥?/, '').trim();
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

// POST /api/save-log の処理：登録商品を含むブロックのみCSVと日別ファイルに保存する
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
                            lineTotal: ((Number(it.price || 0) * Number(it.qty || 1)) || ''),
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
            const dateDirName = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; // yyyymmdd

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

            const total = rows[0] && rows[0].total ? rows[0].total : String(rows.reduce((s, r) => s + Number(r.lineTotal || 0), 0));
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

// CSVダウンロードハンドラ
const handleDownloadCsv = (req, res) => {
    if (!fs.existsSync(MASTER_CSV)) return res.status(404).send('No csv');
    res.download(MASTER_CSV, 'purchase_log.csv', err => {
        if (err) {
            console.error('download error', err);
            res.status(500).send('Download failed');
        }
    });
};

app.get('/api/download-csv', requireApiKey, handleDownloadCsv);
app.get('/api/download-log', requireApiKey, handleDownloadCsv);

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

// ローカルIP取得関数
function getLocalIpAddress() {
    const interfaces = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                candidates.push(net.address);
            }
        }
    }
    const preferred = candidates.find(ip => ip.startsWith('192.168.')) ||
        candidates.find(ip => ip.startsWith('10.')) ||
        candidates.find(ip => ip.startsWith('172.')) ||
        candidates[0] || 'localhost';
    return preferred;
}

// サーバー情報（QRコード・IP）API
app.get('/api/server-info', async (req, res) => {
    try {
        const ip = getLocalIpAddress();
        const clientUrl = `http://${ip}:${PORT}`;
        const portalUrl = `http://localhost:${PORT}/portal.html`;
        const qrDataUrl = await qrcode.toDataURL(clientUrl, {
            width: 280,
            margin: 2,
            color: { dark: '#0f172a', light: '#ffffff' }
        });
        res.json({
            status: 'running',
            port: PORT,
            localIp: ip,
            clientUrl,
            portalUrl,
            dataDir: DATA_DIR,
            logDir: LOG_DIR,
            qrDataUrl
        });
    } catch (err) {
        console.error('server-info error', err);
        res.status(500).json({ error: 'Failed to get server info' });
    }
});

// データフォルダをエクスプローラーで開く API
app.post('/api/open-data-folder', (req, res) => {
    try {
        const target = fs.existsSync(DATA_DIR) ? DATA_DIR : DATA_ROOT;
        exec(`explorer.exe "${target}"`, (err) => {
            if (err) console.error('Failed to open folder', err);
        });
        res.json({ ok: true });
    } catch (err) {
        console.error('open-data-folder error', err);
        res.status(500).json({ error: 'Failed to open folder' });
    }
});

// サーバーシャットダウン API
app.post('/api/shutdown', (req, res) => {
    res.json({ ok: true, message: 'Server is shutting down...' });
    setTimeout(() => {
        console.log('Shutdown requested from portal. Exiting...');
        process.exit(0);
    }, 500);
});

// ルートフォールバック
app.get('/', (req, res) => {
    const indexPath = path.join(STATIC_ROOT, 'index.html');
    if (fs.existsSync(indexPath)) return res.sendFile(indexPath);
    return res.send('Booth Cashier server running');
});

const server = app.listen(PORT, () => {
    const ip = getLocalIpAddress();
    console.log(`========================================`);
    console.log(`Booth Cashier Server Started!`);
    console.log(`- Portal (Main PC): http://localhost:${PORT}/portal.html`);
    console.log(`- Client (iPad/Phone): http://${ip}:${PORT}/`);
    console.log(`========================================`);

    if (process.env.AUTO_OPEN !== 'false') {
        const portalUrl = `http://localhost:${PORT}/portal.html`;
        exec(`start "" "${portalUrl}"`, (err) => {
            if (err) console.error('Failed to open browser:', err);
        });
    }
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n[WARNING] ポート ${PORT} は既に使用されています！`);
        console.error(`別の Booth Cashier（または他のアプリ）が既に起動している可能性があります。`);
        console.error(`既存のサーバー画面（ポータル）を開きます: http://localhost:${PORT}/portal.html\n`);

        exec(`start "" "http://localhost:${PORT}/portal.html"`);

        // コンソールが即座に閉じて消えてしまうのを防ぐため、キー入力を待機
        console.log('Enter キーを押すと終了します...');
        const readline = require('readline').createInterface({
            input: process.stdin,
            output: process.stdout
        });
        readline.question('', () => {
            readline.close();
            process.exit(1);
        });
    } else {
        console.error('Server error:', err);
        process.exit(1);
    }
});

function readServerCounter() {
    const today = getCurrentDate();
    try {
        if (!fs.existsSync(COUNTER_FILE)) return [today, 9001];
        const s = fs.readFileSync(COUNTER_FILE, 'utf8').trim();
        const lines = s.split(/\r?\n/).filter(Boolean);
        if (!lines.length) return [today, 9001];
        for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts[0] === today) {
                const n = Number(parts[1]);
                if (!isNaN(n) && n >= 9001 && n <= 9999) {
                    return [today, n];
                }
                return [today, 9001];
            }
        }
        return [today, 9001];
    } catch (e) {
        console.error('readServerCounter error', e);
        return [today, 9001];
    }
}

function writeServerCounter(counter) {
    try {
        const today = getCurrentDate();
        let lines = [];
        if (fs.existsSync(COUNTER_FILE)) {
            const s = fs.readFileSync(COUNTER_FILE, 'utf8').trim();
            lines = s.split(/\r?\n/).filter(Boolean);
        }
        let found = false;
        for (let i = 0; i < lines.length; i++) {
            const parts = lines[i].split(/\s+/);
            if (parts[0] === today) {
                const currentN = Number(parts[1]) || 9000;
                const newN = Math.max(currentN, counter);
                lines[i] = `${today} ${newN}`;
                found = true;
                break;
            }
        }
        if (!found) {
            lines.push(`${today} ${counter}`);
        }
        fs.writeFileSync(COUNTER_FILE, lines.join('\n') + '\n', 'utf8');
    } catch (e) {
        console.error('writeServerCounter error', e);
    }
}

// サーバー側で取引番号を取得（9001〜9999、インクリメントして永続化）
function getServerTxNo() {
    const [, currentNo] = readServerCounter();
    let next = currentNo + 1;
    if (next > 9999) next = 9001;
    writeServerCounter(next);
    return currentNo;
}

app.get('/api/get-TxNo', requireApiKey, (req, res) => {
    try {
        const txNo = getServerTxNo();
        return res.type('text/plain').send(String(txNo));
    } catch (err) {
        console.error('get-TxNo error', err);
        return res.status(500).send('Failed to get TxNo');
    }
});

app.post('/api/update-counter', requireApiKey, (req, res) => {
    try {
        const payload = req.body;
        const n = Number(payload.counter);
        if (isNaN(n)) {
            return res.status(400).json({ error: 'Invalid counter value' });
        } else {
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