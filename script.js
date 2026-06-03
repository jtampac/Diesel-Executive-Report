/* ============================================================
   DIESEL EXECUTIVE INTELLIGENCE PLATFORM — script.js
   Vanilla JS + Chart.js. All data loads from /data/*.csv
   ============================================================ */

const FMT = new Intl.NumberFormat('en-US');
const fmt   = n => FMT.format(Math.round(n));
const fmtK  = n => n >= 1e6 ? (n/1e6).toFixed(2)+'M' : n >= 1e3 ? (n/1e3).toFixed(1)+'K' : fmt(n);

const C = {
  cyan:'#38BDF8', green:'#22C55E', amber:'#F59E0B', red:'#EF4444', violet:'#8B92F6',
  ink3:'#94A3B8', ink4:'#64748B', grid:'rgba(148,163,184,0.08)', stroke:'rgba(148,163,184,0.18)'
};

/* ---------- tiny CSV parser (handles quoted fields) ---------- */
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
  const header=rows.shift().map(h=>h.trim());
  return rows.filter(r=>r.length&&r.some(x=>x!=='')).map(r=>{
    const o={}; header.forEach((h,i)=>o[h]=(r[i]??'').trim()); return o;
  });
}

async function loadCSV(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error('Failed to load '+path);
  return parseCSV(await res.text());
}

/* ---------- Chart.js global theming ---------- */
function setChartDefaults(){
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
  grid:{color:C.grid, drawBorder:false},
  border:{display:false},
  ticks:{color:C.ink4, padding:8, ...extra}
});

/* ============================================================
   KPI CARD DEFINITIONS
   ============================================================ */
const KPI_META = {
  total_diesel_received: {label:'Total Diesel Received', ico:'▼', accent:C.cyan,  glow:'rgba(56,189,248,0.18)'},
  total_diesel_issued:   {label:'Total Diesel Issued',   ico:'▲', accent:C.green, glow:'rgba(34,197,94,0.16)'},
  current_balance:       {label:'Current Balance',       ico:'≡', accent:C.cyan,  glow:'rgba(56,189,248,0.18)'},
  average_daily_issued:  {label:'Avg Daily Issued',      ico:'⌁', accent:C.violet,glow:'rgba(139,146,246,0.16)'},
  active_assets:         {label:'Active Assets',         ico:'▦', accent:C.green, glow:'rgba(34,197,94,0.16)'},
  no_asset_quantity:     {label:'No-Asset Quantity',     ico:'⚠', accent:C.amber, glow:'rgba(245,158,11,0.16)'},
  no_asset_transactions: {label:'No-Asset Transactions', ico:'⚠', accent:C.amber, glow:'rgba(245,158,11,0.16)'},
  no_asset_pct:          {label:'No-Asset %',            ico:'%', accent:C.red,   glow:'rgba(239,68,68,0.16)'},
};

function kpiCard(metric, value, unit, delta, idx){
  const m = KPI_META[metric] || {label:metric, ico:'•', accent:C.cyan, glow:'rgba(56,189,248,0.18)'};
  const num = parseFloat(value);
  let display;
  if(metric==='no_asset_pct') display = num.toFixed(1);
  else if(metric==='active_assets') display = fmt(num);
  else display = fmt(num);
  const unitTxt = unit && unit!=='units' ? `<span class="unit">${unit}</span>` : '';
  const d = parseFloat(delta);
  const dCls = isNaN(d) ? 'flat' : d>0.05 ? 'up' : d<-0.05 ? 'down' : 'flat';
  const dArrow = dCls==='up'?'▲':dCls==='down'?'▼':'—';
  const dTxt = isNaN(d) ? '—' : `${dArrow} ${Math.abs(d).toFixed(1)}%`;
  return `
    <div class="kpi" style="--accent:${m.accent};--accent-glow:${m.glow};animation-delay:${idx*60}ms">
      <div class="kpi-label"><span class="kpi-ico">${m.ico}</span>${m.label}</div>
      <div class="kpi-value">${display}${unitTxt}</div>
      <div class="kpi-foot">
        <span class="delta ${dCls}">${dTxt}</span>
        <span>vs prior period</span>
      </div>
    </div>`;
}

/* ============================================================
   RISK CLASSIFICATION for No-Asset %
   ============================================================ */
function riskBand(pct){
  if(pct < 6) return {cls:'risk-low', label:'Low Risk', color:C.green};
  if(pct < 9) return {cls:'risk-mod', label:'Moderate', color:C.amber};
  return {cls:'risk-high', label:'High Risk', color:C.red};
}

