function renderCashierList() {
    const food = (localStorage.getItem('selected_food') || '').trim().split('\n').slice(1);
    const drink = (localStorage.getItem('selected_drink') || '').trim().split('\n').slice(1);
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

// 購入履歴をローカルストレージに保存
function savePurchaseLog(food, drink, total, received, change) {
    const now = new Date();
    const timestamp = now.toLocaleString('ja-JP');
    let log = localStorage.getItem('purchase_log') || '';
    let logEntry = `日時: ${timestamp}\n`;
    if (food.length > 0) {
        logEntry += 'フード:\n';
        food.forEach(line => {
            const [id, name, price] = line.split(',');
            logEntry += `  ${name}（￥${price}）\n`;
        });
    }
    if (drink.length > 0) {
        logEntry += 'ドリンク:\n';
        drink.forEach(line => {
            const [id, name, option, price] = line.split(',');
            logEntry += `  ${name}${option && option !== 'なし' ? '（' + option + '）' : ''}（￥${price}）\n`;
        });
    }
    logEntry += `合計: ￥${total}\n受取額: ￥${received}\nお釣り: ￥${change}\n---\n`;
    log += logEntry;
    localStorage.setItem('purchase_log', log);
}

function calcResult() {
    const total = renderCashierList();
    const receivedInput = document.getElementById('received-amount');
    const received = Number(receivedInput.value || 0);
    const change = received - total;
    const result = document.getElementById('result-message');
    const food = (localStorage.getItem('selected_food') || '').trim().split('\n').slice(1).filter(Boolean);
    const drink = (localStorage.getItem('selected_drink') || '').trim().split('\n').slice(1).filter(Boolean);
    if (received === 0) {
        result.textContent = '受取額を入力してください。';
    } else if (change < 0) {
        result.textContent = '受取額が不足しています。';
    } else {
        result.textContent = `お預かり: ￥${received}　お釣り: ￥${change}`;
        // ログ保存
        savePurchaseLog(food, drink, total, received, change);
        // 受取額が合計金額以上ならリストを消去し、入力金額もクリア
        localStorage.removeItem('selected_food');
        localStorage.removeItem('selected_drink');
        receivedInput.value = '';
        renderCashierList();
        updateChange();
    }
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
}

// 例：ダウンロードボタンの下に「サーバーに保存」ボタンを追加
document.addEventListener('DOMContentLoaded', () => {
    renderCashierList();
    setupNumpad();
    document.getElementById('received-amount').value = '';
    document.getElementById('received-amount').addEventListener('input', updateChange);
    document.getElementById('calc-btn').addEventListener('click', calcResult);

    const panel = document.querySelector('.cashier-panel');
    if (panel) {
        const saveBtn = document.createElement('button');
        saveBtn.textContent = '購入履歴をサーバーに保存';
        saveBtn.className = 'calc-btn';
        saveBtn.style.marginTop = '8px';
        saveBtn.onclick = uploadPurchaseLogToServer;
        panel.appendChild(saveBtn);
    }
});