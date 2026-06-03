/* ============================================================
   DIESEL EXECUTIVE INTELLIGENCE PLATFORM — script.js
   Strictly data-driven. Every displayed value comes from:
     data/executive_kpi.csv
     data/monthly_summary.csv
     data/no_asset_kpi.csv
     data/asset_summary.csv
     data/project_info.csv
   No sample data. No hardcoded values. Missing data -> "Data not loaded".
   ============================================================ */

const FMT  = new Intl.NumberFormat('en-US');
const fmt  = n => FMT.format(Math.round(n));
const fmtK = n => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : fmt(n);
const DASH = '—';
const NO_DATA = 'Data not loaded';

const C = {
  cyan:'#38BDF8', green:'#22C55E', amber:'#F59E0B', red:'#EF4444', violet:'#8B92F6',
  ink3:'#94A3B8', ink4:'#64748B', grid:'rgba(148,163,184,0.08)', stroke:'rgba(148,163,184,0.18)'
};

/* ---------- helpers ---------- */
const has   = arr => Array.isArray(arr) && arr.length > 0;          // dataset present & non-empty
const blank = v   => v === undefined || v === null || String(v).trim() === '';
const toNum = v   => blank(v) ? NaN : parseFloat(String(v).replace(/,/g,'').trim());
function setText(id, txt){ const el = document.getElementById(id); if(el) el.textContent = txt; }

/* number-or-dash, with optional unit suffix */
function numOrDash(v, suffix=''){ const n = toNum(v); return isNaN(n) ? DASH : fmt(n) + suffix; }

/* ---------- CSV parser (handles quoted fields) ---------- */
function parseCSV(text){
  const rows=[]; let row=[], field='', q=false;
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(q){
      if(c==='"'){ if(text[i+1]==='"'){field+='"';i++;} else q=false; }
      else field+=c;
    } else {
      if(c==='"') q=true;
      else if(c===','){ row.push(field); field=''; }
      else if(c==='\n'){ row.push(field); rows.push(row); row=[]; field=''; }
      else if(c==='\r'){ /* skip */ }
      else field+=c;
    }
  }
  if(field.length||row.length){ row.push(field); rows.push(row); }
  if(!rows.length) return [];
  const header=rows.shift().map(h=>h.trim());
  return rows
    .filter(r => r.some(x => String(x).trim() !== ''))   // drop fully-empty rows
    .map(r => { const o={}; header.forEach((h,i)=>o[h]=(r[i]??'').trim()); return o; });
}

async function loadCSV(path){
  const res = await fetch(path, {cache:'no-store'});
  if(!res.ok) throw new Error('HTTP '+res.status+' for '+path);
  return parseCSV(await res.text());
}

/* key/value map for the keyed CSVs (executive_kpi / project_info) */
function kv(rows, keyField, valField){
  const o={}; (rows||[]).forEach(r=>{ if(!blank(r[keyField])) o[r[keyField]] = r[valField]; });
  return o;
}

/* ---------- "Data not loaded" renderers ---------- */
function noDataBlock(){ return `<div class="no-data-card">${NO_DATA}</div>`; }
function noDataChart(canvasId){
  const cv = document.getElementById(canvasId); if(!cv) return;
  const wrap = cv.closest('.chart-wrap'); if(wrap) wrap.innerHTML = `<div class="no-data">${NO_DATA}</div>`;
}
function noDataTable(id){
  const tbody = document.querySelector('#'+id+' tbody'); if(!tbody) return;
  const cols = document.querySelectorAll('#'+id+' thead th').length || 6;
  tbody.innerHTML = `<tr><td colspan="${cols}" class="td-nodata">${NO_DATA}</td></tr>`;
}
function noDataPanel(id){ const el=document.getElementById(id); if(el) el.innerHTML = noDataBlock(); }