/* ============================================================
   MAIN
   ============================================================ */
let DATA = {};
const charts = {};

async function init(){
  setChartDefaults();
  try{
    const [kpi, monthly, noAsset, assets, project] = await Promise.all([
      loadCSV('data/executive_kpi.csv'),
      loadCSV('data/monthly_summary.csv'),
      loadCSV('data/no_asset_kpi.csv'),
      loadCSV('data/asset_summary.csv'),
      loadCSV('data/project_info.csv'),
    ]);
    DATA = {kpi, monthly, noAsset, assets, project};
    renderAll();
  }catch(err){
    console.error(err);
    document.getElementById('loadVeil').innerHTML =
      `<div style="max-width:420px;text-align:center;color:#94A3B8;line-height:1.6">
        <div style="font-size:30px;margin-bottom:14px">⚠</div>
        <strong style="color:#F1F5F9">Data feed unavailable</strong><br>
        Could not load <code style="color:#38BDF8">/data/*.csv</code>.
        Serve this folder over HTTP (e.g. <code style="color:#38BDF8">python3 -m http.server</code>)
        so the CSV files can be fetched.
      </div>`;
    return;
  }
  setTimeout(()=>document.getElementById('loadVeil').classList.add('hidden'), 400);
}

function kv(rows){ const o={}; rows.forEach(r=>o[r.field]=r.value); return o; }

function renderAll(){
  const {kpi, monthly, noAsset, assets, project} = DATA;
  const proj = kv(project);

  /* ---- header meta ---- */
  document.getElementById('periodPill').textContent = proj.report_period || '—';
  document.getElementById('sidebarRefresh').textContent = 'Synced ' + (proj.last_refresh || '—');
  document.getElementById('footRefresh').textContent = 'Last refresh: ' + (proj.last_refresh || '—');

  /* ---- KPIs ---- */
  const kpiGrid = document.getElementById('kpiGrid');
  kpiGrid.innerHTML = kpi.map((k,i)=>kpiCard(k.metric,k.value,k.unit,k.delta_pct,i)).join('');

  // sub-section KPI subsets
  const pick = names => kpi.filter(k=>names.includes(k.metric));
  renderKpiSubset('consKpis', pick(['total_diesel_received','total_diesel_issued','current_balance','average_daily_issued']));
  renderKpiSubset('assetKpis', pick(['active_assets','total_diesel_issued','average_daily_issued','current_balance']));
  renderKpiSubset('excKpis', pick(['no_asset_quantity','no_asset_transactions','no_asset_pct','active_assets']));

  /* ---- parse series ---- */
  const months = monthly.map(r=>r.month);
  const received = monthly.map(r=>+r.received_litres);
  const issued = monthly.map(r=>+r.issued_litres);
  const balance = monthly.map(r=>+r.balance_litres);
  const naQty = noAsset.map(r=>+r.no_asset_qty);
  const naPct = noAsset.map(r=>+r.no_asset_pct);
  const naTxn = noAsset.map(r=>+r.no_asset_transactions);

  buildTrend('trendChart', months, received, issued);
  buildTrend('consTrendChart', months, received, issued);
  buildBalance('balanceChart', months, balance);
  buildNoAsset('noAssetChart', months, naQty);
  buildTopConsumers('topConsumersChart', assets.slice(0,10));
  buildNet('netChart', months, received, issued);
  buildCategory('categoryChart', assets);
  buildScatter('scatterChart', assets);
  buildExcTrend('excTrendChart', months, naQty);
  buildExcCombo('excComboChart', months, naPct, naTxn);

  /* ---- leaderboards ---- */
  renderLeader('leaderTable', assets.slice(0,10));
  renderLeader('leaderTableFull', assets);

  /* ---- risk tag ---- */
  const avgPct = naPct.reduce((a,b)=>a+b,0)/naPct.length;
  const rb = riskBand(avgPct);
  const rt = document.getElementById('riskTag');
  rt.textContent = rb.label; rt.className = 'risk-tag '+rb.cls;

  /* ---- alerts ---- */
  renderAlerts(kpi, monthly, noAsset, assets);

  /* ---- project ---- */
  renderProject(proj);
}

function renderKpiSubset(id, list){
  const el = document.getElementById(id); if(!el) return;
  el.innerHTML = list.map((k,i)=>kpiCard(k.metric,k.value,k.unit,k.delta_pct,i)).join('');
}

/* ============================================================
   CHARTS
   ============================================================ */
