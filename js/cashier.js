/**
 * 会計・現計ページロジック (cashier.js)
 */

function renderCashierList() {
    const items = Cart.getItems();
    const list = document.getElementById('selected-list');
    let total = 0;
    let html = '';

    items.forEach(it => {
        total += it.price;
        const optStr = it.option ? `（${it.option}）` : '';
        html += `<li>${it.name}${optStr}（￥${it.price}）</li>`;
    });

    list.innerHTML = html || '<li>商品が選択されていません</li>';
    document.getElementById('total-price').textContent = AppUtils.formatYen(total);
    return total;
}

function updateChange() {
    const total = Cart.getTotal();
    const received = Number(document.getElementById('received-amount').value || 0);
    const change = received - total;
    document.getElementById('change-amount').textContent = change >= 0 ? AppUtils.formatYen(change) : '￥0';
}

function setupNumpad() {
    const numpad = document.getElementById('numpad');
    const receivedInput = document.getElementById('received-amount');
    const buttons = [
        '7', '8', '9',
        '4', '5', '6',
        '1', '2', '3',
        '0', '00', 'C'
    ];
    numpad.innerHTML = '';
    buttons.forEach(val => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'numpad-btn' + (val === '0' ? ' wide' : '');
        btn.textContent = val;
        btn.onclick = () => {
            if (val === 'C') {
                receivedInput.value = '';
            } else {
                receivedInput.value += val;
            }
            updateChange();
        };
        numpad.appendChild(btn);
    });
}

// サーバーから最新の取引番号を取得
function getServerTxNo() {
    try {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', '/api/get-TxNo', false);
        xhr.send(null);
        if (xhr.status === 200) {
            const num = Number(xhr.responseText.trim());
            if (!isNaN(num) && num >= 9001 && num <= 9999) {
                return num;
            }
        }
    } catch (e) {
        console.warn('Could not fetch server TxNo, falling back to local.', e);
    }
    return 9001;
}

// ローカル取引番号の取得・インクリメント (9001〜9999)
function getNextTxNo() {
    const counterKey = 'purchase_counter';
    const localVal = Number(localStorage.getItem(counterKey));
    const serverVal = getServerTxNo();
    let current = Math.max(isNaN(localVal) ? 9000 : localVal, serverVal);

    if (current < 9001 || current > 9999) current = 9001;
    else current++;
    if (current > 9999) current = 9001;

    localStorage.setItem(counterKey, current);
    return current;
}

// 購入履歴を localStorage にテキスト形式で保存（サーバー送信用フォーマット）
function savePurchaseLog(items, total, received, change) {
    const now = new Date();
    const timestamp = now.toLocaleString('ja-JP');
    const txNo = getNextTxNo();

    let logEntry = `取引番号: ${txNo}\n`;
    logEntry += `日時: ${timestamp}\n`;

    const foods = items.filter(it => it.type === 'food');
    const drinks = items.filter(it => it.type === 'drink');
    const others = items.filter(it => it.type === 'others');

    if (foods.length > 0) {
        logEntry += 'フード:\n';
        foods.forEach(it => {
            logEntry += `  ${it.id ? it.id + ' ' : ''}${it.name}（￥${it.price}）\n`;
        });
    }
    if (drinks.length > 0) {
        logEntry += 'ドリンク:\n';
        drinks.forEach(it => {
            const optStr = it.option ? `（${it.option}）` : '';
            logEntry += `  ${it.id ? it.id + ' ' : ''}${it.name}${optStr}（￥${it.price}）\n`;
        });
    }
    if (others.length > 0) {
        logEntry += 'その他:\n';
        others.forEach(it => {
            logEntry += `  ${it.id ? it.id + ' ' : ''}${it.name}（￥${it.price}）\n`;
        });
    }

    logEntry += `合計: ￥${total}\n受取額: ￥${received}\nお釣り: ￥${change}\n---\n`;

    const existingLog = localStorage.getItem('purchase_log') || '';
    localStorage.setItem('purchase_log', existingLog + logEntry);

    renderSavedTransactions();
}

