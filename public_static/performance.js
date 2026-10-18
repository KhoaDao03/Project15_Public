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
const symbols=['BTC','ETH','SOL','XRP','BNB','HYPE','DOGE','GOLD','SILVER','WTI'];
const cryptoSymbols=symbols.slice(0,7),commoditySymbols=symbols.slice(7);
const assetName=a=>a==='WTI'?'OIL / WTI':a;
const coinPaths={
 DOGE:'M8 5h4a7 7 0 0 1 0 14H8V5Zm-3 7h9',
 BNB:'M12 2 6.5 7.5 8.6 9.6 12 6.2 15.4 9.6 17.5 7.5ZM2 12l3-3 3 3-3 3Zm10-3 3 3-3 3-3-3Zm7-0 3 3-3 3-3-3ZM6.5 16.5 12 22l5.5-5.5-2.1-2.1-3.4 3.4-3.4-3.4Z',
 HYPE:'M144 71.6991C144 119.306 114.866 134.582 99.5156 120.98C86.8804 109.889 83.1211 86.4521 64.116 84.0456C39.9942 81.0113 37.9057 113.133 22.0334 113.133C3.5504 113.133 0 86.2428 0 72.4315C0 58.3063 3.96809 39.0542 19.736 39.0542C38.1146 39.0542 39.1588 66.5722 62.132 65.1073C85.0007 63.5379 85.4184 34.8689 100.247 22.6271C113.195 12.0593 144 23.4641 144 71.6991Z',
 BTC:'M10 5v14M13 5v14M7 7h7a3 3 0 0 1 0 6H8m1 0h6a3 3 0 0 1 0 6H7',
 ETH:'M12 2 5 12l7 4 7-4-7-10Zm-7 13 7 7 7-7-7 4-7-4Z',
 SOL:'m6 5-3 3h15l3-3H6Zm-3 6 3 3h15l-3-3H3Zm3 6-3 3h15l3-3H6Z',
 XRP:'M3 3 9 9q3 3 6 0l6-6M3 21l6-6q3-3 6 0l6 6',
 GOLD:'m9 4-2 6h10l-2-6H9ZM4 13l-3 7h10l-2-7H4Zm11 0-2 7h10l-3-7h-5Z',
 SILVER:'m9 4-2 6h10l-2-6H9ZM4 13l-3 7h10l-2-7H4Zm11 0-2 7h10l-3-7h-5Z',
 WTI:'M12 2C10 8 5 10 5 15a7 7 0 0 0 14 0c0-5-5-7-7-13Z'
};
function coin(asset){
  if(!coinPaths[asset])return el('span',asset[0],'coin '+asset.toLowerCase());
  const node=el('span','','coin '+asset.toLowerCase()),svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),path=document.createElementNS('http://www.w3.org/2000/svg','path');
  svg.setAttribute('viewBox',asset==='HYPE'?'0 0 144 144':'0 0 24 24');svg.setAttribute('aria-hidden','true');path.setAttribute('d',coinPaths[asset]);
  const outline=['BTC','XRP','DOGE'].includes(asset);path.setAttribute('fill',outline?'none':'currentColor');path.setAttribute('stroke',outline?'currentColor':'none');path.setAttribute('stroke-width','1.7');svg.append(path);node.append(svg);return node;
}
const zone='America/New_York';
const money=v=>numeric(v)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v):'—';
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
function aggregate(assets){const values=includedAssets().map(a=>assets?.[a]);return {pnl:values.every(a=>numeric(a?.realized_pnl))?values.reduce((s,a)=>s+a.realized_pnl,0):null,trades:values.every(a=>numeric(a?.completed_trades))?values.reduce((s,a)=>s+a.completed_trades,0):null};}
function dayStats(day){
 if(source==='example')return exampleDays[day]||{pnl:0,trades:0};
 const record=performanceData?.days.find(d=>d.date===day);
 if(record)return aggregate(record.assets);
 return {pnl:null,trades:0};
}
function periodDates(kind=view){const start=kind==='week'?weekStart(anchor):monthStart(anchor),end=kind==='week'?shiftDay(start,7):shiftMonth(start,1),days=[];for(let d=start;d<end;d=shiftDay(d,1))days.push(d);return days;}
function metric(label,value,cls=''){const n=el('div','','pnl-stat');n.append(el('small',label),el('strong',value,cls));return n;}
function cellAmount(v){if(!numeric(v))return '—';const amount=$('signed-losses').checked?v:Math.abs(v);return new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:Math.abs(amount)>=1000?0:2,notation:Math.abs(amount)>=100000?'compact':'standard'}).format(amount);}
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
 for(const [label,assets] of [['Digital assets',cryptoSymbols],['Commodities',commoditySymbols]]){
  const group=assets.filter(a=>included.includes(a));if(!group.length)continue;
  const heading=el('tr','','group-row'),cell=el('td',label.toUpperCase());cell.colSpan=7;heading.append(cell);rows.push(heading);
  group.sort((a,b)=>(daily[b]?.realized_pnl??-Infinity)-(daily[a]?.realized_pnl??-Infinity));
  for(const asset of group){const stats=daily[asset]||{},row=el('tr','',asset===tradeAsset?'selected':''),market=el('td'),button=el('button','','market-button');button.type='button';button.setAttribute('aria-pressed',String(asset===tradeAsset));button.append(coin(asset),el('span',assetName(asset)));button.addEventListener('click',()=>selectTradeAsset(asset));market.append(button);
   const rank=numeric(stats.realized_pnl)?1+group.filter(a=>numeric(daily[a]?.realized_pnl)&&daily[a].realized_pnl>stats.realized_pnl).length:'—';row.append(el('td',rank),market);dailyCells(row,stats);row.addEventListener('click',event=>{if(!event.target.closest('button'))selectTradeAsset(asset);});rows.push(row);
  }
 }
 replaceIfChanged($('daily-market-rows'),...rows);
 const total={};for(const key of ['realized_pnl','completed_trades','wins','losses'])total[key]=included.every(a=>numeric(daily[a]?.[key]))?included.reduce((n,a)=>n+daily[a][key],0):null;
 total.win_rate=total.completed_trades>0&&numeric(total.wins)&&included.every(a=>daily[a]?.unknown_pnl===0)?total.wins/total.completed_trades:null;
 const row=el('tr'),label=el('td','TOTAL');label.colSpan=2;row.append(label);dailyCells(row,total);replaceIfChanged($('daily-market-totals'),row);
}
function render(){preserveNavigation(()=>{
 const demo=source==='example';$('example-notice').hidden=!demo;$('example-detail').hidden=!demo;$('recorded-trades').hidden=demo;$('calendar-asset').disabled=demo;$('edit-example').disabled=!demo;
 const all=performanceData?aggregate(performanceData.all_time):{pnl:null,trades:null};
 replaceIfChanged($('all-time-summary'),metric('Recorded realized P&L',signed(all.pnl),pnlClass(all.pnl)),metric('Completed trades',all.trades??'—'),metric('Scope',assetFilter==='all'?'All markets':$('calendar-asset').selectedOptions[0].text));
 renderDailyMarkets();$('day-trades-title').textContent=assetName(tradeAsset)+' · Trade records';replaceIfChanged($('day-trades-icon'),coin(tradeAsset));
 renderCalendar();const stats=dayStats(selectedDay);$('day-title').textContent=dateLabel(selectedDay);
 $('day-note').textContent=demo?'Example daily result':(selectedDay===performanceData?.today?'Today · In progress · ':'')+(stats.trades===0?'No recorded closed trades for this date.':'Realized results · '+$('calendar-asset').selectedOptions[0].text)+' · America/New_York';
 replaceIfChanged($('day-summary'),metric('Net P&L',signed(stats.pnl),pnlClass(stats.pnl)),metric('Closed trades',stats.trades??'—'));
});}
function chooseDay(day){selectedDay=day;anchor=day;offset=0;render();loadTrades();}
function navigate(direction){anchor=view==='month'?shiftMonth(anchor,direction):shiftDay(anchor,7*direction);render();}
function pagination(){$('day-trades-prev').disabled=offset===0||tradesBusy;$('day-trades-next').disabled=offset+25>=totalTrades||tradesBusy;$('day-trades-page').textContent=totalTrades?`${offset+1}–${Math.min(offset+25,totalTrades)} of ${totalTrades}`:'No records';}
async function loadTrades(background=false){
 if(source!=='recorded'||!performanceData||(background&&tradesBusy))return;
 const request=++tradeRequest,key=[selectedDay,tradeAsset,tradeBasis,offset].join(':');tradesBusy=true;
 if(key!==shownTradeKey){shownTradeKey=key;$('day-trades').replaceChildren();$('day-trades-message').textContent='Loading '+assetName(tradeAsset)+' trades…';}if(!background)pagination();
 try{
 const response=await fetch('/api/history/'+tradeAsset+'?'+new URLSearchParams({day:selectedDay,basis:tradeBasis,offset,limit:25}),{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Trade records are temporarily unavailable. Retrying automatically.');
 const data=await response.json();if(request!==tradeRequest||source!=='recorded')return;totalTrades=data.total;
 const rows=data.rows.map(trade=>{
 const row=el('tr'),market=el('td',trade.market,'market'),open=trade.status==='OPEN';market.append(el('small',timestamp(trade.opened??trade.timestamp)));row.append(market);
 for(const value of [open?'OPEN':'CLOSED',trade.market_result==='yes'?'YES':trade.market_result==='no'?'NO':'Pending / unknown',(trade.side||'—').toUpperCase()+' / '+(trade.bought??trade.quantity??'—'),money(trade.entry),open?'Pending':money(trade.exit),money(trade.fees)])row.append(el('td',value));
 if(!open&&trade.exit_timestamp)row.children[5].append(el('small',(trade.exit_type==='settlement'?'Settled: ':'Sold / exit: ')+timestamp(trade.exit_timestamp)));
 row.append(el('td',open?'Pending':signed(trade.net_pnl),open?'':pnlClass(trade.net_pnl)));return row;});
 preserveNavigation(()=>replaceIfChanged($('day-trades'),...rows));$('day-trades-message').textContent=(data.stale?'History updates delayed. ':'')+assetName(tradeAsset)+' · '+(data.total?data.total+' recorded trades': 'No trades '+tradeBasis+' on this day.');
 }catch(error){if(request===tradeRequest)$('day-trades-message').textContent=error.message;}
 finally{if(request===tradeRequest){tradesBusy=false;pagination();}}
}
async function refreshPerformance(){
 if(performanceBusy)return;performanceBusy=true;
 try{const response=await fetch('/api/performance',{cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok)throw Error('Performance history is temporarily unavailable. Retrying automatically.');const data=await response.json();performanceData=data;
 if(!initialized&&source==='recorded'){selectedDay=anchor=data.today;initialized=true;}
 $('connection').textContent=data.stale?'History delayed':'History connected';$('connection').className=data.stale?'stale':'';$('updated').textContent=timestamp(data.generated_at);
 $('performance-message').textContent=[data.stale?'History updates delayed; showing last available records.':'',data.missing_assets?.length?'Incomplete history: '+data.missing_assets.join(', ')+'. Affected totals are unavailable.':'',Object.values(data.all_time||{}).some(a=>a.unknown_pnl>0)?'Some completed trades have unknown P&L. Affected totals are unavailable.':'',data.excluded_undated_trades?data.excluded_undated_trades+' trades have no closure date and are excluded from the calendar.':''].filter(Boolean).join(' ');
 render();await loadTrades(true);
 }catch(error){$('performance-message').textContent=error.message+(performanceData?' Previously loaded results may be out of date.':'');$('connection').textContent='History unavailable';$('connection').className='stale';}
 finally{performanceBusy=false;}
}
function csvFor(kind){const rows=[['Date','Net P&L (USD)','Completed trades','Scope','Source']];for(const day of periodDates(kind)){const stats=dayStats(day);rows.push([day,numeric(stats.pnl)?stats.pnl:'',stats.trades??'',source==='example'?'Example':assetFilter,source]);}return rows.map(row=>row.map(v=>'"'+String(v).replaceAll('"','""')+'"').join(',')).join('\r\n');}
function exportCSV(kind){const blob=new Blob([csvFor(kind)],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),link=el('a');link.href=url;link.download=`project15-${source}-${kind}-${anchor}.csv`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
for(const asset of symbols){for(const id of ['asset-options','trade-asset']){const option=el('option',assetName(asset));option.value=asset;$(id).append(option);}}
$('data-source').addEventListener('change',()=>{source=$('data-source').value;tradeRequest++;tradesBusy=false;selectedDay=anchor=source==='example'?'2025-10-16':performanceData?.today||localToday();offset=0;view='month';render();loadTrades();});
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
