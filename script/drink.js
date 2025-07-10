fetch('data/drink.csv')
    .then(response => {
        if (!response.ok) throw new Error('ファイルが見つかりません');
        return response.text();
    })
    .then(text => {
        const lines = text.replace(/^\uFEFF/, '').trim().split('\n');
        const items = lines.slice(1)
            .map(line => line.split(',').map(s => s.trim()))
            .filter(arr => arr.length === 4 && arr[0] && arr[1] && arr[2] && arr[3]);
        const container = document.getElementById('drink-list');
        if (items.length === 0) {
            container.innerText = 'メニューがありません';
            return;
        }
        items.forEach(([id, name, option, price]) => {
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.innerHTML = `
                <div class="item-name">${name}</div>
                <div class="item-option">${option !== 'なし' ? option : ''}</div>
                <div class="item-price">￥${price}</div>
            `;
            tile.addEventListener('click', () => {
                saveSelectedItem('drink', { id, name, price, option });
                tile.classList.add('selected');
                if (window.renderSelectedList) window.renderSelectedList();
                setTimeout(() => tile.classList.remove('selected'), 300);
            });
            container.appendChild(tile);
        });
    })
    .catch(e => {
        document.getElementById('drink-list').innerText =
            'データの読み込みに失敗しました。ローカルで開いている場合はWebサーバー経由でアクセスしてください。';
        console.error(e);
    });