function destroy(id){ if(charts[id]){ charts[id].destroy(); delete charts[id]; } }

function buildTrend(id, labels, received, issued){
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx,{
    type:'line',
    data:{labels, datasets:[
      {label:'Received', data:received, borderColor:C.cyan, borderWidth:2.5, tension:.4,
       pointRadius:0, pointHoverRadius:5, pointHoverBackgroundColor:C.cyan,
       fill:true, backgroundColor:(c)=>gradient(c.chart.ctx,c.chart.chartArea,C.cyan,0.22,0)},
      {label:'Issued', data:issued, borderColor:C.green, borderWidth:2.5, tension:.4,
       pointRadius:0, pointHoverRadius:5, pointHoverBackgroundColor:C.green,
       fill:true, backgroundColor:(c)=>gradient(c.chart.ctx,c.chart.chartArea,C.green,0.18,0)},
    ]},
    options:commonOpts({yTick:v=>fmtK(v)})
  });
}

function buildBalance(id, labels, balance){
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
  charts[id] = new Chart(ctx,{
    type:'line',
    data:{labels, datasets:[{
      label:'Balance', data:balance, borderColor:C.cyan, borderWidth:2.5, tension:.4,
      pointRadius:0, pointHoverRadius:5, pointHoverBackgroundColor:C.cyan,
      fill:true, backgroundColor:(c)=>gradient(c.chart.ctx,c.chart.chartArea,C.cyan,0.34,0)
    }]},
    options:commonOpts({yTick:v=>fmtK(v)})
  });
}

function buildNoAsset(id, labels, naQty){
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
  const colors = naQty.map(v=>{
    const max=Math.max(...naQty); const r=v/max;
    return r>0.8?C.red : r>0.55?C.amber : C.green;
  });
  charts[id] = new Chart(ctx,{
    type:'bar',
    data:{labels, datasets:[{
      label:'No-Asset Litres', data:naQty,
      backgroundColor:colors.map(c=>c+'cc'), borderColor:colors, borderWidth:1,
      borderRadius:6, borderSkipped:false, maxBarThickness:30
    }]},
    options:commonOpts({yTick:v=>fmtK(v)})
  });
}

function buildTopConsumers(id, rows){
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
  const labels = rows.map(r=>r.asset_code);
  const data = rows.map(r=>+r.consumed_litres);
  charts[id] = new Chart(ctx,{
    type:'bar',
    data:{labels, datasets:[{
      label:'Consumed', data,
      backgroundColor:(c)=>gradient(c.chart.ctx, c.chart.chartArea ? {top:0,bottom:0,left:c.chart.chartArea.left,right:c.chart.chartArea.right}:null, C.cyan,1,1)|| C.cyan,
      borderRadius:6, borderSkipped:false, maxBarThickness:22
    }]},
    options:{
      indexAxis:'y', responsive:true, maintainAspectRatio:false,
      animation:{duration:900, easing:'easeOutQuart'},
      plugins:{tooltip:{callbacks:{label:c=>'  '+fmt(c.parsed.x)+' L'}}},
      scales:{
        x:{...baseScale({callback:v=>fmtK(v)})},
        y:{grid:{display:false}, border:{display:false}, ticks:{color:C.ink3, font:{family:"'IBM Plex Mono', monospace", size:11}}}
      }
    }
  });
  // horizontal gradient fill
  const ch = charts[id];
  ch.data.datasets[0].backgroundColor = (c)=>{
    const a=c.chart.chartArea; if(!a) return C.cyan;
    const g=c.chart.ctx.createLinearGradient(a.left,0,a.right,0);
    g.addColorStop(0,'rgba(56,189,248,0.35)'); g.addColorStop(1,'rgba(34,197,94,0.9)');
    return g;
  };
  ch.update();
}

