const $=id=>document.getElementById(id);let busy=false,timer,marketState=null;
const channels=['1570490132614619258','1571977187119333396'];
const fmt=t=>{if(!t)return 'Time unavailable';const d=new Date(typeof t==='number'?t*1000:t);return isNaN(d)?'Time unavailable':new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',second:'2-digit',timeZoneName:'short'}).format(d)};
function node(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n}
function link(text,url){const a=node('a',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a}
function card(m,base){const c=node('article',undefined,'message'),h=node('header');h.append(node('span',(m.display_author||m.author||'Author unavailable')+(m.author_inferred?' · inferred':''),'author'),node('time',fmt(m.source_timestamp),'date'));c.append(h,node('div',m.text||'(No text captured)','text'));const links=node('div',undefined,'links');if(/^\d+$/.test(m.message_id))links.append(link('View in Discord ↗',base+'/'+m.message_id));for(const [i,url]of(m.attachment_urls||[]).entries()){try{const u=new URL(url);if(u.protocol==='https:'&&['cdn.discordapp.com','media.discordapp.net'].includes(u.hostname))links.append(link('Attachment '+(i+1)+' ↗',u.href))}catch{}}c.append(links);const d=node('details'),obs=m.observations||[];d.append(node('summary','Capture history · '+obs.length+' recorded state'+(obs.length===1?'':'s')));for(const o of obs){const r=node('div',undefined,'revision');r.append(node('span',(o.kind==='first_observed'?'First observed':'Revision observed')+' · '+fmt(o.recorded_at)),node('p',o.body.text||'(No text captured)'));d.append(r)}if(m.older_revisions_omitted)d.append(node('p','Showing the latest 20 states.'));c.append(d);
const body=node('div',undefined,'message-body');while(c.firstChild)body.append(c.firstChild);
const signal=node('aside',undefined,'trade-signal'),value=m.trade_signal||{};
signal.append(node('span','Trade signal','signal-heading'),node('strong',value.action==='SET_TAKE_PROFIT'?'Update cash limit':value.action==='SET_ENTRY_PRICE'?'Update entry limit':value.action==='CLOSE_ALL'?'Close all':value.action==='HOLD'?'No additional entry':value.direction?(value.action==='ADD'?'Add ':'Enter ')+value.direction:'No signal',value.action==='CLOSE_ALL'?'signal-cash':value.direction==='UP'?'signal-up':value.direction==='DOWN'?'signal-down':'signal-none'));
if(value.direction&&!['SET_ENTRY_PRICE','SET_TAKE_PROFIT'].includes(value.action)){signal.append(node('span',(value.action==='ADD'?'+$':'$')+value.amount_usd,'signal-amount'));if(value.target_total_usd)signal.append(node('span','Planned total: $'+value.target_total_usd,'signal-plan'));signal.append(node('span','On each confirmed buy fill: request a '+(value.take_profit_plan?.limit_price_cents||85)+'¢ limit sell','signal-plan'),node('small','Confirmed fills appear in Orders & trades'))}if(value.action==='CLOSE_ALL')signal.append(node('span',value.reported_cashout?'Reported BTC cashout · reset plan · exit unverified':'Explicit cashout command · exit everything','signal-plan'));
if(value.action==='SET_TAKE_PROFIT')signal.append(node('span','Sell limit: '+value.limit_sell_cents+'¢ · maximum 85¢','signal-plan'));
if(value.cash_exit_plan)signal.append(node('span','Cash plan: block buys · cancel pending orders · 1¢ IOC reduce-only sell · reconcile remaining fills','signal-plan'));if(value.buy_order_type)signal.append(node('span',value.buy_order_type==='market'?'Planned market buy':value.limit_buy_cents?'Planned limit buy: '+value.limit_buy_cents+'¢':'Limit top-up: awaiting confirmed fill price or ENTRY percentage','signal-plan'));if(!value.action&&value.reason)signal.append(node('small',value.reason));if(value.interval_end&&value.action)signal.append(node('small',value.interval_ended?'Interval ended · plan reset · exit unverified':'Market ends '+fmt(value.interval_end)));signal.append(node('small',m.trade_execution?'Execution: '+m.trade_execution.status+(m.trade_execution.reason?' · '+m.trade_execution.reason:''):'Display-only history · no execution record'));c.append(body,signal);return c}

const initial=new URLSearchParams(location.search).get('channel');
if(channels.includes(initial))$('channel-select').value=initial;
function renderChannels(data){
 const selected=$('channel-select').value;
 for(const summary of data.channel_summaries||[]){
  let b=document.getElementById('pick-'+summary.id);
  const name=summary.id===channels[0]?'Original channel':'New channel';
  if(!b){b=node('button');b.id='pick-'+summary.id;b.type='button';b.append(node('strong',name),node('span',summary.id,'channel-id'),node('span','','channel-state'));b.onclick=()=>{$('channel-select').value=summary.id;$('channel-select').onchange()};$('channel-cards').append(b)}
  b.setAttribute('aria-pressed',String(summary.id===selected));
  b.querySelector('.channel-state').textContent=summary.count+' messages · '+(summary.fresh?(summary.status||'Unknown').replaceAll('_',' '):'Status stale');
 }
 $('archive-title').textContent=(selected===channels[0]?'Original':'New')+' channel messages';
}
async function load(){
 if(busy)return;busy=true;const selected=$('channel-select').value,search=$('search').value;
 try{
  const response=await fetch('/api/discord/messages?'+new URLSearchParams({channel:selected,q:search}));
  if(response.status===401){location.replace('/discord');return}
  if(!response.ok)throw Error('Archive temporarily unavailable. Retrying automatically.');
  const data=await response.json();
  if(selected!==$('channel-select').value||search!==$('search').value)return;
  renderExecution(data.execution,selected);renderBTC(data.btc_market);renderChannels(data);marketState=data.market_timer||null;updateTimer();
  for(const [id,key]of [['total','total'],['revisions','revisions'],['unknown','unknown_authors']])$(id).textContent=data[key];
  $('channel').href=data.channel_url;
  const healthy=data.health.fresh&&data.health.status==='observing';
  $('status').textContent=healthy?'● Recorder observing':data.health.fresh?'● '+(data.health.status||'Unknown'):'● Recorder status stale';
  $('status').className='badge'+(healthy?' ok':'');
  const list=$('messages'),signature=selected+JSON.stringify(data.messages);
  if(list.dataset.signature!==signature){
   const opened=new Set([...list.querySelectorAll('.message')].filter(x=>x.querySelector('details').open).map(x=>x.dataset.id));
   list.replaceChildren();
   for(const m of data.messages.slice(0,data.display_limit||(selected===channels[0]?100:50))){const c=card(m,data.channel_url);c.dataset.id=m.message_id;c.querySelector('details').open=opened.has(m.message_id);list.append(c)}
   if(!data.messages.length)list.append(node('div','No captured messages match this view.','empty'));
   list.dataset.signature=signature;
  }
  $('updated').textContent='Auto-refresh: 0.5s · Updated '+fmt(data.updated_at);$('error').hidden=!data.stale;if(data.stale)$('error').textContent='Updates delayed. Showing the last received snapshot.';
 }catch(e){renderBTC(null);$('status').textContent='● Updates unavailable';document.querySelector('.trade-activity header .badge').textContent='Execution status stale';$('error').textContent=e.message;$('error').hidden=false}finally{busy=false}
}
$('channel-select').onchange=()=>{$('messages').replaceChildren();delete $('messages').dataset.signature;history.replaceState(null,'','?channel='+$('channel-select').value);load()};
$('search').addEventListener('input',()=>{clearTimeout(timer);timer=setTimeout(load,200)});$('refresh').onclick=load;setInterval(()=>{if(!document.hidden)load()},500);load();

function updateTimer(){
 const now=Date.now()/1000,end=(Math.floor(now/900)+1)*900,seconds=Math.max(0,Math.ceil(end-now));
 const current=marketState&&marketState.interval_end===end;
 $('market-timer').textContent='Next market reset: '+Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0')+' · Current plan: '+(current&&marketState.planned_direction?marketState.planned_direction+' $'+marketState.planned_total_usd:'$0.00')+' · Signal plan, not actual position';
}
setInterval(updateTimer,500);updateTimer();

function renderBTC(m){
 m=m||{status:'unavailable'};
 $('btc-ticker').textContent=m.ticker||'No current BTC market available';
 $('btc-status').textContent=m.status==='live'?'● Live quotes':m.status==='stale'?'● Stale — prices hidden':'● Feed unavailable';
 $('btc-status').className='badge'+(m.status==='live'?' ok':'');
 const q=m.quotes||{},price=x=>typeof x==='number'?x+'¢':'—';
 $('btc-yes').textContent='Bid '+price(q.yes_bid)+' / Ask '+price(q.yes_ask);
 $('btc-no').textContent='Bid '+price(q.no_bid)+' / Ask '+price(q.no_ask);
 $('btc-meta').textContent=m.close_time?'Closes '+fmt(m.close_time)+' · Snapshot '+fmt(m.published_at):'Reuses the existing Project15 collector feed';
}

const tradeTabs=[$('pending-tab'),$('recent-tab')];
function selectTradeTab(index){
 tradeTabs.forEach((tab,i)=>{tab.setAttribute('aria-selected',String(i===index));tab.tabIndex=i===index?0:-1;$(tab.getAttribute('aria-controls')).hidden=i!==index});
}
tradeTabs.forEach((tab,i)=>{
 tab.onclick=()=>selectTradeTab(i);
 tab.onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const next=e.key==='Home'?0:e.key==='End'?1:1-i;selectTradeTab(next);tradeTabs[next].focus()}};
});

