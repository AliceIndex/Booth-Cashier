/**
 * Booth Cashier クライアント共通ユーティリティ (common.js)
 */
(function (global) {
    const AppUtils = {
        /**
         * Shift_JIS (CP932) の ArrayBuffer を文字列にデコード
         * @param {ArrayBuffer} arrayBuffer 
         * @returns {string}
         */
        decodeShiftJis(arrayBuffer) {
            const candidates = ['shift_jis', 'windows-31j', 'cp932', 'Shift_JIS', 'utf-8'];
            for (const enc of candidates) {
                try {
                    const decoder = new TextDecoder(enc);
                    const text = decoder.decode(arrayBuffer);
                    if (/[ぁ-んァ-ヶ一-龠]/.test(text) || enc === 'utf-8') {
                        return text;
                    }
                } catch (e) {
                    // 次の候補へ
                }
            }
            return new TextDecoder('utf-8').decode(arrayBuffer);
        },

        /**
         * CSV テキストをパースしてオブジェクトの配列を返す（引用符対応）
         * @param {string} text 
         * @returns {Array<Object>}
         */
        parseCsv(text) {
            const lines = (text || '').replace(/\r/g, '').split('\n').filter(Boolean);
            if (lines.length === 0) return [];

            const splitRow = (rowText) => {
                const cols = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < rowText.length; i++) {
                    const char = rowText[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        cols.push(current.trim());
                        current = '';
                    } else {
                        current += char;
                    }
                }
                cols.push(current.trim());
                return cols.map(c => c.replace(/^"|"$/g, '').trim());
            };

            const headers = splitRow(lines[0]);
            const rows = [];
            for (let i = 1; i < lines.length; i++) {
                const cols = splitRow(lines[i]);
                if (cols.length === 0 || (cols.length === 1 && cols[0] === '')) continue;
                const obj = {};
                headers.forEach((h, idx) => {
                    obj[h] = cols[idx] !== undefined ? cols[idx] : '';
                });
                rows.push(obj);
            }
            return rows;
        },

        /**
         * 数値を日本円形式に変換 (例: 1000 -> "￥1,000")
         * @param {number|string} val 
         * @returns {string}
         */
        formatYen(val) {
            const n = Number(String(val).replace(/[^\d.-]/g, ''));
            return '￥' + (Number.isFinite(n) ? n.toLocaleString() : '0');
        },

        /**
         * 数値への安全な変換
         * @param {any} val 
         * @returns {number}
         */
        toNumber(val) {
            const n = Number(String(val || '').replace(/[^\d.-]/g, ''));
            return Number.isFinite(n) ? n : 0;
        }
    };

    global.AppUtils = AppUtils;
})(typeof window !== 'undefined' ? window : this);