/* ---------- Chart.js theming ---------- */
function setChartDefaults(){
  if(!window.Chart) return;
  const Ch = window.Chart;
  Ch.defaults.color = C.ink3;
  Ch.defaults.font.family = "'IBM Plex Sans', sans-serif";
  Ch.defaults.font.size = 11.5;
  Ch.defaults.plugins.legend.display = false;
  Ch.defaults.plugins.tooltip.backgroundColor = 'rgba(11,17,32,0.94)';
  Ch.defaults.plugins.tooltip.borderColor = C.stroke;
  Ch.defaults.plugins.tooltip.borderWidth = 1;
  Ch.defaults.plugins.tooltip.padding = 11;
  Ch.defaults.plugins.tooltip.cornerRadius = 9;
  Ch.defaults.plugins.tooltip.titleColor = '#F1F5F9';
  Ch.defaults.plugins.tooltip.bodyColor = '#CBD5E1';
  Ch.defaults.plugins.tooltip.titleFont = {family:"'IBM Plex Mono', monospace", size:11};
  Ch.defaults.plugins.tooltip.bodyFont = {family:"'IBM Plex Mono', monospace", size:12, weight:'600'};
}

function gradient(ctx, area, hex, a0, a1){
  if(!area) return hex;
  const g = ctx.createLinearGradient(0, area.top, 0, area.bottom);
  const h = hex.replace('#','');
  const r=parseInt(h.substr(0,2),16), gg=parseInt(h.substr(2,2),16), b=parseInt(h.substr(4,2),16);
  g.addColorStop(0,`rgba(${r},${gg},${b},${a0})`);
  g.addColorStop(1,`rgba(${r},${gg},${b},${a1})`);
  return g;
}
const baseScale = (extra={}) => ({
  grid:{color:C.grid, drawBorder:false}, border:{display:false},
  ticks:{color:C.ink4, padding:8, ...extra}
});

/* ============================================================
   KPI definitions — labels/icons are UI chrome; ALL values come
   from executive_kpi.csv keyed by `metric`.
   ============================================================ */
const KPI_META = {
  total_diesel_received: {label:'Total Diesel Received', ico:'▼', accent:C.cyan,   glow:'rgba(56,189,248,0.18)'},
  total_diesel_issued:   {label:'Total Diesel Issued',   ico:'▲', accent:C.green,  glow:'rgba(34,197,94,0.16)'},
  current_balance:       {label:'Current Balance',       ico:'≡', accent:C.cyan,   glow:'rgba(56,189,248,0.18)'},
  average_daily_issued:  {label:'Average Daily Issued',  ico:'⌁', accent:C.violet, glow:'rgba(139,146,246,0.16)'},
  total_transactions:    {label:'Total Transactions',    ico:'#', accent:C.cyan,   glow:'rgba(56,189,248,0.18)'},
  active_assets:         {label:'Active Assets',         ico:'▦', accent:C.green,  glow:'rgba(34,197,94,0.16)'},
  no_asset_quantity:     {label:'No Asset Quantity',     ico:'⚠', accent:C.amber,  glow:'rgba(245,158,11,0.16)'},
  no_asset_transactions: {label:'No Asset Transactions', ico:'⚠', accent:C.amber,  glow:'rgba(245,158,11,0.16)'},
  no_asset_pct:          {label:'No Asset %',            ico:'%', accent:C.red,    glow:'rgba(239,68,68,0.16)'},
};

function kpiCard(metric, value, unit, delta, idx){
  const m = KPI_META[metric] || {label:metric, ico:'•', accent:C.cyan, glow:'rgba(56,189,248,0.18)'};
  const n = toNum(value);
  let display, unitTxt='';
  if(isNaN(n)){
    display = DASH;
  } else {
    display = (metric==='no_asset_pct') ? n.toFixed(1) : fmt(n);
    const u = (unit||'').trim();
    unitTxt = (u && u!=='units') ? `<span class="unit">${u}</span>` : '';
  }
  const d = toNum(delta);
  let footHtml;
  if(isNaN(d)){
    footHtml = `<span class="delta flat">${DASH}</span><span>vs prior period</span>`;
  } else {
    const dCls = d>0.05 ? 'up' : d<-0.05 ? 'down' : 'flat';
    const dArrow = dCls==='up' ? '▲' : dCls==='down' ? '▼' : '—';
    footHtml = `<span class="delta ${dCls}">${dArrow} ${Math.abs(d).toFixed(1)}%</span><span>vs prior period</span>`;
  }
  return `
    <div class="kpi" style="--accent:${m.accent};--accent-glow:${m.glow};animation-delay:${idx*60}ms">
      <div class="kpi-label"><span class="kpi-ico">${m.ico}</span>${m.label}</div>
      <div class="kpi-value">${display}${unitTxt}</div>
      <div class="kpi-foot">${footHtml}</div>
    </div>`;
}

