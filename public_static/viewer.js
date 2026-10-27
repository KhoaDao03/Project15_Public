function preserveNavigation(update){
  const active=document.activeElement,owner=active?.closest('[id]');
  const focus=owner?{id:owner.id,tag:active.tagName,text:active.textContent,label:active.getAttribute('aria-label'),self:owner===active}:null;
  const positions=[...document.querySelectorAll('.table-wrap,.date-strip')].map(node=>({node,left:node.scrollLeft,top:node.scrollTop}));
  const x=scrollX,y=scrollY;
  update();
  if(active&&!active.isConnected&&focus){
    const owner=document.getElementById(focus.id);
    const replacement=focus.self?owner:[...(owner?.querySelectorAll(focus.tag)||[])].find(node=>focus.label?node.getAttribute('aria-label')===focus.label:node.textContent===focus.text);
    replacement?.focus({preventScroll:true});
  }
  for(const {node,left,top} of positions){if(node.isConnected){if(node.scrollLeft!==left)node.scrollLeft=left;if(node.scrollTop!==top)node.scrollTop=top;}}
  if(scrollX!==x||scrollY!==y)window.scrollTo(x,y);
}
function replaceIfChanged(node,...children){
  if(node.childNodes.length===children.length&&children.every((child,i)=>child.isEqualNode(node.childNodes[i])))return;
  node.replaceChildren(...children);
}
const $=id=>document.getElementById(id);
const tabTheme=window.matchMedia('(prefers-color-scheme: dark)');
function updateTabIcon(){$('tab-icon').href=tabTheme.matches?'/logo.svg':'/section-logo.svg';}
tabTheme.addEventListener('change',updateTabIcon);
updateTabIcon();
const el=(tag,value,cls)=>{const node=document.createElement(tag);node.textContent=value??'—';if(cls)node.className=cls;return node;};
const numeric=value=>typeof value==='number'&&Number.isFinite(value);
const money=value=>numeric(value)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4}).format(value):'—';
const referenceMoney=(value,asset)=>numeric(value)&&['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD'].includes(asset)?value.toFixed(asset==='USDJPY'?3:5):['DOGE','COPPER','NATGAS'].includes(asset)&&numeric(value)?'$'+value.toFixed(asset==='DOGE'?7:5):money(value);
const signedMoney=value=>numeric(value)?(value>0?'+':'')+money(value):'—';
const pnlClass=value=>value>0?'positive':value<0?'negative':'';
const percent=value=>numeric(value)?(value*100).toFixed(1)+'%':'—';
const count=value=>numeric(value)?value.toLocaleString('en-US'):'—';
const cryptoSymbols=['BTC','ETH','SOL','XRP','BNB','DOGE'];
const commoditySymbols=['GOLD','SILVER','WTI','PLATINUM','PALLADIUM','COPPER','NATGAS'];
const fxSymbols=['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD'];
const symbols=[...cryptoSymbols,...commoditySymbols,...fxSymbols];
const names=asset=>asset==='WTI'?'OIL / WTI':fxSymbols.includes(asset)?asset.slice(0,3)+'/'+asset.slice(3):asset;
const coinPaths={
 PLATINUM:'M12 2 21 7v10l-9 5-9-5V7Z',
 PALLADIUM:'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Z',
 COPPER:'M5 3h14l3 9-3 9H5l-3-9Z',
 NATGAS:'M13 1c1 6-5 7-3 12 2-1 3-3 3-5 4 3 7 6 6 10a7 7 0 0 1-14-1C4 10 10 8 13 1Zm-1 12c0 3-3 4-3 6a3 3 0 0 0 6 0c0-2-2-3-3-6Z',
 DOGE:'M8 5h4a7 7 0 0 1 0 14H8V5Zm-3 7h9',
 BNB:'M12 2 6.5 7.5 8.6 9.6 12 6.2 15.4 9.6 17.5 7.5ZM2 12l3-3 3 3-3 3Zm10-3 3 3-3 3-3-3Zm7-0 3 3-3 3-3-3ZM6.5 16.5 12 22l5.5-5.5-2.1-2.1-3.4 3.4-3.4-3.4Z',
 BTC:'M10 5v14M13 5v14M7 7h7a3 3 0 0 1 0 6H8m1 0h6a3 3 0 0 1 0 6H7',
 ETH:'M12 2 5 12l7 4 7-4-7-10Zm-7 13 7 7 7-7-7 4-7-4Z',
 SOL:'m6 5-3 3h15l3-3H6Zm-3 6 3 3h15l-3-3H3Zm3 6-3 3h15l3-3H6Z',
 XRP:'M3 3 9 9q3 3 6 0l6-6M3 21l6-6q3-3 6 0l6 6',
 GOLD:'m9 4-2 6h10l-2-6H9ZM4 13l-3 7h10l-2-7H4Zm11 0-2 7h10l-3-7h-5Z',
 SILVER:'m9 4-2 6h10l-2-6H9ZM4 13l-3 7h10l-2-7H4Zm11 0-2 7h10l-3-7h-5Z',
 WTI:'M12 2C10 8 5 10 5 15a7 7 0 0 0 14 0c0-5-5-7-7-13Z'
};
let latest=null;
let selected='BTC',historyMode=false,historyOffset=0,historyTotal=0,historyBusy=false,historyRequest=0;
function coin(asset){
  if(fxSymbols.includes(asset)){
    const node=el('span','','coin forex '+asset.toLowerCase());
    const marks={EUR:'€',GBP:'£',USD:'$',JPY:'¥',AUD:'A$',CAD:'C$'};
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    svg.setAttribute('viewBox','0 0 32 32');svg.setAttribute('aria-hidden','true');
    for(const [currency,x,y] of [[asset.slice(0,3),11,12],[asset.slice(3),22,24]]){
      const circle=document.createElementNS('http://www.w3.org/2000/svg','circle');
      circle.setAttribute('cx',x);circle.setAttribute('cy',y-4);circle.setAttribute('r','9');
      circle.setAttribute('fill',y===12?'var(--forex-base)':'#16382e');circle.setAttribute('stroke','#101c17');
      const label=document.createElementNS('http://www.w3.org/2000/svg','text');
      label.setAttribute('x',x);label.setAttribute('y',y);label.setAttribute('text-anchor','middle');
      label.setAttribute('font-size',marks[currency].length>1?'9':'12');label.setAttribute('font-weight','700');
      label.setAttribute('fill',y===12?'#102019':'#e6f4ed');label.textContent=marks[currency];
      svg.append(circle,label);
    }
    node.append(svg);return node;
  }
  const iconAsset=asset;
  if(!coinPaths[iconAsset])return el('span',asset[0],'coin '+asset.toLowerCase());
  const node=el('span','','coin '+asset.toLowerCase()),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
  svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',coinPaths[iconAsset]);
  const outline=['BTC','XRP','DOGE','PLATINUM','PALLADIUM','COPPER'].includes(asset);path.setAttribute('fill',outline?'none':'currentColor');path.setAttribute('stroke',outline?'currentColor':'none');path.setAttribute('stroke-width','1.7');if(asset==='NATGAS')path.setAttribute('fill-rule','evenodd');svg.append(path);
  const symbol=({PLATINUM:'Pt',PALLADIUM:'Pd',COPPER:'Cu'})[asset];
  if(symbol){const label=document.createElementNS('http://www.w3.org/2000/svg','text');label.setAttribute('x','12');label.setAttribute('y','15.5');label.setAttribute('text-anchor','middle');label.setAttribute('font-size','10');label.setAttribute('font-weight','700');label.setAttribute('fill','currentColor');label.textContent=symbol;svg.append(label);}
  node.append(svg);return node;
}
function marketButton(asset){const button=el('button','','market-button');button.type='button';button.setAttribute('aria-pressed',String(selected===asset));button.append(coin(asset),el('span',names(asset)));button.addEventListener('click',()=>selectMarket(asset));return button;}
function summarize(assets,expectedCount=symbols.length){
  const sum=key=>assets.length===expectedCount&&assets.every(a=>numeric(a[key]))?assets.reduce((n,a)=>n+a[key],0):null;
  const result={};for(const key of ['realized_pnl','completed_trades','wins','losses','breakeven_trades','open_positions','session_pnl'])result[key]=sum(key);
  result.win_rate=result.completed_trades>0&&numeric(result.wins)?result.wins/result.completed_trades:null;
  result.session_pending=assets.some(a=>a.session_pending);return result;
}
function leaders(assets){if(assets.length!==symbols.length||assets.some(a=>!numeric(a.realized_pnl)||!numeric(a.completed_trades))||!assets.some(a=>a.completed_trades>0))return [];const best=Math.max(...assets.map(a=>a.realized_pnl));return assets.filter(a=>a.realized_pnl===best);}
function openTradeHighlight(data,asset){
  if(!numeric(asset.open_positions)||asset.open_positions<=0)return '';
  const opposed=commoditySymbols.includes(asset.asset)&&!data.stale&&!asset.trades_stale&&(asset.trades||[]).some(trade=>{
    if(trade.status!=='OPEN'||!['yes','no'].includes(trade.side))return false;
    const market=(asset.markets||[]).find(m=>m.ticker===trade.market),p=market?.fresh&&market.probability?.available?market.probability:trade.last_model_probability;
    if(p?.available!==true||!numeric(p.p_yes)||!numeric(p.p_no)||p.p_yes<0||p.p_yes>1||p.p_no<0||p.p_no>1)return false;
    return trade.side==='yes'?p.p_no>p.p_yes:p.p_yes>p.p_no;
  });
  return opposed?'has-open-trade model-opposed':'has-open-trade';
}
function liveBuyingStatus(data,asset){if(data.stale||!data.live_available||typeof asset.live_policy?.enabled!=='boolean')return ['Unavailable','buying-unknown'];return asset.live_policy.enabled?['ON','buying-on']:['OFF','buying-off'];}
function buyingBadge(data,asset){const [label,cls]=liveBuyingStatus(data,asset);const badge=el('span',label,'badge live-buying '+cls);badge.title='Saved new-buy setting; entries require strategy and health checks. Automatic exits are separate.';return badge;}
function statusBadge(data,asset){return el('span',data.stale?'Updates delayed':asset.healthy?asset.state:'Checks pending','badge '+(data.stale||!asset.healthy?'status-warning':''));}
function entryConfidenceView(data,asset,detail=false){
  const root=el('div','','probability'+(detail?' probability-detail':''));
  const values=detail?el('div','','probability-values'):root;
  const context=detail?el('div','','probability-context'):null;
  if(detail){values.append(el('small','Entry confidence'));root.append(values,context);}
  const markets=asset.markets||[];
  if(!markets.length)values.append(el('span','Unavailable','muted'));
  for(const market of markets){
    const line=el('div','','probability-market'),p=market.probability;
    if(markets.length>1)line.append(el('small',market.ticker));
    const available=!data.stale&&market.fresh&&p?.available===true&&
      ['yes','no'].includes(p.side)&&numeric(p.confidence)&&p.confidence>=0&&p.confidence<=1&&numeric(p.timestamp);
    if(available){
      line.append(el('span',p.side.toUpperCase()+' '+percent(p.confidence)));
      if(detail){
        if(markets.length>1)context.append(el('small',market.ticker));
        context.append(el('small','As of '+new Date(p.timestamp*1000).toLocaleString()));
        if(p.quality_warning)context.append(el('small','Data quality warning','stale'));
      }
    }else line.append(el('span','Unavailable','muted'));
    values.append(line);
  }
  if(detail)root.append(el('small','Capped confidence for the selected side; other entry checks still apply.','probability-note'));
  return root;
}
function sitoutSchedule(asset){
  // Match the live executor: commodities are exempt.
  if(!['BTC','ETH','SOL','XRP','BNB','DOGE'].includes(asset))return null;
  const section=el('section','','streaks sitout-schedule');
  section.setAttribute('aria-label','Entry sit-out windows');
  section.append(el('strong','Entry sit-out windows · ET'));
  for(const [day,hours] of [['Monday–Friday','11:45–13:00'],['Tuesday (additional)','20:00–21:15'],['Thursday (additional)','19:45–21:00'],['Friday (additional)','07:30–08:45'],['Saturday–Sunday','11:15–12:30']]){
    const row=el('div','','streak-row');row.append(el('span',day),el('span',hours));section.append(row);
  }
  section.append(el('p','Eastern Time (New York); daylight saving adjusts automatically. No new entries during these windows. Entries may resume at the end; existing exits remain active.','muted'));
  return section;
}
function contractPrices(data,asset){
  const section=el('section','','streaks contract-prices');section.setAttribute('aria-label','Contract YES and NO prices');
  section.append(el('strong','Contract prices · cents'));
  const markets=asset.markets||[];
  if(!markets.length)section.append(el('p','Unavailable','muted'));
  for(const market of markets){
    if(markets.length>1)section.append(el('small',market.ticker,'contract-ticker'));
    const grid=el('div','','contract-price-grid');
    for(const side of ['yes','no']){
      const box=el('div','');box.append(el('small',side.toUpperCase()));
      for(const [key,label] of [['bid','Bid'],['ask','Ask']]){
        const value=market.quotes?.[side+'_'+key];
        const available=!data.stale&&market.fresh&&numeric(value)&&value>=0&&value<=1;
        box.append(el('div',label+' '+(available?new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(value*100)+'¢':'Unavailable')));
      }
      grid.append(box);
    }
    section.append(grid);
  }
  section.append(el('p','Bid: best sell price · Ask: best buy price','muted'));
  return section;
}
function selectMarket(asset){selected=asset;historyOffset=0;historyRequest++;if(latest)render(latest);if(historyMode)loadHistory();}
function streakLabel(value){if(!numeric(value))return '—';if(value===0)return 'No streak';return Math.abs(value)+' '+(value>0?(value===1?'win':'wins'):(value===-1?'loss':'losses'));}
function performanceCells(row,a){for(const [key,format] of [['realized_pnl',signedMoney],['completed_trades',count],['wins',count],['losses',count],['win_rate',percent],['current_streak',streakLabel],['open_positions',count],['session_pnl',v=>a.session_pending?(numeric(v)?signedMoney(v)+' · Pending':'Pending'):signedMoney(v)]])row.append(el('td',format(a[key]),key==='session_pnl'&&cryptoSymbols.includes(a.asset)&&a.session_early_exit===true&&a.session_close>Date.now()/1000&&numeric(a[key])&&a[key]<0?'negative session-loss':['realized_pnl','current_streak','session_pnl'].includes(key)?pnlClass(a[key]):''));}
let statistics=null,statisticsBusy=false,recordScope='today';
async function loadStatistics(){
  if(statisticsBusy)return;statisticsBusy=true;
  try{const response=await fetch('/api/performance',{cache:'no-store',signal:AbortSignal.timeout(30000)});if(!response.ok)throw Error('Statistics unavailable; try again.');statistics=await response.json();$('statistics-time').textContent='Calculated at '+new Date(statistics.generated_at*1000).toLocaleString()+(statistics.stale?' · source history delayed':'');if(latest)render(latest);}
  catch(error){$('statistics-time').textContent=error.message+(statistics?' · previous statistics retained':'');}
  finally{statisticsBusy=false;}
}
function render(data){preserveNavigation(()=>renderContent(data));}
function renderContent(data){
  latest=data;
  // Historical totals must not replace the live open-position count (including unknown).
  if(statistics)data={...data,totals_complete:statistics.missing_assets.length===0,assets:data.assets.map(a=>({...a,...statistics.all_time[a.asset],open_positions:a.open_positions,live_policy:a.live_policy,markets:a.markets,trades:a.trades,trades_stale:a.trades_stale}))};
  $('connection').textContent=data.stale?'Updates delayed':'Connected';$('connection').className=data.stale?'stale':'';
  if(numeric(data.updated_at))$('updated').textContent=new Date(data.updated_at*1000).toLocaleString();
  const assets=symbols.map(asset=>(data.assets.find(a=>a.asset===asset)||{asset,markets:[],trades:[]}));
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const daily=statistics?.days?.find(day=>day.date===today)?.assets;
  const records=recordScope==='all'?assets:assets.map(a=>{const stats=daily?.[a.asset];return {...a,session_pnl:stats?.session_pnl??null,session_pending:stats?.session_pending??false,session_early_exit:stats?.session_early_exit??false,session_close:stats?.session_close,realized_pnl:stats?.realized_pnl??null,completed_trades:stats?.completed_trades??null,wins:stats?.wins??null,losses:stats?.losses??null,breakeven_trades:stats?.breakeven_trades??null,win_rate:stats?.win_rate??null};});
  $('summary-period').textContent=recordScope==='all'?'ALL-TIME':'TODAY';$('records-title').textContent=recordScope==='all'?'All-time market records':"Today's market records";$('records-region').setAttribute('aria-label',recordScope==='all'?'All-time market comparison':"Today's market comparison");
  $('scope-all').setAttribute('aria-pressed',String(recordScope==='all'));$('scope-today').setAttribute('aria-pressed',String(recordScope==='today'));
  $('summary-scope-note').textContent=recordScope==='today'?'Today covers trades closed since midnight in America/New_York. Open trades and current streaks are not limited to today.':'All-time covers available recorded history, not a verified account-lifetime total. Open trades are separate from completed trades.';
  $('record-scope-note').textContent=recordScope==='today'?today+' · America/New_York · Closed today; open trades and current streaks remain live':'All available recorded history';
  const total=summarize(records),top=leaders(records),partial=!data.totals_complete||Object.entries(total).some(([key,value])=>!['win_rate','session_pnl'].includes(key)&&value===null);
  const metrics=[['$','Realized P&L',signedMoney(total.realized_pnl),(data.live_only?'Live · ':'')+'After recorded fees'+(partial?' · partial':''),pnlClass(total.realized_pnl)],['▤','Completed trades',count(total.completed_trades),recordScope==='today'?'Closed today':'Recorded history'],['♜','Wins / losses',count(total.wins)+' / '+count(total.losses),'Completed trades'],['◎','Overall win rate',percent(total.win_rate),'Weighted by completed trades'],['▤','Open trades',count(total.open_positions),'Current snapshot'],['♛','Top market by P&L',top.length===1?top[0].asset:'—',top.length===1?signedMoney(top[0].realized_pnl):top.length>1?'Tied for first place':'No ranked history']];
  replaceIfChanged($('summary'),...metrics.map(([icon,label,value,note,cls])=>{const metric=el('div','','metric'),text=el('div','');text.append(el('small',label),el('strong',value,cls),el('small',note));metric.append(el('span',icon,'metric-icon'),text);return metric;}));
  const rows=[];
  for(const [label,group] of [['Digital assets',records.filter(a=>cryptoSymbols.includes(a.asset))],['Commodities',records.filter(a=>commoditySymbols.includes(a.asset))],['Forex',records.filter(a=>fxSymbols.includes(a.asset))]]){
    const heading=el('tr','','group-row'),cell=el('td',label.toUpperCase());cell.colSpan=10;heading.append(cell);rows.push(heading);
    group.sort((a,b)=>(numeric(b.realized_pnl)?b.realized_pnl:-Infinity)-(numeric(a.realized_pnl)?a.realized_pnl:-Infinity));
    for(const a of group){const row=el('tr','',[selected===a.asset?'selected':'',openTradeHighlight(data,a),liveBuyingStatus(data,a)[0]==='OFF'?'trading-off':''].filter(Boolean).join(' ')),market=el('td','');market.append(marketButton(a.asset));const rank=numeric(a.realized_pnl)?1+records.filter(b=>numeric(b.realized_pnl)&&b.realized_pnl>a.realized_pnl).length:'—';row.append(el('td',rank),market);performanceCells(row,a);row.addEventListener('click',event=>{if(!event.target.closest('button'))selectMarket(a.asset);});rows.push(row);}
  }
  replaceIfChanged($('comparison'),...rows);
  const totals=el('tr','',records.some(a=>a.open_positions>0)||total.session_pending?'has-open-trade':''),label=el('td','TOTAL ('+symbols.length+' markets)');label.colSpan=2;totals.append(label);performanceCells(totals,total);const subtotals=[['CRYPTO TOTAL',cryptoSymbols],['COMMODITIES TOTAL',commoditySymbols],['FOREX TOTAL',fxSymbols]].map(([name,members])=>{const values=summarize(records.filter(a=>members.includes(a.asset)),members.length),row=el('tr','',records.some(a=>members.includes(a.asset)&&a.open_positions>0)||values.session_pending?'has-open-trade':''),cell=el('td',name);cell.colSpan=2;row.append(cell);performanceCells(row,values);return row;});replaceIfChanged($('totals'),...subtotals,totals);
  $('insight').textContent=(top.length===1?(top[0].asset+' leads all markets by recorded realized P&L. '):top.length>1?'Multiple markets are tied for first place. ':'Market ranking requires available completed history for all markets. ')+(partial?'Some totals are unavailable or partial. ':'')+'Latest session Δ P&L covers the last completed 15-minute contract, or an early realized crypto loss in the current contract; no trade shows $0 and unsettled trades show Pending. These are recorded trade results, not underlying market-price returns.';
  replaceIfChanged($('market-status'),...assets.map(a=>{const row=el('tr','',[selected===a.asset?'selected':'',openTradeHighlight(data,a),liveBuyingStatus(data,a)[0]==='OFF'?'trading-off':''].filter(Boolean).join(' ')),market=el('td',''),price=el('td',referenceMoney(a.price,a.asset)),status=el('td',''),buying=el('td','');market.append(marketButton(a.asset));if(!a.markets?.length||a.markets.some(m=>!m.fresh))price.append(el('small','⚠ Stale market data','stale'));status.append(statusBadge(data,a));buying.append(buyingBadge(data,a));const probability=el('td','');probability.append(entryConfidenceView(data,a));row.append(market,price,probability,status,buying);row.addEventListener('click',event=>{if(!event.target.closest('button'))selectMarket(a.asset);});return row;}));
  const asset=assets.find(a=>a.asset===selected);$('detail-title').textContent=names(selected)+' / Market detail';$('detail-icon').replaceWith(Object.assign(coin(selected),{id:'detail-icon'}));
  const reference=el('div','','reference-row'),price=el('div',''),status=el('div','');price.append(el('small','Reference price'),el('strong',referenceMoney(asset.price,asset.asset)));status.append(el('small','Operational status'),el('br',''),statusBadge(data,asset));reference.append(price,status,entryConfidenceView(data,asset,true));
  const sizing=el('div','','source');sizing.id='configured-contracts';const contracts=asset.live_policy?.contracts;sizing.append(el('small','Configured contracts'),el('span',!data.stale&&data.live_available&&Number.isInteger(contracts)&&contracts>0?count(contracts)+' contracts':'Unavailable'));
  const source=el('div','','source');source.append(el('small','Source market identifier(s)'),el('span',asset.markets?.map(m=>m.ticker+(m.fresh?'':' · stale')).join(', ')||'Unavailable'));
  const average=el('section','','streaks');average.id='average-contract-profit';const cents=asset.average_net_cents;const averageRow=el('div','','streak-row');averageRow.append(el('strong','Average net per contract'),el('span',numeric(cents)?(cents>0?'+':'')+cents.toFixed(2)+'¢':'Unavailable',pnlClass(cents)));average.append(averageRow,el('p','After fees · All recorded completed trades · Weighted by contracts bought. Open trades excluded.','note'));
  const streaks=el('div','','streaks');streaks.append(el('strong','Performance (recorded)'));for(const [name,value] of [['Current win streak',numeric(asset.current_streak)?Math.max(0,asset.current_streak):null],['Current loss streak',numeric(asset.current_streak)?Math.max(0,-asset.current_streak):null],['Longest win streak',asset.longest_win_streak],['Longest loss streak',asset.longest_loss_streak]]){const line=el('div','','streak-row');line.append(el('span',name),el('span',count(value)));streaks.append(line);}const sitout=sitoutSchedule(asset.asset);replaceIfChanged($('detail'),reference,sizing,source,contractPrices(data,asset),...(sitout?[sitout]:[]),average,streaks);
  $('trades-icon').replaceWith(Object.assign(coin(selected),{id:'trades-icon'}));
  $('trades-title').textContent=names(selected)+(historyMode?' · Trade records':' · Latest 5 trades');
  $('trade-scope').textContent=asset.trades_stale?'Trade updates delayed · displayed records may be stale.':'Recent rows shown; totals above follow the selected performance period.';
  if(!historyMode)renderTrades(asset.trades||[]);

}
function renderTrades(trades){const wrap=$('trades').querySelector('.table-wrap')||el('div','','table-wrap');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Trade records');const table=el('table',''),head=el('thead',''),headers=el('tr','');for(const label of ['Market / time','Status','Market settled','Side / quantity','Entry','Exit','Fees','Net P&L'])headers.append(el('th',label));head.append(headers);table.append(head);const body=el('tbody','');
  for(const trade of trades){const row=el('tr',''),market=el('td',trade.market,'market');market.append(el('small',numeric(trade.opened??trade.timestamp)?new Date((trade.opened??trade.timestamp)*1000).toLocaleString():'Time unavailable'));row.append(market);const open=trade.status==='OPEN';for(const value of [open?'OPEN':'CLOSED',trade.market_result==='yes'?'YES':trade.market_result==='no'?'NO':'Pending / unknown',(trade.side??'—').toUpperCase()+' / '+(trade.bought??'—'),money(trade.entry),open?'Pending':money(trade.exit),money(trade.fees)])row.append(el('td',value));if(!open&&trade.exit_timestamp)row.children[5].append(el('small',(trade.exit_type==='settlement'?'Settled: ':'Sold / exit: ')+new Date(trade.exit_timestamp*1000).toLocaleString()));row.append(el('td',open?'Pending':signedMoney(trade.net_pnl),open?'':pnlClass(trade.net_pnl)));body.append(row);}
  table.append(body);
  // Keep the scroll container mounted so refreshes do not interrupt mobile scrolling.
  if(!wrap.firstChild?.isEqualNode(table)){const left=wrap.scrollLeft,top=wrap.scrollTop;wrap.replaceChildren(table);if(!trades.length)wrap.append(el('p','No trades recorded in this view.'));wrap.scrollLeft=left;wrap.scrollTop=top;}
  if(!wrap.isConnected)$('trades').replaceChildren(wrap);
}
async function loadHistory(){const request=++historyRequest,asset=selected;historyBusy=true;$('trades').replaceChildren(el('p','Loading recorded history…'));$('history-message').textContent='';updatePagination();try{const response=await fetch('/api/history/'+asset+'?offset='+historyOffset+'&limit=25',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw new Error('History unavailable. Try again.');const data=await response.json();if(request!==historyRequest)return;historyTotal=data.total;renderTrades(data.rows);$('history-message').textContent=data.stale?'History updates delayed.':'Available recorded history · '+historyTotal.toLocaleString()+' trades.';}catch(error){if(request===historyRequest)$('history-message').textContent=error.message;}finally{if(request===historyRequest){historyBusy=false;updatePagination();}}}
function updatePagination(){$('pagination').hidden=!historyMode;$('previous').disabled=historyBusy||historyOffset===0;$('next').disabled=historyBusy||historyOffset+25>=historyTotal;$('page-info').textContent=historyBusy?'Loading…':historyTotal?`${historyOffset+1}–${Math.min(historyOffset+25,historyTotal)} of ${historyTotal}`:'No records';}
for(const scope of ['all','today'])$('scope-'+scope).addEventListener('click',()=>{recordScope=scope;if(latest)render(latest);});
$('browse').addEventListener('click',()=>{historyMode=!historyMode;historyOffset=0;historyRequest++;$('browse').textContent=historyMode?'Latest 5 trades':'Browse all records';$('history-message').textContent='';updatePagination();if(latest)render(latest);if(historyMode)loadHistory();});
$('previous').addEventListener('click',()=>{historyOffset=Math.max(0,historyOffset-25);loadHistory();});$('next').addEventListener('click',()=>{historyOffset+=25;loadHistory();});
async function refresh(){try{const response=await fetch('/api/view',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!response.ok)throw new Error('Unavailable');const data=await response.json();data.stale=data.stale||!numeric(data.updated_at)||Date.now()/1000-data.updated_at>20;render(data);}catch{if(latest){latest.stale=true;render(latest);}$('connection').textContent='Updates unavailable · values may be out of date';$('connection').className='stale';}finally{setTimeout(refresh,1000);}}
setInterval(()=>{if(latest&&!latest.stale&&Date.now()/1000-latest.updated_at>20){latest.stale=true;render(latest);}},1000);
refresh();

loadStatistics();setInterval(loadStatistics,1000);
