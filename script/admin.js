(function(){
  const el = id => document.getElementById(id);
  function parseCsvText(text){
    const lines = text.replace(/\r/g,'').split('\n').filter(Boolean);
    if(lines.length===0) return [];
    const header = lines[0].split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(h=>h.replace(/^"|"$/g,'').trim());
    return lines.slice(1).map(line=>{
      const cols = line.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c=>c.replace(/^"|"$/g,''));
      const obj = {};
      header.forEach((h,i)=> obj[h]= cols[i] !== undefined ? cols[i] : '');
      return obj;
    });
  }
  function toNumber(s){ const n = Number((s||'').toString().replace(/[^\d.-]/g,'')); return Number.isFinite(n)?n:0; }

  function renderTable(rows){
    const tbody = document.querySelector('#result-table tbody');
    tbody.innerHTML = rows.map(r=>{
      return `<tr>
        <td>${r['取引番号']||r['txNo']||''}</td>
        <td>${r['日時']||r['datetime']||''}</td>
        <td>${r['種別']||r['type']||''}</td>
        <td>${r['商品名']||r['name']||''}</td>
        <td>${r['オプション']||r['option']||''}</td>
        <td>￥${toNumber(r['単価']||r['price']||r['価格']).toLocaleString()}</td>
        <td>￥${toNumber(r['合計']||r['total']).toLocaleString()}</td>
        <td>￥${toNumber(r['受取額']||r['received']).toLocaleString()}</td>
        <td>￥${toNumber(r['お釣り']||r['change']).toLocaleString()}</td>
      </tr>`;
    }).join('');
  }

  function updateSummary(rows){
    const sumItems = rows.reduce((s,r)=>s+toNumber(r['単価']||r['price']||r['価格']),0);
    const txMap = new Map();
    rows.forEach(r=>{
      const tx = (r['取引番号']||r['txNo']||'').toString();
      if(!txMap.has(tx)) txMap.set(tx, toNumber(r['合計']||r['total']||r['行合計']||r['lineTotal']));
    });
    const sumTrans = Array.from(txMap.values()).reduce((s,v)=>s+v,0);
    el('sum-items').textContent = '￥' + sumItems.toLocaleString();
    el('count-tx').textContent = txMap.size;
    el('count-items').textContent = rows.length;
  }

  function filterRows(allRows){
    const from = el('from-date').value ? new Date(el('from-date').value) : null;
    const to = el('to-date').value ? new Date(el('to-date').value) : null;
    if(to) { to.setHours(23,59,59,999); }
    const txFilter = (el('filter-tx').value||'').trim();
    return allRows.filter(r=>{
      if(txFilter){
        const tx = (r['取引番号']||r['txNo']||'').toString();
        if(!tx.includes(txFilter)) return false;
      }
      if((from||to) && (r['日時']||r['datetime'])){
        const dt = Date.parse((r['日時']||r['datetime']).replace(/\./g,'/')) || Date.parse(r['日時']||r['datetime']);
        if(isNaN(dt)) return true;
        if(from && dt < from.getTime()) return false;
        if(to && dt > to.getTime()) return false;
      }
      return true;
    });
  }

  async function fetchArrayBuffer(url){
    const resp = await fetch(url, {cache:'no-store'});
    if(!resp.ok) throw new Error('取得失敗: ' + url);
    return await resp.arrayBuffer();
  }

  async function decodeBuffer(ab){
    const encCandidates = ['shift_jis','windows-31j','cp932','utf-8'];
    for(const enc of encCandidates){
      try{
        const dec = new TextDecoder(enc);
        const text = dec.decode(ab);
        if(/[ぁ-んァ-ヶ一-龠]/.test(text) || enc==='utf-8') return text;
      }catch(e){}
    }
    return new TextDecoder('utf-8').decode(ab);
  }

  async function loadAndRenderCsv(){
    try{
      el('raw-log').textContent = 'CSV を取得中...';
      const ab = await fetchArrayBuffer('/api/download-csv');
      const text = await decodeBuffer(ab);
      el('raw-log').textContent = 'CSV取得済み（生表示）\n\n' + text.slice(0, 10000);
      const rows = parseCsvText(text);
      const filtered = filterRows(rows);
      renderTable(filtered);
      updateSummary(filtered);
    }catch(err){
      el('raw-log').textContent = 'CSV取得エラー: ' + (err.message||err);
      console.error(err);
    }
  }

  async function loadRawText(){
    try{
      el('raw-log').textContent = 'テキストログ取得中...';
      const ab = await fetchArrayBuffer('/api/logs');
      const text = await decodeBuffer(ab);
      el('raw-log').textContent = text || 'デコードに失敗しました';
    }catch(err){
      el('raw-log').textContent = 'エラー: ' + (err.message||err);
    }
  }

  function setupEventListeners(){
    el('btn-download-csv').addEventListener('click', ()=> location.href = '/api/download-csv');
    el('btn-download-txt').addEventListener('click', ()=> location.href = '/api/download-log');
    el('btn-load').addEventListener('click', loadAndRenderCsv);
    el('btn-refresh').addEventListener('click', loadRawText);
    ['from-date','to-date','filter-tx'].forEach(id => el(id).addEventListener('input', () => loadAndRenderCsv()));
  }

  document.addEventListener('DOMContentLoaded', async () => {
    setupEventListeners();
    await loadAndRenderCsv();
  });

})();