function renderExecution(e,channel){
 renderPnl(e);
 const box=document.querySelector('.trade-activity'),badge=box.querySelector('header .badge');
 const live=e&&e.connected,enabled=!!(e&&(e.channels||[channels[0]]).includes(channel));
 badge.textContent=enabled?(live?(['live_original_only','live_channels'].includes(e.status)?'Live · '+(channel===channels[0]?'original':'new')+' channel':'Waiting for flat BTC'):'Execution unavailable'):'Display only';
 box.querySelector('.trade-note').textContent='Discord-channel orders only. Buys capped at 89¢. First accepted entry owns each interval; other-channel calls are ignored. Retained history never trades.';
 box.querySelector('.trade-footnote').textContent=(live?'Shared Project15 gateway connected':'Gateway status unavailable or stale')+(e&&e.error?' · '+e.error:'')+' · Times shown in New York';
 const orders=(e&&e.orders||[]).filter(o=>(o.channel||channels[0])===channel);
 const pending=orders.filter(o=>!['executed','canceled','rejected'].includes(o.status));
 const body=document.querySelector('#pending-panel tbody');body.replaceChildren();
 if(!pending.length){const tr=node('tr'),td=node('td','No pending Discord orders','trade-empty');td.colSpan=7;tr.append(td);body.append(tr)}
 for(const o of pending){const tr=node('tr');for(const value of [fmt(o.submitted_at||o.created_at),(o.channel===channels[1]?'New':'Original')+' / '+o.signal_id,o.ticker,o.action+' / '+o.side,o.limit_cents+'¢',o.filled+' / '+o.count,o.status])tr.append(node('td',String(value)));body.append(tr)}
 renderMarketPnl(e&&e.pnl);

}

