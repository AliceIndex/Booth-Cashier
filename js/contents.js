/**
 * 商品一覧表示 & カート連携 (contents.js)
 */
(function () {
    let items = [];

    async function loadContents() {
        try {
            const res = await fetch('/data/contents.csv', { cache: 'no-store' });
            if (!res.ok) throw new Error('contents.csv を取得できませんでした');

            const arrayBuffer = await res.arrayBuffer();
            const text = AppUtils.decodeShiftJis(arrayBuffer);
            const rows = AppUtils.parseCsv(text);

            items = rows.map(r => ({
                id: r.id || r['商品ID'] || '',
                type: (r.type || 'food').toLowerCase(),
                name: r['商品名'] || r['name'] || '',
                option: r['オプション'] || r['option'] || 'なし',
                price: AppUtils.toNumber(r['価格'] || r['price'] || 0)
            }));

            renderItems();
        } catch (err) {
            console.error('loadContents error:', err);
        }
    }

    function renderItems(targetId = 'item-list') {
        const container = document.getElementById(targetId);
        if (!container) return;
        container.innerHTML = '';

        items.forEach(item => {
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.innerHTML = `
                <div class="item-name">${item.name}</div>
                <div class="item-price">${AppUtils.formatYen(item.price)}${item.option && item.option !== 'なし' ? ' ・' + item.option : ''}</div>
            `;
            tile.addEventListener('click', () => {
                Cart.addItem(item);
                if (typeof window.renderSelectedList === 'function') {
                    window.renderSelectedList();
                }
            });
            container.appendChild(tile);
        });
    }

    // 選択キャンセル用グローバル関数
    window.cancelSelected = function (type, idx) {
        Cart.removeItem(type, idx);
        if (typeof window.renderSelectedList === 'function') {
            window.renderSelectedList();
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadContents();
    });
})();