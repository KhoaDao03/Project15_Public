function preserveNavigation(update){
  const active=document.activeElement,owner=active?.closest('[id]');
  const focus=owner?{id:owner.id,tag:active.tagName,text:active.textContent,label:active.getAttribute('aria-label'),date:active.dataset.date,self:owner===active}:null;
  const positions=[...document.querySelectorAll('.table-wrap,.date-strip')].map(node=>({node,left:node.scrollLeft,top:node.scrollTop}));
  const x=scrollX,y=scrollY;
  update();
  if(active&&!active.isConnected&&focus){
    const owner=document.getElementById(focus.id);
    const replacement=focus.self?owner:[...(owner?.querySelectorAll(focus.tag)||[])].find(node=>focus.date?node.dataset.date===focus.date:focus.label?node.getAttribute('aria-label')===focus.label:node.textContent===focus.text);
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
const el=(tag,value,cls)=>{const n=document.createElement(tag);if(value!==undefined)n.textContent=value;if(cls)n.className=cls;return n;};
const numeric=v=>typeof v==='number'&&Number.isFinite(v);
const symbols=['BTC','ETH','SOL','XRP','BNB','DOGE','GOLD','SILVER','WTI','PLATINUM','PALLADIUM','COPPER','NATGAS','EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD'];
const cryptoSymbols=['BTC','ETH','SOL','XRP','BNB','DOGE'];
const fxSymbols=['EURUSD','GBPUSD','USDJPY','AUDUSD','USDCAD'];
const commoditySymbols=symbols.filter(asset=>!cryptoSymbols.includes(asset)&&!fxSymbols.includes(asset));
const assetName=a=>a==='WTI'?'OIL / WTI':fxSymbols.includes(a)?a.slice(0,3)+'/'+a.slice(3):a;
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
const zone='America/New_York';
const money=v=>numeric(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:normalizedView?4:2}).format(v):'—';
const signed=v=>numeric(v)?(v>0?'+':'')+money(v):'—';
const pnlClass=v=>v>0?'positive':v<0?'negative':'';
const dateObject=d=>new Date(d+'T12:00:00Z');
const iso=d=>d.toISOString().slice(0,10);
const shiftDay=(d,n)=>{const date=dateObject(d);date.setUTCDate(date.getUTCDate()+n);return iso(date);};
const monthStart=d=>d.slice(0,7)+'-01';
const shiftMonth=(d,n)=>{const date=dateObject(monthStart(d));date.setUTCMonth(date.getUTCMonth()+n);return iso(date);};
const weekStart=d=>shiftDay(d,-dateObject(d).getUTCDay());
const dateLabel=d=>dateObject(d).toLocaleDateString('en-US',{timeZone:'UTC',month:'long',day:'numeric',year:'numeric'});
const localToday=()=>new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const timestamp=v=>numeric(v)?new Date(v*1000).toLocaleString('en-US',{timeZone:zone}):'—';
// Reference example; separate from live data and editable only in browser memory.
const exampleDays=Object.fromEntries(Object.entries({'01':2311,'02':2285,'05':2383,'06':2348,'07':-2557,'08':-96,'09':2132,'12':1982,'13':-2278,'14':-2548,'15':2327,'16':2403}).map(([day,pnl])=>['2025-10-'+day,{pnl,trades:1}]));
let performanceData=null,selectedDay=localToday(),anchor=selectedDay,view='month',source='recorded',assetFilter='all',performanceBusy=false,initialized=false;
let tradeAsset='BTC',tradeBasis='closed',offset=0,totalTrades=0,tradesBusy=false,tradeRequest=0,shownTradeKey='';
const theme=matchMedia('(prefers-color-scheme: dark)');
function updateIcon(){$('tab-icon').href=theme.matches?'/logo.svg':'/section-logo.svg';}theme.addEventListener('change',updateIcon);updateIcon();
function includedAssets(){return assetFilter==='all'?symbols:assetFilter==='crypto'?cryptoSymbols:assetFilter==='commodities'?commoditySymbols:[assetFilter];}
function availableSum(values){const known=values.filter(numeric);return known.length?known.reduce((a,b)=>a+b,0):null;}
function aggregate(assets){const values=includedAssets().map(a=>assets?.[a]);return {pnl:availableSum(values.map(a=>a?.realized_pnl)),trades:availableSum(values.map(a=>a?.completed_trades)),partial:values.some(a=>!numeric(a?.realized_pnl))};}
function dayStats(day){
 if(source==='example')return exampleDays[day]||{pnl:0,trades:0};
 const record=performanceData?.days.find(d=>d.date===day);
 if(record)return aggregate(record.assets);
 return {pnl:null,trades:0};
}
function periodDates(kind=view){const start=kind==='week'?weekStart(anchor):monthStart(anchor),end=kind==='week'?shiftDay(start,7):shiftMonth(start,1),days=[];for(let d=start;d<end;d=shiftDay(d,1))days.push(d);return days;}
function metric(label,value,cls=''){const n=el('div','','pnl-stat');n.append(el('small',label),el('strong',value,cls));return n;}
function cellAmount(v){if(!numeric(v))return '—';const amount=$('signed-losses').checked?v:Math.abs(v);return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:Math.abs(amount)>=1000?0:normalizedView?4:2,notation:Math.abs(amount)>=100000?'compact':'standard'}).format(amount);}
function renderCalendar(){
 const month=monthStart(anchor),start=view==='month'?weekStart(month):weekStart(anchor),length=view==='month'?42:7;
 $('month-title').textContent=view==='month'?dateObject(month).toLocaleDateString('en-US',{timeZone:'UTC',month:'long',year:'numeric'}):dateLabel(start)+' – '+dateLabel(shiftDay(start,6));
 $('week-view').setAttribute('aria-pressed',String(view==='week'));$('month-view').setAttribute('aria-pressed',String(view==='month'));
 $('period-prev').setAttribute('aria-label','Previous '+view);$('period-next').setAttribute('aria-label','Next '+view);
 const days=periodDates(),values=days.map(dayStats),available=source==='example'||days.some(d=>performanceData?.days.some(r=>r.date===d));
 const complete=available&&values.every((v,i)=>numeric(v.pnl)||!performanceData?.days.some(r=>r.date===days[i]));
 const pnl=complete?values.reduce((s,v)=>s+(v.pnl||0),0):null,trades=values.every(v=>numeric(v.trades))?values.reduce((s,v)=>s+v.trades,0):null;
 $('period-summary').textContent=(source==='example'?'Example · ':assetFilter==='all'?'All markets · ':$('calendar-asset').selectedOptions[0].text+' · ')+signed(pnl)+' net · '+(trades??'—')+' closed trades';
 const cells=[];
 for(let i=0;i<length;i++){
  const day=shiftDay(start,i),stats=dayStats(day),active=day===selectedDay;
  const button=el('button',undefined,'pnl-day '+(stats.trades>0?(stats.pnl>0?'profit':stats.pnl<0?'loss':'neutral'):'')+(day.slice(0,7)!==month.slice(0,7)?' outside':'')+(active?' chosen':''));
  button.type='button';button.dataset.date=day;button.tabIndex=active?0:-1;button.setAttribute('aria-pressed',String(active));
  if(day===localToday())button.setAttribute('aria-current','date');
  button.setAttribute('aria-label',dateLabel(day)+', '+(stats.trades>0?signed(stats.pnl)+' net, '+stats.trades+' completed trades':stats.trades===null?'Data unavailable':'No recorded closed trades'));
  button.title=button.getAttribute('aria-label');button.append(el('span',String(dateObject(day).getUTCDate()),'pnl-day-number'));
  if(stats.trades>0||stats.trades===null)button.append(el('strong',cellAmount(stats.pnl),'pnl-day-value '+pnlClass(stats.pnl)),el('small',stats.trades===null?'Unavailable':stats.trades+' '+(stats.trades===1?'trade':'trades'),'pnl-day-count'));
  button.addEventListener('click',()=>chooseDay(day));
  button.addEventListener('keydown',event=>{const n={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7,Home:-dateObject(day).getUTCDay(),End:6-dateObject(day).getUTCDay()}[event.key];if(n===undefined)return;event.preventDefault();chooseDay(shiftDay(day,n));$('pnl-days').querySelector('[aria-pressed=true]')?.focus({preventScroll:true});});
  cells.push(button);
 }
 if(!cells.some(n=>n.tabIndex===0))cells[0].tabIndex=0;
 replaceIfChanged($('pnl-days'),...cells);
}
function selectTradeAsset(asset){tradeAsset=asset;$('trade-asset').value=asset;offset=0;render();loadTrades();}
function dailyMarketStats(){return performanceData?.days.find(d=>d.date===selectedDay)?.assets||{};}
function dailyCells(row,stats){
 const count=v=>numeric(v)?v.toLocaleString('en-US'):'—';
 for(const [key,format] of [['realized_pnl',signed],['completed_trades',count],['wins',count],['losses',count],['win_rate',v=>numeric(v)?(v*100).toFixed(1)+'%':'—']])row.append(el('td',format(stats[key]),key==='realized_pnl'?pnlClass(stats[key]):''));
}