function pnlClass(value){return value===null||value===undefined||!Number.isFinite(Number(value))?'pnl-unknown':Number(value)>0?'pnl-positive':Number(value)<0?'pnl-negative':'pnl-neutral'}
function renderMarketPnl(p){
 const body=document.querySelector('#recent-panel tbody'),rows=p&&p.markets||[];
 const signature=JSON.stringify(rows);
 if(body.dataset.signature===signature)return;
 body.dataset.signature=signature;body.replaceChildren();
 for(const market of rows){
  const tr=node('tr');tr.append(node('td',market.ticker,'market-ticker'),node('td',market.direction||'—'));
  tr.append(node('td',market.contracts_bought??'—'));
  tr.append(node('td',money(market.entry_cost)));
  tr.append(node('td',market.average_entry===null||market.average_entry===undefined?'—':(Number(market.average_entry)*100).toFixed(2)+'¢'));
  tr.append(node('td',money(market.realized_net),'market-pnl '+pnlClass(market.realized_net)));
  tr.append(node('td',market.open_contracts??'—'));
  const status=node('td');status.append(node('span',({open:'Open · realized so far',settlement_pending:'Awaiting settlement',settled:'Settled',closed:'Closed',accounting_pending:'Accounting pending'})[market.status]||'Unknown','market-status'));
  tr.append(status);body.append(tr);
 }
 if(!rows.length){const tr=node('tr'),td=node('td',p&&!p.markets?'Waiting for grouped market accounting':'No reconciled Discord markets','trade-empty');td.colSpan=8;tr.append(td);body.append(tr)}
}

function money(x){return x===undefined||x===null?'—':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(Number(x))}
function renderPnl(e){
 const p=e&&e.pnl,g=e&&e.daily_loss_guard,now=Date.now()/1000;
 const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const current=p&&p.day===day,fresh=current&&now-p.updated_at>=0&&now-p.updated_at<30;
 $('pnl-today').textContent=current?money(p.daily_realized_net):'—';
 $('pnl-all').textContent=p?money(p.all_time_realized_net):'—';
 $('pnl-today').className=pnlClass(current?p.daily_realized_net:null);$('pnl-all').className=pnlClass(p?p.all_time_realized_net:null);
 const currentGuard=g&&g.day===day;
 $('pnl-guard').textContent=currentGuard&&g.enabled!==false&&g.latched?'Latched · 1 contract':!fresh||!currentGuard||!g.accounting_ready?'Accounting pending · 1 contract':g.enabled===false?'Loss latch disabled':'Armed at −$50';
 $('pnl-status').textContent='Both Discord channels combined · Fees included · Resets at midnight New York · '+(fresh&&p.complete?'Accounting reconciled':'Accounting incomplete or stale; displayed totals may be partial')+(currentGuard&&g.enabled!==false&&g.latched?' · New buys capped until '+fmt(g.reset_at):'')+'. Existing positions and exits are unchanged.'+(e&&e.interval_owner?' Interval owner: '+(e.interval_owner===channels[0]?'original channel':'new channel')+'.':' No channel owns the current interval yet.');

}

document.getElementById("logout").onclick=async()=>{await fetch("/api/discord/logout",{method:"POST"});location.replace("/discord")};
