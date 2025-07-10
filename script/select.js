// 商品を選択したときにlocalStorageへCSV形式で保存する関数
function saveSelectedItem(type, item) {
    // type: 'food' または 'drink'
    // item: { id, name, price, option? }
    const key = `selected_${type}`;
    let csv = localStorage.getItem(key) || '';
    // ヘッダーがなければ追加
    if (!csv) {
        if (type === 'food') {
            csv = 'ID,商品名,価格\n';
        } else if (type === 'drink') {
            csv = 'ID,商品名,オプション,価格\n';
        }
    }
    // 値をCSV形式で追加
    if (type === 'food') {
        csv += `${item.id},${item.name},${item.price}\n`;
    } else if (type === 'drink') {
        csv += `${item.id},${item.name},${item.option},${item.price}\n`;
    }
    localStorage.setItem(key, csv);
}

// 例：タイルクリック時に呼び出す
// saveSelectedItem('food', { id: '2000', name: 'サンドイッチ', price: 400 });
// saveSelectedItem('drink', { id: '1000', name: 'コーヒー', price: 300, option: 'なし' });