function riskBand(pct){
  if(pct < 6) return {cls:'risk-low', label:'Low Risk'};
  if(pct < 9) return {cls:'risk-mod', label:'Moderate'};
  return {cls:'risk-high', label:'High Risk'};
}

/* ============================================================
   LOAD
   ============================================================ */
let DATA = {};
const charts = {};
const SOURCES = {
  kpi:'data/executive_kpi.csv',
  monthly:'data/monthly_summary.csv',
  noAsset:'data/no_asset_kpi.csv',
  assets:'data/asset_summary.csv',
  project:'data/project_info.csv',
};

async function init(){
  setChartDefaults();
  const keys = Object.keys(SOURCES);
  const results = await Promise.allSettled(keys.map(k=>loadCSV(SOURCES[k])));
  DATA = {};
  keys.forEach((k,i)=>{ DATA[k] = results[i].status==='fulfilled' ? results[i].value : null; });
  try { renderAll(); }
  catch(e){ console.error('Render error:', e); }
  finally { setTimeout(()=>document.getElementById('loadVeil').classList.add('hidden'), 350); }
}

function renderAll(){
  const {kpi, monthly, noAsset, assets, project} = DATA;

  /* ---------- header / sidebar meta (project_info only) ---------- */
  const proj = has(project) ? kv(project, 'field', 'value') : {};
  setText('periodPill',     blank(proj.report_period) ? NO_DATA : proj.report_period);
  setText('sidebarRefresh', blank(proj.last_refresh)  ? NO_DATA : 'Synced ' + proj.last_refresh);
  setText('footRefresh',    blank(proj.last_refresh)  ? NO_DATA : 'Last refresh: ' + proj.last_refresh);

  const owner = (proj.report_owner||'').trim();
  const avatar = document.getElementById('avatar');
  if(avatar){
    avatar.textContent = owner ? owner.split(/\s+/).slice(0,2).map(w=>w[0]).join('').toUpperCase() : DASH;
    avatar.title = owner || NO_DATA;
  }

  /* ---------- KPI grids (executive_kpi only) ---------- */
  const kpiGrid = document.getElementById('kpiGrid');
  if(has(kpi)) kpiGrid.innerHTML = kpi.map((k,i)=>kpiCard(k.metric,k.value,k.unit,k.delta_pct,i)).join('');
  else         kpiGrid.innerHTML = noDataBlock();

  const subset = names => has(kpi) ? kpi.filter(k=>names.includes(k.metric)) : null;
  renderKpiSubset('consKpis',  subset(['total_diesel_received','total_diesel_issued','current_balance','average_daily_issued']));
  renderKpiSubset('assetKpis', subset(['active_assets','total_diesel_issued','average_daily_issued','total_transactions']));
  renderKpiSubset('excKpis',   subset(['no_asset_quantity','no_asset_transactions','no_asset_pct','active_assets']));

  /* ---------- monthly series ---------- */
  if(has(monthly)){
    const labels   = monthly.map(r=>r.month);
    const received = monthly.map(r=>toNum(r.received_litres));
    const issued   = monthly.map(r=>toNum(r.issued_litres));
    const balance  = monthly.map(r=>toNum(r.balance_litres));
    buildTrend('trendChart', labels, received, issued);
    buildTrend('consTrendChart', labels, received, issued);
    buildBalance('balanceChart', labels, balance);
    buildNet('netChart', labels, received, issued);
  } else {
    ['trendChart','consTrendChart','balanceChart','netChart'].forEach(noDataChart);
  }

  /* ---------- no-asset series ---------- */
  let avgPct = NaN;
  if(has(noAsset)){
    const labels = noAsset.map(r=>r.month);
    const naQty  = noAsset.map(r=>toNum(r.no_asset_qty));
    const naPct  = noAsset.map(r=>toNum(r.no_asset_pct));
    const naTxn  = noAsset.map(r=>toNum(r.no_asset_transactions));
    buildNoAsset('noAssetChart', labels, naQty);
    buildExcTrend('excTrendChart', labels, naQty);
    buildExcCombo('excComboChart', labels, naPct, naTxn);
    const valid = naPct.filter(v=>!isNaN(v));
    if(valid.length){ avgPct = valid.reduce((a,b)=>a+b,0)/valid.length; }
  } else {
    ['noAssetChart','excTrendChart','excComboChart'].forEach(noDataChart);
  }
  const rt = document.getElementById('riskTag');
  if(rt){
    if(isNaN(avgPct)){ rt.textContent = DASH; rt.className = 'risk-tag'; }
    else { const rb = riskBand(avgPct); rt.textContent = rb.label; rt.className = 'risk-tag '+rb.cls; }
  }

  /* ---------- assets (asset_summary only) ---------- */
  if(has(assets)){
    buildTopConsumers('topConsumersChart', assets.slice(0,10));
    buildCategory('categoryChart', assets);
    buildScatter('scatterChart', assets);
    renderLeader('leaderTable', assets.slice(0,10));
    renderLeader('leaderTableFull', assets);
  } else {
    ['topConsumersChart','categoryChart','scatterChart'].forEach(noDataChart);
    noDataTable('leaderTable'); noDataTable('leaderTableFull');
  }

  /* ---------- alerts (need kpi + monthly + noAsset + assets) ---------- */
  renderAlerts();

  /* ---------- project info ---------- */
  renderProject(proj);
}

