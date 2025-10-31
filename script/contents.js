(function () {
    let items = [];

    // CSVパース（簡易）
    function parseCSV(text) {
        const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        if (!lines.length) return [];
        const headers = lines[0].split(',').map(h => h.trim());
        const rows = lines.slice(1).map(line => {
            const cols = line.split(',').map(c => c.trim());
            const obj = {};
            headers.forEach((h, i) => obj[h] = cols[i] !== undefined ? cols[i] : '');
            return obj;
        });
        return rows;
    }

    async function loadContents() {
        try {
            const res = await fetch('/data/contents.csv', { cache: 'no-store' });
            if (!res.ok) throw new Error('contents.csv を取得できませんでした');

            // バイナリとして取得してから Shift_JIS でデコード
            const arrayBuffer = await res.arrayBuffer();

            // ブラウザによりサポートされるエンコーディング名が異なるため複数候補を試す
            const encodingCandidates = ['shift_jis', 'windows-31j', 'Shift_JIS', 'cp932'];
            let text = null;
            for (const enc of encodingCandidates) {
                try {
                    const decoder = new TextDecoder(enc);
                    text = decoder.decode(arrayBuffer);
                    // 簡易チェック: デコード結果に日本語らしい文字が含まれているか
                    if (/[ぁ-んァ-ン一-龥]/.test(text)) break;
                } catch (e) {
                    // サポート外なら次を試す
                    text = null;
                }
            }
            // 最終フォールバック（UTF-8として解釈）
            if (text === null) {
                try {
                    text = new TextDecoder('utf-8').decode(arrayBuffer);
                } catch (e) {
                    throw new Error('文字デコードに失敗しました');
                }
            }

            const rows = parseCSV(text);
            // マッピングして内部 items 配列を作成
            items = rows.map(r => ({
                id: r.id || '',
                type: (r.type || 'food').toLowerCase(),
                name: r['商品名'] || r['name'] || '',
                option: r['オプション'] || r['option'] || 'なし',
                price: r['価格'] ? Number(r['価格']) : (r['price'] ? Number(r['price']) : 0)
            }));
            renderItems();
        } catch (err) {
            console.error(err);
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
                <div class="item-price">￥${item.price || ''}${item.option && item.option !== 'なし' ? ' ・' + item.option : ''}</div>
            `;
            tile.addEventListener('click', () => onItemClick(item));
            container.appendChild(tile);
        });
    }

    function onItemClick(item) {
        // CSVに個別オプション列があるのでその値をそのまま使う
        addSelected(item);
    }

    function addSelected(item) {
        const type = item.type === 'drink' ? 'drink' : 'food';
        const key = type === 'food' ? 'selected_food' : 'selected_drink';
        const header = type === 'food' ? 'id,name,price' : 'id,name,option,price';
        let store = (localStorage.getItem(key) || '').trim();
        let lines = store ? store.split('\n') : [];
        if (!lines.length) lines = [header];
        const line = type === 'food'
            ? `${item.id},${item.name},${item.price || 0}`
            : `${item.id},${item.name},${item.option || 'なし'},${item.price || 0}`;
        lines.push(line);
        localStorage.setItem(key, lines.join('\n') + '\n');
        if (typeof window.renderSelectedList === 'function') window.renderSelectedList();
    }

    // 既存の cancelSelected を上書きしないようにエクスポート（無ければ実装）
    window.cancelSelected = window.cancelSelected || function (type, idx) {
        const key = `selected_${type}`;
        let lines = (localStorage.getItem(key) || '').trim().split('\n');
        if (lines.length <= 1) return;
        lines.splice(idx + 1, 1); // ヘッダー分オフセット
        localStorage.setItem(key, lines.join('\n') + (lines.length > 1 ? '\n' : ''));
        if (typeof window.renderSelectedList === 'function') window.renderSelectedList();
    };

    document.addEventListener('DOMContentLoaded', () => {
        loadContents();
    });
})();