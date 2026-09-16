/**
 * 管理者・売上分析ページロジック (admin.js)
 */
(function () {
    const el = id => document.getElementById(id);

    function renderTable(rows) {
        const tbody = document.querySelector('#result-table tbody');
        tbody.innerHTML = rows.map(r => {
            const txNo = r['取引番号'] || r['txNo'] || '';
            const dt = r['日時'] || r['datetime'] || '';
            const type = r['種別'] || r['type'] || '';
            const name = r['商品名'] || r['name'] || '';
            const opt = r['オプション'] || r['option'] || '';
            const price = AppUtils.toNumber(r['単価'] || r['price'] || r['価格']);
            const total = AppUtils.toNumber(r['合計'] || r['total']);
            const received = AppUtils.toNumber(r['受取額'] || r['received']);
            const change = AppUtils.toNumber(r['お釣り'] || r['change']);

            return `<tr>
                <td>${txNo}</td>
                <td>${dt}</td>
                <td>${type}</td>
                <td>${name}</td>
                <td>${opt}</td>
                <td>${AppUtils.formatYen(price)}</td>
                <td>${AppUtils.formatYen(total)}</td>
                <td>${AppUtils.formatYen(received)}</td>
                <td>${AppUtils.formatYen(change)}</td>
            </tr>`;
        }).join('');
    }

    function updateSummary(rows) {
        const sumItems = rows.reduce((s, r) => s + AppUtils.toNumber(r['単価'] || r['price'] || r['価格']), 0);
        const txMap = new Map();
        rows.forEach(r => {
            const tx = (r['取引番号'] || r['txNo'] || '').toString();
            if (tx && !txMap.has(tx)) {
                txMap.set(tx, AppUtils.toNumber(r['合計'] || r['total']));
            }
        });

        el('sum-items').textContent = AppUtils.formatYen(sumItems);
        el('count-tx').textContent = txMap.size;
        el('count-items').textContent = rows.length;
    }

    function filterRows(allRows) {
        const from = el('from-date').value ? new Date(el('from-date').value) : null;
        const to = el('to-date').value ? new Date(el('to-date').value) : null;
        if (to) to.setHours(23, 59, 59, 999);

        const txFilter = (el('filter-tx').value || '').trim();

        return allRows.filter(r => {
            if (txFilter) {
                const tx = (r['取引番号'] || r['txNo'] || '').toString();
                if (!tx.includes(txFilter)) return false;
            }
            if ((from || to) && (r['日時'] || r['datetime'])) {
                const dt = Date.parse((r['日時'] || r['datetime']).replace(/\./g, '/')) || Date.parse(r['日時'] || r['datetime']);
                if (!isNaN(dt)) {
                    if (from && dt < from.getTime()) return false;
                    if (to && dt > to.getTime()) return false;
                }
            }
            return true;
        });
    }

    async function fetchDecodedText(url) {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error('取得失敗: ' + url);
        const ab = await resp.arrayBuffer();
        return AppUtils.decodeShiftJis(ab);
    }

    async function loadAndRenderCsv() {
        try {
            el('raw-log').textContent = 'CSV を取得中...';
            const text = await fetchDecodedText('/api/download-csv');
            el('raw-log').textContent = 'CSV取得済み（生表示）\n\n' + text.slice(0, 10000);
            const rows = AppUtils.parseCsv(text);
            const filtered = filterRows(rows);
            renderTable(filtered);
            updateSummary(filtered);
        } catch (err) {
            el('raw-log').textContent = 'CSV取得エラー: ' + (err.message || err);
            console.error(err);
        }
    }

    async function loadRawText() {
        try {
            el('raw-log').textContent = 'テキストログ取得中...';
            const text = await fetchDecodedText('/api/logs');
            el('raw-log').textContent = text || 'ログは空です';
        } catch (err) {
            el('raw-log').textContent = 'エラー: ' + (err.message || err);
        }
    }

    function setupEventListeners() {
        el('btn-download-csv').addEventListener('click', () => location.href = '/api/download-csv');
        el('btn-download-txt').addEventListener('click', () => location.href = '/api/download-log');
        el('btn-load').addEventListener('click', loadAndRenderCsv);
        el('btn-refresh').addEventListener('click', loadRawText);
        ['from-date', 'to-date', 'filter-tx'].forEach(id => {
            el(id).addEventListener('input', () => loadAndRenderCsv());
        });
    }

    document.addEventListener('DOMContentLoaded', async () => {
        setupEventListeners();
        await loadAndRenderCsv();
    });
})();