function renderKpiSubset(id, list){
  const el = document.getElementById(id); if(!el) return;
  if(!list){ el.innerHTML = noDataBlock(); return; }
  el.innerHTML = list.map((k,i)=>kpiCard(k.metric,k.value,k.unit,k.delta_pct,i)).join('');
}

/* ============================================================
   CHARTS  (only invoked when their dataset is present)
   ============================================================ */
function destroy(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }
function ctxOf(id){ const cv=document.getElementById(id); return cv ? cv.getContext('2d') : null; }

function commonOpts({yTick}={}){
  return {
    responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index', intersect:false},
    animation:{duration:900, easing:'easeOutQuart'},
    plugins:{tooltip:{callbacks:{label:c=>'  '+(c.dataset.label||'')+': '+fmt(c.parsed.y)}}},
    scales:{ x:baseScale(), y:baseScale({callback:yTick||(v=>fmt(v))}) }
  };
}

function buildTrend(id, labels, received, issued){
  const ctx = ctxOf(id); if(!ctx) return; destroy(id);
  charts[id] = new Chart(ctx,{
    type:'line',
    data:{labels, datasets:[
      {label:'Received', data:received, borderColor:C.cyan, borderWidth:2.5, tension:.4,
       pointRadius:0, pointHoverRadius:5, pointHoverBackgroundColor:C.cyan,
       fill:true, backgroundColor:c=>gradient(c.chart.ctx,c.chart.chartArea,C.cyan,0.22,0)},
      {label:'Issued', data:issued, borderColor:C.green, borderWidth:2.5, tension:.4,
       pointRadius:0, pointHoverRadius:5, pointHoverBackgroundColor:C.green,
       fill:true, backgroundColor:c=>gradient(c.chart.ctx,c.chart.chartArea,C.green,0.18,0)},
    ]},
    options:commonOpts({yTick:v=>fmtK(v)})
  });
}

function buildBalance(id, labels, balance){
  const ctx = ctxOf(id); if(!ctx) return; destroy(id);
  charts[id] = new Chart(ctx,{
    type:'line',
    data:{labels, datasets:[{
      label:'Balance', data:balance, borderColor:C.cyan, borderWidth:2.5, tension:.4,
      pointRadius:0, pointHoverRadius:5, pointHoverBackgroundColor:C.cyan,
      fill:true, backgroundColor:c=>gradient(c.chart.ctx,c.chart.chartArea,C.cyan,0.34,0)
    }]},
    options:commonOpts({yTick:v=>fmtK(v)})
  });
}