function calcResult() {
    const total = Cart.getTotal();
    const receivedInput = document.getElementById('received-amount');
    const received = Number(receivedInput.value || 0);
    const change = received - total;
    const result = document.getElementById('result-message');

    const items = Cart.getItems();

    if (total <= 0 || items.length === 0) {
        result.textContent = '商品が選択されていません。';
        document.getElementById('change-amount').textContent = '￥0';
        return;
    }
    if (received === 0) {
        result.textContent = '受取額を入力してください。';
        document.getElementById('change-amount').textContent = '￥0';
        return;
    }
    if (change < 0) {
        result.textContent = '受取額が不足しています。';
        document.getElementById('change-amount').textContent = '￥0';
        return;
    }

    result.textContent = `お預かり: ￥${received}　お釣り: ￥${change}`;
    document.getElementById('change-amount').textContent = AppUtils.formatYen(change);

    // 履歴保存
    savePurchaseLog(items, total, received, change);

    // カートとお預かり額のクリア
    Cart.clearAll();
    receivedInput.value = '';
    renderCashierList();
    updateChange();
}

async function uploadPurchaseLogToServer() {
    const log = localStorage.getItem('purchase_log') || '';
    if (!log.trim()) {
        alert('送信する未送信取引記録がありません。');
        return;
    }

    try {
        const res = await fetch('/api/save-log', {
            method: 'POST',
            headers: { 'Content-Type': 'text/plain' },
            body: log
        });

        if (!res.ok) throw new Error('サーバー保存エラー');

        // カウンタの同期更新
        const localMaxTxNo = localStorage.getItem('purchase_counter');
        if (localMaxTxNo) {
            await fetch('/api/update-counter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ counter: Number(localMaxTxNo) })
            }).catch(e => console.warn('counter update failed', e));
        }

        localStorage.removeItem('purchase_log');
        alert('購入履歴をサーバーに保存しました！');
        renderSavedTransactions();
    } catch (e) {
        console.error('uploadPurchaseLogToServer error:', e);
        alert('サーバーへの保存に失敗しました。接続を確認してください。');
    }
}

// 記録済み取引のレンダリング
function renderSavedTransactions() {
    const inner = document.querySelector('#saved-transactions .saved-list');
    if (!inner) return;

    const raw = (localStorage.getItem('purchase_log') || '').trim();
    if (!raw) {
        inner.innerHTML = '<div class="muted">記録された取引はありません。</div>';
        return;
    }

    const blocks = raw.split(/\r?\n---\r?\n/).map(b => b.trim()).filter(Boolean);
    const entries = blocks.map(block => {
        const lines = block.split(/\r?\n/).map(l => l.trim());
        const txLineRaw = (lines.find(l => l.startsWith('取引番号:')) || '').replace('取引番号:', '').trim();
        const txNum = /^\d+$/.test(txLineRaw) ? Number(txLineRaw) : Infinity;
        const dtLineRaw = (lines.find(l => l.startsWith('日時:')) || '').replace('日時:', '').trim();
        const parts = dtLineRaw.split(/\s+/).filter(Boolean);
        const datePart = parts[0] || '';
        const timePart = parts.slice(1).join(' ') || '';
        const totalLine = (lines.find(l => l.startsWith('合計:')) || '').replace(/合計:\s*￥?/, '').trim();

        return {
            txRaw: txLineRaw || '—',
            txNum,
            datePart,
            timePart,
            totalLine: totalLine || '0'
        };
    });

    // 取引番号昇順でソート
    entries.sort((a, b) => {
        if (a.txNum === b.txNum) {
            return (a.datePart || '').localeCompare(b.datePart || '');
        }
        return a.txNum - b.txNum;
    });

    const headerHtml = `
        <div class="tx-header">
            <div class="tx-col-no">取引番号</div>
            <div class="tx-col-date">日付</div>
            <div class="tx-col-time">時刻</div>
            <div class="tx-col-total">合計金額</div>
        </div>
    `;

    const rowsHtml = entries.map(e => `
        <div class="tx-entry">
            <div class="tx-col-no">${e.txRaw}</div>
            <div class="tx-col-date">${e.datePart || '—'}</div>
            <div class="tx-col-time">${e.timePart || '—'}</div>
            <div class="tx-col-total">${AppUtils.formatYen(e.totalLine)}</div>
        </div>
    `).join('');

    inner.innerHTML = headerHtml + rowsHtml;
}

document.addEventListener('DOMContentLoaded', () => {
    renderCashierList();
    setupNumpad();

    const receivedInput = document.getElementById('received-amount');
    if (receivedInput) {
        receivedInput.value = '';
        receivedInput.addEventListener('input', updateChange);
    }

    const calcBtn = document.getElementById('calc-btn');
    if (calcBtn) calcBtn.addEventListener('click', calcResult);

    const uploadBtn = document.getElementById('btn-upload-server');
    if (uploadBtn) uploadBtn.addEventListener('click', uploadPurchaseLogToServer);

    renderSavedTransactions();
});