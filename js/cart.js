/**
 * Booth Cashier カート（選択中の商品）管理モジュール (cart.js)
 * 既存の localStorage フォーマット (selected_food, selected_drink, selected_others) と完全互換
 */
(function (global) {
    const KEYS = {
        food: 'selected_food',
        drink: 'selected_drink',
        others: 'selected_others'
    };

    const HEADERS = {
        food: 'id,name,price',
        drink: 'id,name,option,price',
        others: 'id,name,price'
    };

    const Cart = {
        /**
         * 指定種別（または全種別）の選択商品一覧を取得
         * @param {'food'|'drink'|'others'|null} targetType 
         * @returns {Array<{type: string, id: string, name: string, option: string, price: number, index: number}>}
         */
        getItems(targetType = null) {
            const types = targetType ? [targetType] : ['food', 'drink', 'others'];
            const allItems = [];

            types.forEach(type => {
                const key = KEYS[type];
                const raw = (localStorage.getItem(key) || '').trim();
                if (!raw) return;

                const lines = raw.split('\n').slice(1); // ヘッダーをスキップ
                lines.forEach((line, idx) => {
                    const trimmed = line.trim();
                    if (!trimmed) return;
                    const cols = trimmed.split(',').map(c => c.trim());
                    if (type === 'drink') {
                        allItems.push({
                            type: 'drink',
                            id: cols[0] || '',
                            name: cols[1] || '',
                            option: cols[2] && cols[2] !== 'なし' ? cols[2] : '',
                            price: Number(cols[3] || 0),
                            index: idx
                        });
                    } else {
                        allItems.push({
                            type: type,
                            id: cols[0] || '',
                            name: cols[1] || '',
                            option: '',
                            price: Number(cols[2] || 0),
                            index: idx
                        });
                    }
                });
            });

            return allItems;
        },

        /**
         * 商品をカートに追加
         * @param {{id: string, type: string, name: string, option?: string, price: number}} item 
         */
        addItem(item) {
            const type = (item.type || 'food').toLowerCase() === 'drink' ? 'drink' : 'food';
            const key = KEYS[type];
            const header = HEADERS[type];

            let store = (localStorage.getItem(key) || '').trim();
            let lines = store ? store.split('\n') : [];
            if (lines.length === 0) lines = [header];

            const id = item.id || '';
            const name = item.name || '';
            const price = Number(item.price || 0);
            const opt = item.option || 'なし';

            const line = type === 'drink'
                ? `${id},${name},${opt},${price}`
                : `${id},${name},${price}`;

            lines.push(line);
            localStorage.setItem(key, lines.join('\n') + '\n');
        },

        /**
         * 指定された種別のインデックスの商品をカートから削除
         * @param {'food'|'drink'|'others'} type 
         * @param {number} idx 0-based
         */
        removeItem(type, idx) {
            const key = KEYS[type];
            if (!key) return;
            const store = (localStorage.getItem(key) || '').trim();
            if (!store) return;

            let lines = store.split('\n');
            if (lines.length <= 1) return; // ヘッダーのみ

            lines.splice(idx + 1, 1); // ヘッダーを考慮して +1
            localStorage.setItem(key, lines.join('\n') + (lines.length > 1 ? '\n' : ''));
        },

        /**
         * 全てのカート商品をクリア
         */
        clearAll() {
            Object.values(KEYS).forEach(k => localStorage.removeItem(k));
        },

        /**
         * カートの合計金額を計算
         * @returns {number}
         */
        getTotal() {
            const items = this.getItems();
            return items.reduce((sum, it) => sum + it.price, 0);
        }
    };

    global.Cart = Cart;
})(typeof window !== 'undefined' ? window : this);