function buildNoAsset(id, labels, naQty){
  const ctx = ctxOf(id); if(!ctx) return; destroy(id);
  const max = Math.max(...naQty.filter(v=>!isNaN(v)), 0);
  const colors = naQty.map(v=>{ const r = max ? v/max : 0; return r>0.8?C.red : r>0.55?C.amber : C.green; });
  charts[id] = new Chart(ctx,{
    type:'bar',
    data:{labels, datasets:[{
      label:'No Asset Litres', data:naQty,
      backgroundColor:colors.map(c=>c+'cc'), borderColor:colors, borderWidth:1,
      borderRadius:6, borderSkipped:false, maxBarThickness:30
    }]},
    options:commonOpts({yTick:v=>fmtK(v)})
  });
}

function buildTopConsumers(id, rows){
  const ctx = ctxOf(id); if(!ctx) return; destroy(id);
  const labels = rows.map(r=>r.asset_code);
  const data   = rows.map(r=>toNum(r.consumed_litres));
  charts[id] = new Chart(ctx,{
    type:'bar',
    data:{labels, datasets:[{ label:'Consumed', data, borderRadius:6, borderSkipped:false, maxBarThickness:22 }]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      animation:{duration:900, easing:'easeOutQuart'},
      plugins:{tooltip:{callbacks:{label:c=>'  '+fmt(c.parsed.x)+' L'}}},
      scales:{
        x:baseScale({callback:v=>fmtK(v)}),
        y:{grid:{display:false}, border:{display:false}, ticks:{color:C.ink3, font:{family:"'IBM Plex Mono', monospace", size:11}}}
      }
    }
  });
  charts[id].data.datasets[0].backgroundColor = c=>{
    const a=c.chart.chartArea; if(!a) return C.cyan;
    const g=c.chart.ctx.createLinearGradient(a.left,0,a.right,0);
    g.addColorStop(0,'rgba(56,189,248,0.35)'); g.addColorStop(1,'rgba(34,197,94,0.9)');
    return g;
  };
  charts[id].update();
}

function buildNet(id, labels, received, issued){
  const ctx = ctxOf(id); if(!ctx) return; destroy(id);
  const net = received.map((r,i)=>r-issued[i]);
  charts[id] = new Chart(ctx,{
    type:'bar',
    data:{labels, datasets:[{
      label:'Net', data:net,
      backgroundColor:net.map(v=>v>=0?'rgba(34,197,94,0.8)':'rgba(239,68,68,0.8)'),
      borderColor:net.map(v=>v>=0?C.green:C.red), borderWidth:1,
      borderRadius:5, borderSkipped:false, maxBarThickness:34
    }]},
    options:commonOpts({yTick:v=>fmtK(v)})
  });
}

function buildCategory(id, assets){
  const ctx = ctxOf(id); if(!ctx) return; destroy(id);
  const map={};
  assets.forEach(a=>{ const v=toNum(a.consumed_litres); if(!isNaN(v)) map[a.category]=(map[a.category]||0)+v; });
  const labels=Object.keys(map), data=Object.values(map);
  if(!labels.length){ noDataChart(id); return; }
  const palette=[C.cyan,C.green,C.amber,C.violet,'#5EEAD4','#F472B6','#A3E635','#FB923C'];
  charts[id]=new Chart(ctx,{
    type:'doughnut',
    data:{labels, datasets:[{data, backgroundColor:palette.map(c=>c+'d9'),
      borderColor:'rgba(11,17,32,0.6)', borderWidth:2, hoverOffset:8}]},
    options:{
      responsive:true, maintainAspectRatio:false, cutout:'62%',
      animation:{animateRotate:true, duration:900},
      plugins:{
        legend:{display:true, position:'bottom', labels:{color:C.ink3, padding:12, boxWidth:9, boxHeight:9, font:{size:11}}},
        tooltip:{callbacks:{label:c=>'  '+c.label+': '+fmt(c.parsed)+' L'}}
      }
    }
  });
}

