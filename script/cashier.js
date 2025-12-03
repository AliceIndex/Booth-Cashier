function renderCashierList() {
    const food = (localStorage.getItem('selected_food') || '').trim().split('\n').slice(1);
    const drink = (localStorage.getItem('selected_drink') || '').trim().split('\n').slice(1);
    const others = (localStorage.getItem('selected_others') || '').trim().split('\n').slice(1);
    const list = document.getElementById('selected-list');
    let total = 0;
    let html = '';
    food.filter(Boolean).forEach(line => {
        const [id, name, price] = line.split(',');
        total += Number(price);
        html += `<li>${name}（￥${price}）</li>`;
    });
    drink.filter(Boolean).forEach(line => {
        const [id, name, option, price] = line.split(',');
        total += Number(price);
        html += `<li>${name}${option && option !== 'なし' ? '（' + option + '）' : ''}（￥${price}）</li>`;
    });
    others.filter(Boolean).forEach(line => {
        // others 格納形式は "id,name,price" を想定
        const [id, name, price] = line.split(',');
        total += Number(price);
        html += `<li>${name}（￥${price}）</li>`;
    });
    list.innerHTML = html || '<li>商品が選択されていません</li>';
    document.getElementById('total-price').textContent = `￥${total}`;
    return total;
}

function updateChange() {
    const total = renderCashierList();
    const received = Number(document.getElementById('received-amount').value || 0);
    const change = received - total;
    document.getElementById('change-amount').textContent = change >= 0 ? `￥${change}` : '￥0';
}