function renderDailyMarkets(){
 $('daily-market-records').hidden=source==='example';if(source==='example')return;
 const daily=dailyMarketStats(),rows=[],included=includedAssets();
 $('daily-market-date').textContent=dateLabel(selectedDay)+' · '+$('calendar-asset').selectedOptions[0].text+' · After recorded fees';
 for(const [label,assets] of [['Digital assets',cryptoSymbols],['Commodities',commoditySymbols],['Forex',fxSymbols]]){
  const group=assets.filter(a=>included.includes(a));if(!group.length)continue;
  const heading=el('tr','','group-row'),cell=el('td',label.toUpperCase());cell.colSpan=7;heading.append(cell);rows.push(heading);
  group.sort((a,b)=>(daily[b]?.realized_pnl??-Infinity)-(daily[a]?.realized_pnl??-Infinity));
  for(const asset of group){const stats=daily[asset]||{},row=el('tr','',asset===tradeAsset?'selected':''),market=el('td'),button=el('button','','market-button');button.type='button';button.setAttribute('aria-pressed',String(asset===tradeAsset));button.append(coin(asset),el('span',assetName(asset)));button.addEventListener('click',()=>selectTradeAsset(asset));market.append(button);
   const rank=numeric(stats.realized_pnl)?1+included.filter(a=>numeric(daily[a]?.realized_pnl)&&daily[a].realized_pnl>stats.realized_pnl).length:'—';row.append(el('td',rank),market);dailyCells(row,stats);row.addEventListener('click',event=>{if(!event.target.closest('button'))selectTradeAsset(asset);});rows.push(row);
  }
 }
 replaceIfChanged($('daily-market-rows'),...rows);
 const totals=[];
 for(const [name,members] of [['CRYPTO TOTAL',cryptoSymbols],['COMMODITIES TOTAL',commoditySymbols],['FOREX TOTAL',fxSymbols],['TOTAL',included]]){
  const selected=members.filter(a=>included.includes(a));if(!selected.length)continue;
  const total={};for(const key of ['realized_pnl','completed_trades','wins','losses'])total[key]=availableSum(selected.map(a=>daily[a]?.[key]));
  total.session_pending=selected.some(a=>daily[a]?.session_pending);
  const rated=selected.map(a=>daily[a]).filter(a=>numeric(a?.wins)&&numeric(a?.completed_trades)&&a?.unknown_pnl===0),completed=rated.reduce((n,a)=>n+a.completed_trades,0);
  total.win_rate=completed>0?rated.reduce((n,a)=>n+a.wins,0)/completed:null;
  const row=el('tr','',total.session_pending?'has-open-trade':''),label=el('td',name);label.colSpan=2;row.append(label);dailyCells(row,total);totals.push(row);
 }
 replaceIfChanged($('daily-market-totals'),...totals);
}
function render(){preserveNavigation(()=>{
 const demo=source==='example';$('example-notice').hidden=!demo;$('example-detail').hidden=!demo;$('recorded-trades').hidden=demo;$('calendar-asset').disabled=demo;$('edit-example').disabled=!demo;
 const all=performanceData?aggregate(performanceData.all_time):{pnl:null,trades:null};
 replaceIfChanged($('all-time-summary'),metric('Recorded realized P&L',signed(all.pnl),pnlClass(all.pnl)),metric('Completed trades',all.trades??'—'),metric('Scope',assetFilter==='all'?'All markets':$('calendar-asset').selectedOptions[0].text));
 renderDailyMarkets();$('day-trades-title').textContent=assetName(tradeAsset)+' · Trade records';replaceIfChanged($('day-trades-icon'),coin(tradeAsset));
 renderIntraday();renderCalendar();const stats=dayStats(selectedDay);$('day-title').textContent=dateLabel(selectedDay);
 $('day-note').textContent=demo?'Example daily result':(selectedDay===performanceData?.today?'Today · In progress · ':'')+(stats.trades===0?'No recorded closed trades for this date.':'Realized results · '+$('calendar-asset').selectedOptions[0].text)+' · America/New_York';
 replaceIfChanged($('day-summary'),metric('Net P&L',signed(stats.pnl),pnlClass(stats.pnl)),metric('Closed trades',stats.trades??'—'));
});}
function chooseDay(day){selectedDay=day;anchor=day;offset=0;render();loadTrades();loadIntraday();}
function navigate(direction){anchor=view==='month'?shiftMonth(anchor,direction):shiftDay(anchor,7*direction);render();}
function pagination(){$('day-trades-prev').disabled=offset===0||tradesBusy;$('day-trades-next').disabled=offset+25>=totalTrades||tradesBusy;$('day-trades-page').textContent=totalTrades?`${offset+1}–${Math.min(offset+25,totalTrades)} of ${totalTrades}`:'No records';}
async function loadTrades(background=false){
 if(source!=='recorded'||!performanceData||(background&&tradesBusy))return;
 const request=++tradeRequest,key=[selectedDay,tradeAsset,tradeBasis,offset].join(':');tradesBusy=true;
 if(key!==shownTradeKey){shownTradeKey=key;$('day-trades').replaceChildren();$('day-trades-message').textContent='Loading '+assetName(tradeAsset)+' trades…';}if(!background)pagination();
 try{
 const response=await fetch(resultsURL('/api/history/'+tradeAsset+'?'+new URLSearchParams({day:selectedDay,basis:tradeBasis,offset,limit:25})),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Trade records are temporarily unavailable. Retrying automatically.');
 const data=await response.json();if(request!==tradeRequest||source!=='recorded')return;totalTrades=data.total;
 const rows=data.rows.map(trade=>{
 const row=el('tr');if(normalizedView&&trade.normalization_available===false)row.title='Original contracts bought unavailable; Paper Trading amounts cannot be calculated.';const market=el('td',trade.market,'market'),open=trade.status==='OPEN';market.append(el('small',timestamp(trade.opened??trade.timestamp)));row.append(market);
 for(const value of [open?'OPEN':'CLOSED',trade.market_result==='yes'?'YES':trade.market_result==='no'?'NO':'Pending / unknown',(trade.side||'—').toUpperCase()+' / '+(trade.bought??trade.quantity??'—'),money(trade.entry),open?'Pending':money(trade.exit),money(trade.fees)])row.append(el('td',value));
 if(!open&&trade.exit_timestamp)row.children[5].append(el('small',(trade.exit_type==='settlement'?'Settled: ':'Sold / exit: ')+timestamp(trade.exit_timestamp)));
 row.append(el('td',open?'Pending':signed(trade.net_pnl),open?'':pnlClass(trade.net_pnl)));return row;});
 preserveNavigation(()=>replaceIfChanged($('day-trades'),...rows));$('day-trades-message').textContent=(data.stale?'History updates delayed. ':'')+assetName(tradeAsset)+' · '+(data.total?data.total+' recorded trades': 'No trades '+tradeBasis+' on this day.');
 }catch(error){if(request===tradeRequest)$('day-trades-message').textContent=error.message;}
 finally{if(request===tradeRequest){tradesBusy=false;pagination();}}
}
async function refreshPerformance(){
 if(performanceBusy)return;performanceBusy=true;
 try{const response=await fetch(resultsURL('/api/performance'),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Performance history is temporarily unavailable. Retrying automatically.');const data=await response.json();performanceData=data;
 if(!initialized&&source==='recorded'){selectedDay=anchor=data.today;initialized=true;}
 $('connection').textContent=data.stale?'History delayed':'History connected';$('connection').className=data.stale?'stale':'';$('updated').textContent=timestamp(data.generated_at);
 $('performance-message').textContent=[data.stale?'History updates delayed; showing last available records.':'',data.missing_assets?.length?'Incomplete history: '+data.missing_assets.join(', ')+'. Totals include available markets only.':'',Object.values(data.all_time||{}).some(a=>a.unknown_pnl>0)?'Some completed trades have unknown P&L. Markets with unavailable P&L are excluded from totals.':'',data.excluded_undated_trades?data.excluded_undated_trades+' trades have no closure date and are excluded from the calendar.':''].filter(Boolean).join(' ');
 render();loadIntraday();await loadTrades(true);
 }catch(error){$('performance-message').textContent=error.message+(performanceData?' Previously loaded results may be out of date.':'');$('connection').textContent='History unavailable';$('connection').className='stale';}
 finally{performanceBusy=false;}
}
function csvFor(kind){const rows=[['Date','Net P&L (USD)','Completed trades','Scope','Source']];for(const day of periodDates(kind)){const stats=dayStats(day);rows.push([day,numeric(stats.pnl)?stats.pnl:'',stats.trades??'',source==='example'?'Example':assetFilter,normalizedView?'paper-trading-1-contract':source]);}return rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');}
function exportCSV(kind){const blob=new Blob([csvFor(kind)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=`project15-${normalizedView?'paper-trading-1-contract':source}-${kind}-${anchor}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
const lineColors=['#f3f4f6','#ff8a3d','#a78bfa','#34d399','#38bdf8','#6385ff','#e879f9','#a3e635','#fff176','#94a3b8','#fb7185','#cbd5e1','#c4b5fd','#e7a06f','#67e8f9','#f472b6','#2dd4bf','#fbbf24','#60a5fa'];
let intradayData=null,intradayBusy=false,intradaySignature='',inspectedTime=null,plotGeometry=null;
const hiddenLines=new Set();
function svgNode(tag,attrs,text){const node=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [key,value] of Object.entries(attrs))node.setAttribute(key,value);if(text!==undefined)node.textContent=text;return node;}
function atTime(points,time){let low=0,high=points.length;while(low<high){const middle=(low+high)>>1;if(points[middle].timestamp<=time)low=middle+1;else high=middle;}return low?points[low-1].pnl:null;}
function chartSeries(){
 if(!intradayData)return [];
 const assets=includedAssets(),times=[...new Set(assets.flatMap(a=>(intradayData.assets[a]||[]).map(p=>p.timestamp)))].sort((a,b)=>a-b);
 const total=times.map(timestamp=>{const values=assets.map(a=>atTime(intradayData.assets[a]||[],timestamp));return {timestamp,pnl:availableSum(values)};});
 return [{key:'TOTAL',label:'Total',color:lineColors[0],points:total},...assets.map(a=>({key:a,label:assetName(a),color:lineColors[symbols.indexOf(a)+1],points:intradayData.assets[a]||[]}))];
}
function intradayTimeLabel(time,detail=false){return new Date(time*1000).toLocaleTimeString('en-US',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23',...(detail?{second:'2-digit',timeZoneName:'short'}:{})});}
function inspectChart(time){
 if(!plotGeometry||!intradayData)return;
 inspectedTime=Math.max(intradayData.start,Math.min(time,intradayData.until));
 const cursor=$('intraday-cursor');if(cursor){const x=plotGeometry.X(inspectedTime);cursor.setAttribute('x1',x);cursor.setAttribute('x2',x);}
 const timeLabel=$('intraday-cursor-time'),timeBadge=$('intraday-cursor-label');if(timeLabel&&timeBadge){const x=Math.max(plotGeometry.left+28,Math.min(plotGeometry.X(inspectedTime),plotGeometry.right-28));timeBadge.setAttribute('transform',`translate(${x},267)`);timeLabel.textContent=inspectedTime>=intradayData.end?'24:00':intradayTimeLabel(inspectedTime);}
 $('intraday-time').textContent=dateLabel(selectedDay)+' · '+(inspectedTime>=intradayData.end?'End of day (24:00)':intradayTimeLabel(inspectedTime,true));
 replaceIfChanged($('intraday-values'),...chartSeries().filter(s=>!hiddenLines.has(s.key)).map(s=>{const item=el('div'),swatch=svgNode('svg',{viewBox:'0 0 12 12',width:12,height:12,'aria-hidden':'true'});swatch.append(svgNode('circle',{cx:6,cy:6,r:4,fill:s.color}));item.append(swatch,el('span',s.label),el('strong',signed(atTime(s.points,inspectedTime))));return item;}));
}
function renderIntraday(){
 const demo=source==='example',valid=intradayData?.day===selectedDay&&!demo;
 $('intraday-scope').textContent=dateLabel(selectedDay)+' · '+$('calendar-asset').selectedOptions[0].text+' · Cumulative realized P&L after fees';
 $('intraday-plot').toggleAttribute('hidden',!valid);$('intraday-legend').hidden=!valid;$('intraday-values').hidden=!valid;$('intraday-time').hidden=!valid;$('intraday-toggle-all').hidden=!valid;
 if(!valid){$('intraday-message').textContent=demo?'Example records contain daily totals only, so no intraday times are available.':'Loading intraday results…';intradaySignature='';plotGeometry=null;return;}
 const series=chartSeries(),visible=series.filter(s=>!hiddenLines.has(s.key));
 $('intraday-toggle-all').textContent=visible.length===series.length?'Deselect all':'Select all';
 const unknown=series.some(s=>s.points.some(p=>!numeric(p.pnl)));
 $('intraday-message').textContent=[intradayData.stale?'Intraday history is delayed or incomplete.':'',unknown?'Some P&L values are unavailable; affected lines stop where values become unknown.':'',intradayData.until===intradayData.start?'No elapsed trading time for this date.':''].filter(Boolean).join(' ');
 const width=Math.max(300,Math.min(1250,$('intraday-plot').clientWidth||800)),height=320;
 const signature=JSON.stringify([selectedDay,assetFilter,width,series,[...hiddenLines],intradayData.until]);if(signature===intradaySignature)return;intradaySignature=signature;
 const legend=series.map(s=>{const button=el('button'),swatch=svgNode('svg',{viewBox:'0 0 20 12',width:20,height:12,'aria-hidden':'true'});swatch.append(svgNode('line',{x1:0,x2:20,y1:6,y2:6,stroke:s.color,'stroke-width':s.key==='TOTAL'?3:2}));button.type='button';button.setAttribute('aria-label',s.label+' P&L line');button.setAttribute('aria-pressed',String(!hiddenLines.has(s.key)));button.append(swatch,el('span',s.label));button.addEventListener('click',()=>{if(hiddenLines.has(s.key))hiddenLines.delete(s.key);else hiddenLines.add(s.key);renderIntraday();});return button;});replaceIfChanged($('intraday-legend'),...legend);
 const values=visible.flatMap(s=>s.points.map(p=>p.pnl).filter(numeric));let min=values.reduce((a,b)=>Math.min(a,b),0),max=values.reduce((a,b)=>Math.max(a,b),0);const pad=(max-min)*.1||1;min-=pad;max+=pad;
 const left=width<500?62:82,right=width-16,top=30,bottom=260,start=intradayData.start,end=intradayData.end;
 const X=t=>left+(t-start)/(end-start)*(right-left),Y=v=>bottom-(v-min)/(max-min)*(bottom-top);plotGeometry={X,left,right,width,start,end};
 const nodes=[svgNode('title',{},'Cumulative realized P&L · '+dateLabel(selectedDay)),svgNode('text',{x:left,y:16,fill:'#B5C1BC','font-size':12},'P&L (USD)')];
 for(let i=0;i<=4;i++){const value=min+(max-min)*i/4,y=Y(value);nodes.push(svgNode('line',{x1:left,x2:right,y1:y,y2:y,stroke:'#2b4439'}),svgNode('text',{x:left-8,y:y+4,'text-anchor':'end',fill:'#B5C1BC','font-size':11},new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',notation:'compact',maximumFractionDigits:1}).format(value)));}
 nodes.push(svgNode('line',{x1:left,x2:right,y1:Y(0),y2:Y(0),stroke:'#71877b','stroke-dasharray':'3 4'}));
 const ticks=width<500?2:4;for(let i=0;i<=ticks;i++){const t=start+(end-start)*i/ticks;nodes.push(svgNode('text',{x:X(t),y:282,'text-anchor':i===0?'start':i===ticks?'end':'middle',fill:'#B5C1BC','font-size':11},i===ticks?'24:00':intradayTimeLabel(t)));}
 nodes.push(svgNode('text',{x:(left+right)/2,y:308,'text-anchor':'middle',fill:'#B5C1BC','font-size':12},'Time · America/New_York'));
 for(const series of [...visible.filter(s=>s.key!=='TOTAL'),...visible.filter(s=>s.key==='TOTAL')]){
  let d='',previous=null;for(const point of series.points){if(!numeric(point.pnl)){previous=null;continue;}if(previous)d+='L'+X(point.timestamp)+','+Y(previous.pnl)+'L'+X(point.timestamp)+','+Y(point.pnl);else d+='M'+X(point.timestamp)+','+Y(point.pnl);previous=point;}
  nodes.push(svgNode('path',{d,fill:'none',stroke:series.color,'stroke-width':series.key==='TOTAL'?3:1.7,'stroke-linejoin':'round','data-series':series.key}));
 }
 nodes.push(svgNode('line',{id:'intraday-cursor',x1:left,x2:left,y1:top,y2:bottom,stroke:'#cbd5e1','stroke-dasharray':'4 4','pointer-events':'none'}));
 const timeBadge=svgNode('g',{id:'intraday-cursor-label','pointer-events':'none'});timeBadge.append(svgNode('rect',{x:-28,y:0,width:56,height:23,rx:5,fill:'#223b30',stroke:'#83b99e'}),svgNode('text',{id:'intraday-cursor-time',x:0,y:16,'text-anchor':'middle',fill:'#f3f4f6','font-size':12,'font-weight':600}));nodes.push(timeBadge);
 $('intraday-plot').setAttribute('viewBox',`0 0 ${width} ${height}`);replaceIfChanged($('intraday-plot'),...nodes);
 inspectChart(inspectedTime===null?intradayData.until:inspectedTime);
}
async function loadIntraday(){
 if(source!=='recorded')return;
 const day=selectedDay;if(intradayBusy)return;
 intradayBusy=true;
 try{const response=await fetch(resultsURL('/api/intraday?'+new URLSearchParams({day})),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Intraday results temporarily unavailable. Retrying automatically.');const data=await response.json();if(day!==selectedDay||source!=='recorded')return;if(intradayData?.day!==day)inspectedTime=null;intradayData=data;preserveNavigation(renderIntraday);}
 catch(error){if(day===selectedDay&&source==='recorded')$('intraday-message').textContent=error.message+(intradayData?.day===day?' Last available chart retained.':'');}
 finally{intradayBusy=false;if(source==='recorded'&&day!==selectedDay)loadIntraday();}
}
$('intraday-toggle-all').addEventListener('click',()=>{const series=chartSeries(),allSelected=series.every(s=>!hiddenLines.has(s.key));for(const s of series){if(allSelected)hiddenLines.add(s.key);else hiddenLines.delete(s.key);}renderIntraday();});
$('intraday-plot').addEventListener('pointermove',event=>{if(!plotGeometry)return;const rect=$('intraday-plot').getBoundingClientRect(),x=(event.clientX-rect.left)*plotGeometry.width/rect.width;inspectChart(plotGeometry.start+(x-plotGeometry.left)/(plotGeometry.right-plotGeometry.left)*(plotGeometry.end-plotGeometry.start));});
$('intraday-plot').addEventListener('click',event=>{if(!plotGeometry)return;const rect=$('intraday-plot').getBoundingClientRect(),x=(event.clientX-rect.left)*plotGeometry.width/rect.width;inspectChart(plotGeometry.start+(x-plotGeometry.left)/(plotGeometry.right-plotGeometry.left)*(plotGeometry.end-plotGeometry.start));});
$('intraday-plot').addEventListener('keydown',event=>{if(!intradayData||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const t=inspectedTime??intradayData.until;inspectChart(event.key==='Home'?intradayData.start:event.key==='End'?intradayData.until:t+(event.key==='ArrowLeft'?-900:900));});
window.addEventListener('resize',()=>{intradaySignature='';renderIntraday();});

for(const asset of symbols){for(const id of ['asset-options','trade-asset']){const option=el('option',assetName(asset));option.value=asset;$(id).append(option);}}
$('data-source').addEventListener('change',()=>{source=$('data-source').value;tradeRequest++;tradesBusy=false;selectedDay=anchor=source==='example'?'2025-10-16':performanceData?.today||localToday();offset=0;view='month';render();loadTrades();loadIntraday();});
$('calendar-asset').addEventListener('change',()=>{assetFilter=$('calendar-asset').value;tradeAsset=includedAssets()[0];$('trade-asset').value=tradeAsset;offset=0;render();loadTrades();});
for(const kind of ['week','month']){$(kind+'-view').addEventListener('click',()=>{view=kind;anchor=selectedDay;render();});$('export-'+kind).addEventListener('click',()=>exportCSV(kind));}
$('period-prev').addEventListener('click',()=>navigate(-1));$('period-next').addEventListener('click',()=>navigate(1));$('today').addEventListener('click',()=>chooseDay(localToday()));$('signed-losses').addEventListener('change',render);
$('month-picker-open').addEventListener('click',()=>{$('month-input').value=anchor.slice(0,7);$('month-picker').showModal();$('month-input').focus();});
$('month-picker-cancel').addEventListener('click',()=>$('month-picker').close());$('month-picker-form').addEventListener('submit',event=>{event.preventDefault();anchor=$('month-input').value+'-01';view='month';$('month-picker').close();render();});
$('edit-example').addEventListener('click',()=>{if(source!=='example')return;const data=dayStats(selectedDay);$('edit-date').value=selectedDay;$('edit-pnl').value=data.pnl??0;$('edit-trades').value=data.trades||1;$('example-editor').showModal();});
$('editor-cancel').addEventListener('click',()=>$('example-editor').close());$('example-form').addEventListener('submit',event=>{event.preventDefault();if(source!=='example')return;const day=$('edit-date').value,pnl=Number($('edit-pnl').value),trades=Number($('edit-trades').value);if(!numeric(pnl)||!Number.isInteger(trades)||trades<1)return;exampleDays[day]={pnl,trades};$('example-editor').close();chooseDay(day);});
$('delete-example').addEventListener('click',()=>{if(source!=='example')return;delete exampleDays[$('edit-date').value];$('example-editor').close();render();});
$('trade-asset').addEventListener('change',()=>selectTradeAsset($('trade-asset').value));$('trade-basis').addEventListener('change',()=>{tradeBasis=$('trade-basis').value;offset=0;loadTrades();});
$('day-trades-prev').addEventListener('click',()=>{offset=Math.max(0,offset-25);loadTrades();});$('day-trades-next').addEventListener('click',()=>{offset+=25;loadTrades();});
render();refreshPerformance();setInterval(refreshPerformance,1000);