function buildScatter(id, assets){
  const ctx = ctxOf(id); if(!ctx) return; destroy(id);
  const pts = assets.map(a=>({x:toNum(a.utilisation_pct), y:toNum(a.consumed_litres), code:a.asset_code}))
                    .filter(p=>!isNaN(p.x)&&!isNaN(p.y));
  if(!pts.length){ noDataChart(id); return; }
  charts[id]=new Chart(ctx,{
    type:'scatter',
    data:{datasets:[{ data:pts, backgroundColor:'rgba(56,189,248,0.7)', borderColor:C.cyan,
      borderWidth:1, pointRadius:6, pointHoverRadius:9 }]},
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{tooltip:{callbacks:{label:c=>`  ${c.raw.code}: ${fmt(c.raw.y)} L @ ${c.raw.x}%`}}},
      scales:{
        x:{...baseScale({callback:v=>v+'%'}), title:{display:true,text:'Utilisation',color:C.ink4,font:{size:10}}},
        y:{...baseScale({callback:v=>fmtK(v)}), title:{display:true,text:'Consumed (L)',color:C.ink4,font:{size:10}}}
      }
    }
  });
}

function buildExcTrend(id, labels, naQty){
  const ctx = ctxOf(id); if(!ctx) return; destroy(id);
  const valid = naQty.filter(v=>!isNaN(v));
  const threshold = valid.length ? valid.reduce((a,b)=>a+b,0)/valid.length : 0;
  charts[id]=new Chart(ctx,{
    type:'line',
    data:{labels, datasets:[
      {label:'No Asset Litres', data:naQty, borderColor:C.amber, borderWidth:2.5, tension:.4,
       pointRadius:3, pointBackgroundColor:naQty.map(v=>v>threshold?C.red:C.amber),
       fill:true, backgroundColor:c=>gradient(c.chart.ctx,c.chart.chartArea,C.amber,0.22,0)},
      {label:'Average', data:labels.map(()=>threshold), borderColor:C.red,
       borderWidth:1.5, borderDash:[6,5], pointRadius:0, fill:false}
    ]},
    options:commonOpts({yTick:v=>fmtK(v)})
  });
}

function buildExcCombo(id, labels, naPct, naTxn){
  const ctx = ctxOf(id); if(!ctx) return; destroy(id);
  charts[id]=new Chart(ctx,{
    data:{labels, datasets:[
      {type:'bar', label:'No Asset Txns', data:naTxn, backgroundColor:'rgba(139,146,246,0.55)',
       borderColor:C.violet, borderWidth:1, borderRadius:5, maxBarThickness:30, yAxisID:'y'},
      {type:'line', label:'No Asset %', data:naPct, borderColor:C.red, borderWidth:2.5, tension:.4,
       pointRadius:3, pointBackgroundColor:C.red, yAxisID:'y1',
       fill:true, backgroundColor:c=>gradient(c.chart.ctx,c.chart.chartArea,C.red,0.12,0)}
    ]},
    options:{
      responsive:true, maintainAspectRatio:false,
      interaction:{mode:'index', intersect:false},
      plugins:{legend:{display:true, labels:{color:C.ink3, boxWidth:9, padding:14, font:{size:11}}}},
      scales:{
        x:baseScale(),
        y:{...baseScale(), position:'left', title:{display:true,text:'Transactions',color:C.ink4,font:{size:10}}},
        y1:{...baseScale({callback:v=>v+'%'}), position:'right', grid:{drawOnChartArea:false}, title:{display:true,text:'%',color:C.ink4,font:{size:10}}}
      }
    }
  });
}

/* ============================================================
   TABLES  (asset_summary)
   ============================================================ */