function setupNumpad() {
    const numpad = document.getElementById('numpad');
    const receivedInput = document.getElementById('received-amount');
    const buttons = [
        '7','8','9',
        '4','5','6',
        '1','2','3',
        '0','00','C'
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

// ローカルで取引番号を取得・進める（9001〜9999）
function getLocalTxNo() {
    const counterKey = 'purchase_counter';
    let counter = Number(Math.max(localStorage.getItem(counterKey), getServerTxNo()));
    if (!Number.isFinite(counter) || counter < 9001 || counter > 9999) counter = 9001;
    const txNo = Number(counter);
    let next = counter + 1;
    if (next > 9999) next = 9001;
    localStorage.setItem(counterKey, next);
    return txNo;
}

// 購入履歴をローカルストレージに保存（取引番号を追加）
function savePurchaseLog(food, drink, others, total, received, change) {
    const now = new Date();
    const timestamp = now.toLocaleString('ja-JP');

    // 取引番号（ローカル発行、9001〜9999）
    const txNo = getLocalTxNo()+1;

    let log = localStorage.getItem('purchase_log') || '';
    let logEntry = `取引番号: ${txNo}\n`;
    logEntry += `日時: ${timestamp}\n`;
    if (food.length > 0) {
        logEntry += 'フード:\n';
        food.forEach(line => {
            const [id, name, price] = line.split(',');
            logEntry += `  ${id ? id + ' ' : ''}${name}（￥${price}）\n`;
        });
    }
    if (drink.length > 0) {
        logEntry += 'ドリンク:\n';
        drink.forEach(line => {
            const [id, name, option, price] = line.split(',');
            logEntry += `  ${id ? id + ' ' : ''}${name}${option && option !== 'なし' ? '（' + option + '）' : ''}（￥${price}）\n`;
        });
    }
    if (others.length > 0) {
        logEntry += 'その他:\n';
        others.forEach(line => {
            const [id, name, price] = line.split(',');
            logEntry += `  ${id ? id + ' ' : ''}${name}（￥${price}）\n`;
        });
    }

    logEntry += `合計: ￥${total}\n受取額: ￥${received}\nお釣り: ￥${change}\n---\n`;
    log += logEntry;
    localStorage.setItem('purchase_log', log);

    // 追加: 保存後に画面に反映
    if (typeof renderSavedTransactions === 'function') {
        renderSavedTransactions();
    }
}

// calcResult を構造化 JSON を送信する実装へ変更
function calcResult() {
    const total = renderCashierList();
    const receivedInput = document.getElementById('received-amount');
    const received = Number(receivedInput.value || 0);
    const change = received - total;
    const result = document.getElementById('result-message');

    const foodLines = (localStorage.getItem('selected_food') || '').trim().split('\n').slice(1).filter(Boolean);
    const drinkLines = (localStorage.getItem('selected_drink') || '').trim().split('\n').slice(1).filter(Boolean);
    const othersLines = (localStorage.getItem('selected_others') || '').trim().split('\n').slice(1).filter(Boolean);

    if (total <= 0) {  
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

    // 表示更新（現計ボタン押下でお釣りを必ず表示する）
    result.textContent = `お預かり: ￥${received}　お釣り: ￥${change}`;
    document.getElementById('change-amount').textContent = `￥${change}`;

    // ローカルに保存（サーバー送信は行わない）
    savePurchaseLog(foodLines, drinkLines, othersLines, total, received, change);

    // 選択商品クリア
    localStorage.removeItem('selected_food');
    localStorage.removeItem('selected_drink');
    localStorage.removeItem('selected_others');
    receivedInput.value = '';
    renderCashierList();
    updateChange();
}

function uploadPurchaseLogToServer() {
    const log = localStorage.getItem('purchase_log') || '';
    if (!log) {
        alert('購入履歴がありません。');
        return;
    }
    fetch('/api/save-log', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: log
    })
    .then(res => res.ok ? alert('ログをサーバーに保存しました') : alert('サーバー保存に失敗しました'))
    .catch(() => alert('サーバーへの通信に失敗しました'));

    // サーバー側カウンタをローカル最大値で更新
    const localMaxTxNo = localStorage.getItem('purchase_counter');
    if (!localMaxTxNo) {
        return;
    }
    fetch('/api/update-counter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counter: Number(localMaxTxNo) || 9000 })
    })
    
    localStorage.removeItem('purchase_log');
    renderSavedTransactions();
}

function getServerTxNo() {
    // サーバーから取引番号を取得する（同期的に扱うため、fetch の代わりに XMLHttpRequest を使用）
    const txnoApiUrl = '/api/get-TxNo';
    const xhr = new XMLHttpRequest();
    xhr.open('GET', txnoApiUrl, false);
    xhr.send(null);
    if (xhr.status === 200) {
        return xhr.responseText.trim();
    }
    return 9001;
}

document.addEventListener('DOMContentLoaded', () => {
    renderCashierList();
    setupNumpad();
    document.getElementById('received-amount').value = '';
    document.getElementById('received-amount').addEventListener('input', updateChange);
    const calcBtn = document.getElementById('calc-btn');
    if (calcBtn) calcBtn.addEventListener('click', calcResult);

    const panel = document.querySelector('.cashier-panel');
    if (panel) {
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '購入履歴をサーバーに保存';
        saveBtn.className = 'calc-btn';
        saveBtn.style.marginTop = '8px';
        saveBtn.onclick = uploadPurchaseLogToServer;
        panel.appendChild(saveBtn);
    }

    // 追加: 記録済み取引を初期表示
    renderSavedTransactions();
});

// 追加: 記録済み取引表示用の関数群
function ensureSavedContainer() {
    // 既に DOM に id="saved-transactions" があればそれを使用し、中身が無ければ初期化する
    let container = document.getElementById('saved-transactions');
    if (!container) {
        container = document.createElement('section');
        container.id = 'saved-transactions';
        container.innerHTML = '<h3>記録済み取引</h3><div class="saved-list muted">ロード中...</div>';
        // selected-list の直後に挿入する（存在しなければ body の末尾）
        const listEl = document.getElementById('selected-list');
        if (listEl && listEl.parentNode) listEl.parentNode.insertBefore(container, listEl.nextSibling);
        else document.body.appendChild(container);
    } else {
        // 既存コンテナがあるが saved-list 要素が無ければ作る
        if (!container.querySelector('.saved-list')) {
            container.innerHTML = '<h3>未送信取引記録</h3><div class="saved-list muted">ロード中...</div>';
        }
    }
    return container;
}

function renderSavedTransactions() {
    const container = ensureSavedContainer();
    const inner = container.querySelector('.saved-list');
    const raw = localStorage.getItem('purchase_log') || '';
    if (!raw.trim()) {
        inner.innerHTML = '<div class="muted">記録された取引はありません。</div>';
        return;
    }

    // ブロック分割（最新順ではなく、取引番号でソートするのでそのまま取得）
    const blocks = raw.split(/\r?\n---\r?\n/).map(b => b.trim()).filter(Boolean);

    // ブロックをパースして配列化（txNo を数値で保持し、未取得は Infinity とする）
    const entries = blocks.map(block => {
        const lines = block.split(/\r?\n/).map(l => l.trim());
        const txLineRaw = (lines.find(l => l.startsWith('取引番号:')) || '').replace('取引番号:','').trim();
        const txNum = (txLineRaw && /^\d+$/.test(txLineRaw)) ? Number(txLineRaw) : Infinity;
        const dtLineRaw = (lines.find(l => l.startsWith('日時:')) || '').replace('日時:','').trim();
        const parts = dtLineRaw.split(/\s+/).filter(Boolean);
        const datePart = parts.length > 0 ? parts[0] : '';
        const timePart = parts.length > 1 ? parts.slice(1).join(' ') : '';
        const totalLine = (lines.find(l => l.startsWith('合計:')) || '').replace(/合計:\s*￥?/, '').trim();
        return {
            txRaw: txLineRaw || '—',
            txNum,
            datePart,
            timePart,
            totalLine: totalLine || '0'
        };
    });

    // 取引番号（数値）が小さい順にソート
    entries.sort((a, b) => {
        if (a.txNum === b.txNum) {
            // 同じ txNo の場合は日付で比較（存在すれば）
            if (a.datePart && b.datePart) return a.datePart.localeCompare(b.datePart);
            return 0;
        }
        if (a.txNum === Infinity) return 1;
        if (b.txNum === Infinity) return -1;
        return a.txNum - b.txNum;
    });

    const rowsHtml = entries.map(e => {
        return `<div class="tx-entry" style="display:flex;gap:12px;align-items:center;padding:0.6rem;border:1px solid #eee;border-radius:6px;background:#fff;margin-bottom:0.6rem">
            <div style="min-width:80px;font-weight:700">${e.txRaw}</div>
            <div style="min-width:120px">${e.datePart || '—'}</div>
            <div style="min-width:90px">${e.timePart || '—'}</div>
            <div style="margin-left:auto;font-weight:700">￥${e.totalLine ? Number(e.totalLine.replace(/[^\d-]/g,'')).toLocaleString() : '0'}</div>
        </div>`;
    }).join('');

    // ヘッダ表示（列名）
    const header = `<div style="display:flex;gap:12px;align-items:center;padding:0.4rem 0.6rem;margin-bottom:0.4rem;font-weight:700;color:#333">
        <div style="min-width:80px">取引番号</div>
        <div style="min-width:120px">日付</div>
        <div style="min-width:90px">時刻</div>
        <div style="margin-left:auto">合計金額</div>
    </div>`;

    inner.innerHTML = header + rowsHtml;
}