function buildNet(id, labels, received, issued){
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
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
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
  const map={};
  assets.forEach(a=>{ map[a.category]=(map[a.category]||0)+ (+a.consumed_litres); });
  const labels=Object.keys(map), data=Object.values(map);
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
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
  const pts = assets.map(a=>({x:+a.utilisation_pct, y:+a.consumed_litres, code:a.asset_code}));
  charts[id]=new Chart(ctx,{
    type:'scatter',
    data:{datasets:[{
      data:pts, backgroundColor:'rgba(56,189,248,0.7)', borderColor:C.cyan,
      borderWidth:1, pointRadius:6, pointHoverRadius:9
    }]},
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
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
  const threshold = naQty.reduce((a,b)=>a+b,0)/naQty.length;
  charts[id]=new Chart(ctx,{
    type:'line',
    data:{labels, datasets:[
      {label:'No-Asset Litres', data:naQty, borderColor:C.amber, borderWidth:2.5, tension:.4,
       pointRadius:3, pointBackgroundColor:naQty.map(v=>v>threshold?C.red:C.amber),
       fill:true, backgroundColor:(c)=>gradient(c.chart.ctx,c.chart.chartArea,C.amber,0.22,0)},
      {label:'Avg Threshold', data:labels.map(()=>threshold), borderColor:C.red,
       borderWidth:1.5, borderDash:[6,5], pointRadius:0, fill:false}
    ]},
    options:commonOpts({yTick:v=>fmtK(v)})
  });
}

function buildExcCombo(id, labels, naPct, naTxn){
  destroy(id);
  const ctx = document.getElementById(id).getContext('2d');
  charts[id]=new Chart(ctx,{
    data:{labels, datasets:[
      {type:'bar', label:'No-Asset Txns', data:naTxn, backgroundColor:'rgba(139,146,246,0.55)',
       borderColor:C.violet, borderWidth:1, borderRadius:5, maxBarThickness:30, yAxisID:'y'},
      {type:'line', label:'No-Asset %', data:naPct, borderColor:C.red, borderWidth:2.5, tension:.4,
       pointRadius:3, pointBackgroundColor:C.red, yAxisID:'y1',
       fill:true, backgroundColor:(c)=>gradient(c.chart.ctx,c.chart.chartArea,C.red,0.12,0)}
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

function commonOpts({yTick}={}){
  return {
    responsive:true, maintainAspectRatio:false,
    interaction:{mode:'index', intersect:false},
    animation:{duration:900, easing:'easeOutQuart'},
    plugins:{tooltip:{callbacks:{label:c=>'  '+(c.dataset.label||'')+': '+fmt(c.parsed.y)}}},
    scales:{ x:baseScale(), y:baseScale({callback:yTick||(v=>fmt(v))}) }
  };
}

/* ============================================================
   TABLES
   ============================================================ */
function renderLeader(id, rows){
  const tbody = document.querySelector('#'+id+' tbody'); if(!tbody) return;
  const max = Math.max(...rows.map(r=>+r.consumed_litres));
  tbody.innerHTML = rows.map((r,i)=>{
    const rank = i+1;
    const rankCls = rank<=3 ? 'rank-'+rank : '';
    const util = +r.utilisation_pct;
    return `<tr>
      <td class="rank ${rankCls}">${String(rank).padStart(2,'0')}</td>
      <td><span class="asset-name">${r.asset_name}</span><span class="asset-code">${r.asset_code}</span></td>
      <td><span class="cat-chip">${r.category}</span></td>
      <td class="num">${fmt(+r.consumed_litres)}</td>
      <td class="num">${fmt(+r.transactions)}</td>
      <td>
        <div class="util-bar">
          <div class="util-track"><div class="util-fill" style="width:${util}%"></div></div>
          <span class="util-val">${util}%</span>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ============================================================
   ALERTS
   ============================================================ */
function renderAlerts(kpi, monthly, noAsset, assets){
  const get = m => +(kpi.find(k=>k.metric===m)||{}).value;
  const naPctVals = noAsset.map(r=>+r.no_asset_pct);
  const avgPct = naPctVals.reduce((a,b)=>a+b,0)/naPctVals.length;
  const lastPct = naPctVals[naPctVals.length-1];
  const balance = get('current_balance');
  const issued = get('total_diesel_issued');
  const daysCover = Math.round(balance / (issued/365));
  const naTxnTotal = noAsset.reduce((a,r)=>a+(+r.no_asset_transactions),0);
  const topConsumer = assets[0];

  const alerts = [];

  // No-asset risk
  if(avgPct >= 9) alerts.push({lvl:'red', ico:'⚠', t:'High No-Asset Usage',
    p:`Average no-asset consumption at ${avgPct.toFixed(1)}% of issued volume — exceeds the 9% governance threshold.`});
  else if(avgPct >= 6) alerts.push({lvl:'amber', ico:'⚠', t:'Elevated No-Asset Usage',
    p:`No-asset consumption averaging ${avgPct.toFixed(1)}%. Within tolerance but trending toward review threshold.`});
  else alerts.push({lvl:'green', ico:'✓', t:'No-Asset Usage Controlled',
    p:`Unreferenced consumption at ${avgPct.toFixed(1)}% — comfortably inside governance limits.`});

  // Missing references
  if(naTxnTotal > 250) alerts.push({lvl:'amber', ico:'◷', t:'Missing Asset References',
    p:`${fmt(naTxnTotal)} transactions logged without an asset reference across the reporting period. Reconciliation recommended.`});
  else alerts.push({lvl:'cyan', ico:'◷', t:'Reference Integrity Stable',
    p:`${fmt(naTxnTotal)} unreferenced transactions — within expected operational noise.`});

  // Balance health
  if(daysCover >= 25) alerts.push({lvl:'green', ico:'✓', t:'Diesel Balance Healthy',
    p:`Current stock of ${fmt(balance)} L provides ~${daysCover} days of cover at present issue rates.`});
  else if(daysCover >= 12) alerts.push({lvl:'amber', ico:'≡', t:'Balance Within Range',
    p:`Stock cover at ~${daysCover} days. Monitor upcoming replenishment scheduling.`});
  else alerts.push({lvl:'red', ico:'≡', t:'Low Balance Warning',
    p:`Stock cover at ~${daysCover} days — below safety floor. Expedite resupply.`});

  // Consumption stability (coefficient of variation on issued)
  const iss = monthly.map(r=>+r.issued_litres);
  const mean = iss.reduce((a,b)=>a+b,0)/iss.length;
  const sd = Math.sqrt(iss.reduce((a,b)=>a+(b-mean)**2,0)/iss.length);
  const cv = sd/mean;
  if(cv < 0.15) alerts.push({lvl:'green', ico:'✓', t:'Consumption Stable',
    p:`Monthly issue volatility at ${(cv*100).toFixed(1)}% — demand profile is steady and predictable.`});
  else alerts.push({lvl:'amber', ico:'⌁', t:'Consumption Variability',
    p:`Monthly issue volatility at ${(cv*100).toFixed(1)}% — investigate demand spikes for forecasting.`});

  // Top consumer note
  if(topConsumer) alerts.push({lvl:'cyan', ico:'▦', t:'Lead Consumer',
    p:`${topConsumer.asset_name} (${topConsumer.asset_code}) is the top consumer at ${fmt(+topConsumer.consumed_litres)} L.`});

  const html = alerts.map(a=>`
    <div class="alert ${a.lvl}">
      <div class="alert-ico">${a.ico}</div>
      <div class="alert-body">
        <h4>${a.t}</h4>
        <p>${a.p}</p>
        <div class="alert-time">SIGNAL • AUTO-GENERATED</div>
      </div>
    </div>`).join('');

  const main = document.getElementById('alertsPanel');
  if(main) main.innerHTML = html;
  const exc = document.getElementById('excAlerts');
  if(exc) exc.innerHTML = html;
}

/* ============================================================
   PROJECT INFO
   ============================================================ */
function renderProject(p){
  const cells = [
    ['Project Name', p.project_name],
    ['Client', p.client],
    ['Report Period', p.report_period],
    ['Site Location', p.site_location],
    ['Last Refresh', p.last_refresh],
    ['Report Owner', p.report_owner],
  ];
  const grid = document.getElementById('projectInfo');
  if(grid) grid.innerHTML = cells.map(([k,v])=>`
    <div class="info-cell"><div class="k">${k}</div><div class="v">${v||'—'}</div></div>`).join('');

  const issued = +(DATA.kpi.find(k=>k.metric==='total_diesel_issued')||{}).value;
  const received = +(DATA.kpi.find(k=>k.metric==='total_diesel_received')||{}).value;
  const summary = [
    ['Total Transactions', fmt(+p.total_transactions||0), 'cyan'],
    ['Total Received', fmt(received)+' L', 'cyan'],
    ['Total Issued', fmt(issued)+' L', 'green'],
    ['Active Assets', fmt(+(DATA.kpi.find(k=>k.metric==='active_assets')||{}).value||0), 'green'],
  ];
  const stack = document.getElementById('projectSummary');
  if(stack) stack.innerHTML = summary.map(([l,n,c])=>`
    <div class="summary-item"><span class="lbl">${l}</span><span class="num ${c}">${n}</span></div>`).join('');
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
      // re-flow charts after unhide
      requestAnimationFrame(()=>Object.values(charts).forEach(c=>c.resize()));
      document.getElementById('sidebar').classList.remove('open');
      window.scrollTo({top:0, behavior:'smooth'});
    });
  });
  document.getElementById('hamburger').addEventListener('click', ()=>{
    document.getElementById('sidebar').classList.toggle('open');
  });
}

document.addEventListener('DOMContentLoaded', ()=>{ setupNav(); init(); });