function renderLeader(id, rows){
  const tbody = document.querySelector('#'+id+' tbody'); if(!tbody) return;
  if(!has(rows)){ noDataTable(id); return; }
  tbody.innerHTML = rows.map((r,i)=>{
    const rank = i+1;
    const rankCls = rank<=3 ? 'rank-'+rank : '';
    const util = toNum(r.utilisation_pct);
    const utilCell = isNaN(util)
      ? `<span class="util-val">${DASH}</span>`
      : `<div class="util-bar"><div class="util-track"><div class="util-fill" style="width:${util}%"></div></div><span class="util-val">${util}%</span></div>`;
    return `<tr>
      <td class="rank ${rankCls}">${String(rank).padStart(2,'0')}</td>
      <td><span class="asset-name">${r.asset_name||DASH}</span><span class="asset-code">${r.asset_code||''}</span></td>
      <td>${r.category ? `<span class="cat-chip">${r.category}</span>` : DASH}</td>
      <td class="num">${numOrDash(r.consumed_litres)}</td>
      <td class="num">${numOrDash(r.transactions)}</td>
      <td>${utilCell}</td>
    </tr>`;
  }).join('');
}

/* ============================================================
   ALERTS  — computed strictly from loaded CSV values
   ============================================================ */
function renderAlerts(){
  const mainEl = document.getElementById('alertsPanel');
  const excEl  = document.getElementById('excAlerts');
  const {kpi, monthly, noAsset, assets} = DATA;

  if(!(has(kpi) && has(monthly) && has(noAsset) && has(assets))){
    if(mainEl) mainEl.innerHTML = noDataBlock();
    if(excEl)  excEl.innerHTML  = noDataBlock();
    return;
  }

  const kmap = kv(kpi, 'metric', 'value');
  const getK = m => toNum(kmap[m]);

  const naPctVals = noAsset.map(r=>toNum(r.no_asset_pct)).filter(v=>!isNaN(v));
  const avgPct = naPctVals.length ? naPctVals.reduce((a,b)=>a+b,0)/naPctVals.length : NaN;
  const naTxnTotal = noAsset.map(r=>toNum(r.no_asset_transactions)).filter(v=>!isNaN(v)).reduce((a,b)=>a+b,0);

  const balance = getK('current_balance');
  const issued  = getK('total_diesel_issued');
  const daysCover = (!isNaN(balance) && !isNaN(issued) && issued>0) ? Math.round(balance/(issued/365)) : NaN;

  const issSeries = monthly.map(r=>toNum(r.issued_litres)).filter(v=>!isNaN(v));
  let cv = NaN;
  if(issSeries.length){
    const mean = issSeries.reduce((a,b)=>a+b,0)/issSeries.length;
    const sd = Math.sqrt(issSeries.reduce((a,b)=>a+(b-mean)**2,0)/issSeries.length);
    cv = mean ? sd/mean : NaN;
  }
  const top = assets[0];
  const topVal = top ? toNum(top.consumed_litres) : NaN;

  const alerts = [];

  if(!isNaN(avgPct)){
    if(avgPct >= 9) alerts.push({lvl:'red', ico:'⚠', t:'High No-Asset Usage',
      p:`Average no-asset consumption at ${avgPct.toFixed(1)}% of issued volume — above the 9% governance threshold.`});
    else if(avgPct >= 6) alerts.push({lvl:'amber', ico:'⚠', t:'Elevated No-Asset Usage',
      p:`No-asset consumption averaging ${avgPct.toFixed(1)}%. Within tolerance but trending toward review threshold.`});
    else alerts.push({lvl:'green', ico:'✓', t:'No-Asset Usage Controlled',
      p:`Unreferenced consumption at ${avgPct.toFixed(1)}% — inside governance limits.`});
  }

  if(!isNaN(naTxnTotal)){
    if(naTxnTotal > 250) alerts.push({lvl:'amber', ico:'◷', t:'Missing Asset References',
      p:`${fmt(naTxnTotal)} transactions logged without an asset reference. Reconciliation recommended.`});
    else alerts.push({lvl:'cyan', ico:'◷', t:'Reference Integrity Stable',
      p:`${fmt(naTxnTotal)} unreferenced transactions — within expected operational range.`});
  }

  if(!isNaN(daysCover)){
    if(daysCover >= 25) alerts.push({lvl:'green', ico:'✓', t:'Diesel Balance Healthy',
      p:`Current stock of ${fmt(balance)} L provides ~${daysCover} days of cover at present issue rates.`});
    else if(daysCover >= 12) alerts.push({lvl:'amber', ico:'≡', t:'Balance Within Range',
      p:`Stock cover at ~${daysCover} days. Monitor replenishment scheduling.`});
    else alerts.push({lvl:'red', ico:'≡', t:'Low Balance Warning',
      p:`Stock cover at ~${daysCover} days — below safety floor. Expedite resupply.`});
  }

  if(!isNaN(cv)){
    if(cv < 0.15) alerts.push({lvl:'green', ico:'✓', t:'Consumption Stable',
      p:`Monthly issue volatility at ${(cv*100).toFixed(1)}% — demand profile is steady.`});
    else alerts.push({lvl:'amber', ico:'⌁', t:'Consumption Variability',
      p:`Monthly issue volatility at ${(cv*100).toFixed(1)}% — investigate demand spikes for forecasting.`});
  }

  if(top && !isNaN(topVal)) alerts.push({lvl:'cyan', ico:'▦', t:'Lead Consumer',
    p:`${top.asset_name||top.asset_code} is the top consumer at ${fmt(topVal)} L.`});

  const html = alerts.length ? alerts.map(a=>`
    <div class="alert ${a.lvl}">
      <div class="alert-ico">${a.ico}</div>
      <div class="alert-body">
        <h4>${a.t}</h4>
        <p>${a.p}</p>
        <div class="alert-time">SIGNAL • DERIVED FROM CSV</div>
      </div>
    </div>`).join('') : noDataBlock();

  if(mainEl) mainEl.innerHTML = html;
  if(excEl)  excEl.innerHTML  = html;
}

/* ============================================================
   PROJECT INFO  (project_info + executive_kpi for summary)
   ============================================================ */
function renderProject(proj){
  const grid  = document.getElementById('projectInfo');
  const stack = document.getElementById('projectSummary');
  const projLoaded = has(DATA.project);

  if(grid){
    if(!projLoaded){ grid.innerHTML = noDataBlock(); }
    else{
      const cells = [
        ['Project Name',  proj.project_name],
        ['Client',        proj.client],
        ['Report Period', proj.report_period],
        ['Site Location', proj.site_location],
        ['Last Refresh',  proj.last_refresh],
        ['Report Owner',  proj.report_owner],
      ];
      grid.innerHTML = cells.map(([k,v])=>`
        <div class="info-cell"><div class="k">${k}</div><div class="v">${blank(v)?DASH:v}</div></div>`).join('');
    }
  }

  if(stack){
    if(!has(DATA.kpi)){ stack.innerHTML = noDataBlock(); }
    else{
      const kmap = kv(DATA.kpi, 'metric', 'value');
      const summary = [
        ['Total Transactions', numOrDash(kmap.total_transactions), 'cyan'],
        ['Total Received',     numOrDash(kmap.total_diesel_received,' L'), 'cyan'],
        ['Total Issued',       numOrDash(kmap.total_diesel_issued,' L'), 'green'],
        ['Active Assets',      numOrDash(kmap.active_assets), 'green'],
      ];
      stack.innerHTML = summary.map(([l,n,c])=>`
        <div class="summary-item"><span class="lbl">${l}</span><span class="num ${c}">${n}</span></div>`).join('');
    }
  }
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function setupNav(){
  const items = document.querySelectorAll('.nav-item');
  const views = document.querySelectorAll('.view');
  items.forEach(btn=>{
    btn.addEventListener('click', ()=>{
      const target = btn.dataset.target;
      items.forEach(b=>b.classList.toggle('active', b===btn));
      views.forEach(v=>{ v.hidden = v.dataset.view!==target; });
      document.documentElement.dataset.section = target;
      requestAnimationFrame(()=>Object.values(charts).forEach(c=>c.resize()));
      document.getElementById('sidebar').classList.remove('open');
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });
  const burger = document.getElementById('hamburger');
  if(burger) burger.addEventListener('click', ()=>document.getElementById('sidebar').classList.toggle('open'));
}

document.addEventListener('DOMContentLoaded', ()=>{ setupNav(); init(); });
