/* LifeRPG PWA — core app */
// ---------- Utilities ----------
const $ = s=>document.querySelector(s);
const $$ = s=>Array.from(document.querySelectorAll(s));
const vibrate = ms=>{ try{ if(state.settings.haptics && navigator.vibrate) navigator.vibrate(ms||40);}catch{} };
const toast = (msg)=>{ const t=$("#toast"); t.textContent=msg; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1800); };
const uuid = ()=> (crypto && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

function todayGameDay(resetHour){
  const now = new Date();
  const shifted = new Date(now.getTime() - resetHour*60*60*1000);
  shifted.setHours(0,0,0,0);
  return shifted.toISOString().slice(0,10);
}
function dayDiff(a,b){ return Math.round((new Date(a)-new Date(b))/(1000*60*60*24)); }

// ---------- Default State ----------
const DEFAULT_STATE = {
  version:1,
  settings: { resetHour:4, rerollCost:20, haptics:true },
  profile: { coins:0, bestStreak:0, lastCompletionDay:null },
  streak: { current:0 },
  today: { day:null, points:0 },
  tasks: [
    {id:uuid(), name:'Pushups', points:10, coinsEarned:10, perDayCap:1, category:'Fitness', active:true},
    {id:uuid(), name:'15-min walk', points:10, coinsEarned:10, perDayCap:1, category:'Fitness', active:true},
    {id:uuid(), name:'45-min study', points:25, coinsEarned:25, perDayCap:1, category:'Engineering', active:true},
  ],
  challenges: [
    {id:uuid(), name:'No-snooze wake', points:20, coinsEarned:20, perDayCap:1, category:'Mindset', active:true},
    {id:uuid(), name:'Clean desk', points:15, coinsEarned:15, perDayCap:1, category:'Environment', active:true},
    {id:uuid(), name:'Read 20 pages', points:25, coinsEarned:25, perDayCap:1, category:'Mindset', active:true},
    {id:uuid(), name:'Cold shower', points:20, coinsEarned:20, perDayCap:1, category:'Health', active:true},
  ],
  shop: [
    {id:uuid(), name:'YouTube 30 min', cost:40, cooldownDays:0, active:true},
    {id:uuid(), name:'Dessert', cost:60, cooldownDays:0, active:true},
    {id:uuid(), name:'Gadget fund +$10', cost:150, cooldownDays:0, active:true},
  ],
  assigned: {},
  rerolls: {},
  progress: {},
  logs: []
};

let state = null;

// ---------- Persistence ----------
async function loadState(){
  state = await DB.getState();
  if(!state){ state = DEFAULT_STATE; state.today.day = todayGameDay(state.settings.resetHour); await DB.setState(state); }
  ensureDay();
  renderAll();
}
async function save(){ await DB.setState(state); }

// ---------- Day Rollover & Assignment ----------
function ensureDay(){
  const gd = todayGameDay(state.settings.resetHour);
  if(state.today.day !== gd){
    state.today.day = gd;
    state.today.points = 0;
    if(!state.assigned[gd]) assignDailyChallenges(gd);
  } else {
    if(!state.assigned[gd]) assignDailyChallenges(gd);
  }
}
function assignDailyChallenges(dayStr){
  const pool = state.challenges.filter(function(c){ return c.active; });
  const keys = Object.keys(state.assigned);
  const prev = keys.length ? keys.sort().slice(-1)[0] : null;
  const prevSet = new Set(prev ? state.assigned[prev] : []);
  var picks = [];
  const avoidPrev = pool.length>=6;
  const candidates = pool.slice();
  while(picks.length<3 && candidates.length){
    const idx = Math.floor(Math.random()*candidates.length);
    const c = candidates.splice(idx,1)[0];
    if(avoidPrev && prevSet.has(c.id)) continue;
    if(picks.indexOf(c.id)===-1) picks.push(c.id);
  }
  const rest = state.challenges.filter(function(c){ return c.active && picks.indexOf(c.id)===-1; });
  while(picks.length<3 && rest.length){
    const idx = Math.floor(Math.random()*rest.length);
    picks.push(rest.splice(idx,1)[0].id);
  }
  state.assigned[dayStr] = picks;
  if(typeof state.rerolls[dayStr] !== 'number') state.rerolls[dayStr] = 0;
}

// ---------- Currency / Streak / Logging ----------
function firstCompletionStreakBump(){
  const gd = state.today.day;
  if(state.profile.lastCompletionDay === gd) return;
  var newStreak = 1;
  if(state.profile.lastCompletionDay){
    const diff = dayDiff(gd, state.profile.lastCompletionDay);
    if(diff === 1) newStreak = state.streak.current + 1;
  }
  state.streak.current = newStreak;
  if(newStreak > state.profile.bestStreak) state.profile.bestStreak = newStreak;
  state.profile.lastCompletionDay = gd;
}

function addProgress(pointsDelta, coinsDelta, type, name, refId){
  const gd = state.today.day;
  state.today.points = Math.max(0, state.today.points + pointsDelta);
  state.profile.coins = Math.max(0, state.profile.coins + (coinsDelta || 0));
  const cur = state.progress[gd] || {points:0, completions:0, coinsEarned:0, coinsSpent:0};
  cur.points = Math.max(0, cur.points + pointsDelta);
  if(pointsDelta>0) cur.completions += 1;
  if(coinsDelta>0) cur.coinsEarned += coinsDelta;
  if(coinsDelta<0) cur.coinsSpent += -coinsDelta;
  state.progress[gd] = cur;
  state.logs.unshift({ ts:new Date().toISOString(), type, id:refId, name, points:(pointsDelta>0?pointsDelta:0), coins:(coinsDelta||0), day:gd });
  if(pointsDelta>0) firstCompletionStreakBump();
}

function canBuy(item){
  if(state.profile.coins < item.cost) return [false,'Not enough coins'];
  if(item.cooldownDays && item.lastBoughtDay){
    const diff = dayDiff(state.today.day, item.lastBoughtDay);
    if(diff >=0 && diff < item.cooldownDays) return [false,('Cooldown '+(item.cooldownDays-diff)+'d')];
  }
  return [true,''];
}

// ---------- Actions ----------
function completeTask(task){
  if(!task.active) return;
  const key = 'done:'+state.today.day+':'+task.id;
  const doneCount = (state._done && state._done[key]) || 0;
  const cap = Math.max(1, task.perDayCap || 1);
  if(doneCount>=cap){ toast('Cap reached for today'); return; }
  state._done = state._done || {};
  state._done[key] = doneCount+1;
  const coins = (typeof task.coinsEarned==='number') ? task.coinsEarned : task.points;
  addProgress(task.points, coins, 'task', task.name, task.id);
  vibrate(40);
  renderHome();
  save();
}

function undoTask(task){
  const key = 'done:'+state.today.day+':'+task.id;
  const doneCount = (state._done && state._done[key]) || 0;
  if(doneCount<=0){ toast('Nothing to undo today'); return; }
  state._done[key] = doneCount-1;
  const coins = (typeof task.coinsEarned==='number') ? task.coinsEarned : task.points;
  addProgress(-task.points, -coins, 'task', ('Undo '+task.name), task.id);
  vibrate(25);
  renderHome();
  save();
}

function completeChallenge(ch){
  if(!ch.active) return;
  const key = 'chal:'+state.today.day+':'+ch.id;
  if(state._done && state._done[key]){ toast('Done today'); return; }
  state._done = state._done || {};
  state._done[key] = 1;
  const coins = (typeof ch.coinsEarned==='number') ? ch.coinsEarned : ch.points;
  addProgress(ch.points, coins, 'challenge', ch.name, ch.id);
  vibrate(40);
  renderHome(); save();
}
function undoChallenge(ch){
  const key = 'chal:'+state.today.day+':'+ch.id;
  if(!(state._done && state._done[key])){ toast('Nothing to undo'); return; }
  state._done[key] = 0;
  const coins = (typeof ch.coinsEarned==='number') ? ch.coinsEarned : ch.points;
  addProgress(-ch.points, -coins, 'challenge', ('Undo '+ch.name), ch.id);
  vibrate(25);
  renderHome(); save();
}

function buyItem(item){
  const chk = canBuy(item);
  const ok = chk[0], why = chk[1];
  if(!ok){ toast(why); return; }
  state.profile.coins -= item.cost;
  item.lastBoughtDay = state.today.day;
  addProgress(0, -item.cost, 'purchase', item.name, item.id);
  vibrate(20);
  toast('Bought '+item.name+' (-'+item.cost+')');
  renderHome(); save();
}

function reroll(){
  const day = state.today.day;
  if((state.rerolls[day]||0)>=1){ toast('Reroll used'); return; }
  const cost = state.settings.rerollCost||0;
  if(state.profile.coins < cost){ toast('Not enough coins'); return; }
  state.profile.coins -= cost;
  state.rerolls[day] = (state.rerolls[day]||0)+1;
  assignDailyChallenges(day);
  addProgress(0, -cost, 'purchase', 'Reroll', 'reroll');
  vibrate(20);
  renderHome(); save();
}

// ---------- Renderers ----------
function setHeader(){
  $("#pillCoins").textContent = '🪙 '+state.profile.coins;
  $("#pillStreak").textContent = '🔥 '+state.streak.current;
  $("#pointsToday").textContent = state.today.points;
}

function renderHome(){
  ensureDay();
  setHeader();

  // Daily challenges
  const cont = $("#dailyChallenges"); cont.innerHTML='';
  const ids = state.assigned[state.today.day] || [];
  const poolMap = {};
  for(let i=0;i<state.challenges.length;i++){ poolMap[state.challenges[i].id]=state.challenges[i]; }
  for(let i=0;i<ids.length;i++){
    const id = ids[i];
    const ch = poolMap[id];
    if(!ch) continue;
    const doneKey = 'chal:'+state.today.day+':'+ch.id;
    const done = state._done && state._done[doneKey];
    const div = document.createElement('div'); div.className='item';
    const meta = document.createElement('div'); meta.className='meta';
    const coins = (typeof ch.coinsEarned==='number') ? ch.coinsEarned : ch.points;
    meta.innerHTML = '<div class="title">'+ch.name+'</div><div class="sub">+'+ch.points+' pts, +'+coins+' coins</div>';
    const btn = document.createElement('button'); btn.className='btn';
    btn.textContent = done ? 'Done ✓' : 'Do';
    btn.disabled = !!done || !ch.active;
    btn.onclick = function(){ if(!done && ch.active) completeChallenge(ch); };
    const undo = document.createElement('button'); undo.className='btn ghost'; undo.textContent='Undo';
    undo.onclick = function(){ undoChallenge(ch); };
    div.append(meta, btn, undo);
    cont.appendChild(div);
  }
  $("#rerollHint").textContent = 'Rerolls today: '+((state.rerolls[state.today.day]||0))+'/1 (Cost '+state.settings.rerollCost+')';

  // Tasks
  const tcont = $("#tasksList"); tcont.innerHTML='';
  for(let i=0;i<state.tasks.length;i++){
    const t = state.tasks[i]; if(!t.active) continue;
    const key = 'done:'+state.today.day+':'+t.id;
    const doneCount = (state._done && state._done[key]) || 0;
    const cap = Math.max(1, t.perDayCap||1);
    const div = document.createElement('div'); div.className='item';
    const meta = document.createElement('div'); meta.className='meta';
    const coins = (typeof t.coinsEarned==='number') ? t.coinsEarned : t.points;
    meta.innerHTML = '<div class="title">'+t.name+'</div><div class="sub">+'+t.points+' pts, +'+coins+' coins • '+doneCount+'/'+cap+' today</div>';
    const btn = document.createElement('button'); btn.className='btn';
    btn.textContent = doneCount>=cap ? 'Cap ✓' : 'Do';
    btn.disabled = doneCount>=cap;
    btn.onclick = (function(task){ return function(){ completeTask(task); }; })(t);
    const undo = document.createElement('button'); undo.className='btn ghost'; undo.textContent='Undo';
    undo.onclick = (function(task){ return function(){ undoTask(task); }; })(t);
    div.append(meta, btn, undo);
    tcont.appendChild(div);
  }

  // Shop
  const scont = $("#shopStrip"); scont.innerHTML='';
  for(let i=0;i<state.shop.length;i++){
    const s = state.shop[i]; if(!s.active) continue;
    const card = document.createElement('div'); card.className='card buy-card';
    const title = document.createElement('div'); title.className='title'; title.textContent = s.name;
    const kicker = document.createElement('div'); kicker.className='kicker'; kicker.textContent = (s.cooldownDays?('Cooldown: '+s.cooldownDays+'d'):'');
    const btn = document.createElement('button'); btn.className='btn'; btn.textContent='Buy ('+s.cost+')';
    const chk = canBuy(s); const ok = chk[0];
    btn.disabled = !ok;
    btn.onclick = (function(item){ return function(){ buyItem(item); }; })(s);
    card.append(title, kicker, btn);
    scont.appendChild(card);
  }
}

function renderStats(){
  $("#statCurrentStreak").textContent = state.streak.current;
  $("#statBestStreak").textContent = state.profile.bestStreak;

  // Heatmap last 90
  Charts.renderHeatmap($("#heatmap"), state.progress);

  // Last 30 data
  const today = new Date(state.today.day);
  const last30 = [];
  for(let i=29;i>=0;i--){
    const d = new Date(today); d.setDate(d.getDate()-i);
    const ds = d.toISOString().slice(0,10);
    const px = (state.progress[ds] && typeof state.progress[ds].points==='number') ? state.progress[ds].points : 0;
    last30.push({ day:ds, points:px });
  }
  Charts.renderBar30($("#bar30"), last30);

  // 7-day stats
  let pts=0, ce=0, cs=0;
  for(let i=6;i>=0;i--){
    const d = new Date(today); d.setDate(d.getDate()-i);
    const ds = d.toISOString().slice(0,10);
    const prog = state.progress[ds] || {points:0, coinsEarned:0, coinsSpent:0};
    pts += (prog.points||0);
    ce += (prog.coinsEarned||0);
    cs += (prog.coinsSpent||0);
  }
  $("#statAvg7").textContent = Math.round(pts/7);
  $("#statCoins7").textContent = ce+' / '+cs;
}

function manageList(container, arr, type){
  container.innerHTML='';
  for(let i=0;i<arr.length;i++){
    const item = arr[i];
    const row = document.createElement('div'); row.className='row';
    const name = document.createElement('div'); name.style.flex='1'; name.innerHTML = '<strong>'+item.name+'</strong> <span class="small">'+(item.active?'Active':'Archived')+'</span>';
    const info = document.createElement('div'); info.className='small';
    if(type!=='shop'){
      const coins = (typeof item.coinsEarned==='number') ? item.coinsEarned : item.points;
      info.textContent = '+'+item.points+' pts, +'+coins+' coins • cap '+Math.max(1,item.perDayCap||1);
    } else {
      info.textContent = 'Cost '+item.cost+(item.cooldownDays?(' • cooldown '+item.cooldownDays+'d'):'');
    }
    const edit = document.createElement('button'); edit.className='btn ghost'; edit.textContent='Edit';
    edit.onclick = (function(it,ty){ return function(){ editItem(it,ty); }; })(item,type);
    const toggle = document.createElement('button'); toggle.className='btn'; toggle.textContent=item.active?'Archive':'Activate';
    toggle.onclick = (function(it){ return function(){ it.active=!it.active; renderManage(); save(); }; })(item);
    row.append(name, info, edit, toggle);
    container.appendChild(row);
  }
  if(arr.length===0){
    const hint = document.createElement('div'); hint.className='hint'; hint.textContent='No items yet.';
    container.appendChild(hint);
  }
}

function renderManage(){
  manageList($("#manageTasks"), state.tasks, 'task');
  manageList($("#manageChallenges"), state.challenges, 'challenge');
  manageList($("#manageShop"), state.shop, 'shop');
}

function renderSettings(){
  $("#inpResetHour").value = state.settings.resetHour;
  $("#inpRerollCost").value = state.settings.rerollCost;
  $("#toggleHaptics").checked = !!state.settings.haptics;
}

// ---------- Manage: Add/Edit ----------
function promptInt(msg, def){ const v = prompt(msg, def!=null?String(def):''); if(v===null) return null; const n = parseInt(v,10); if(Number.isNaN(n) || n<0) return null; return n; }
function editItem(item, type){
  const newName = prompt('Name', item.name); if(newName===null) return;
  if(type==='shop'){
    const cost = promptInt('Cost (coins)', item.cost); if(cost===null) return;
    const cd = promptInt('Cooldown days (0 for none)', item.cooldownDays||0); if(cd===null) return;
    item.name=newName; item.cost=cost; item.cooldownDays=cd;
  } else {
    const pts = promptInt('Points', item.points); if(pts===null) return;
    const coins = promptInt('Coins (default = Points)', (typeof item.coinsEarned==='number'?item.coinsEarned:item.points)); if(coins===null) return;
    var cap = item.perDayCap||1; if(type==='task'){ const c=promptInt('Per-day cap', cap); if(c===null) return; cap=c; }
    item.name=newName; item.points=pts; item.coinsEarned=coins; item.perDayCap=cap;
  }
  renderManage(); save();
}
function addTask(){
  const name = prompt('Task name'); if(!name) return;
  const pts = promptInt('Points', 10); if(pts===null) return;
  const coins = promptInt('Coins (default=Points)', pts); if(coins===null) return;
  const cap = promptInt('Per-day cap', 1); if(cap===null) return;
  state.tasks.push({id:uuid(), name, points:pts, coinsEarned:coins, perDayCap:cap, category:'', active:true});
  renderManage(); save();
}
function addChallenge(){
  const name = prompt('Challenge name'); if(!name) return;
  const pts = promptInt('Points', 20); if(pts===null) return;
  const coins = promptInt('Coins (default=Points)', pts); if(coins===null) return;
  state.challenges.push({id:uuid(), name, points:pts, coinsEarned:coins, perDayCap:1, category:'', active:true});
  renderManage(); save();
}
function addShop(){
  const name = prompt('Reward name'); if(!name) return;
  const cost = promptInt('Cost (coins)', 40); if(cost===null) return;
  const cd = promptInt('Cooldown days (0 none)', 0); if(cd===null) return;
  state.shop.push({id:uuid(), name, cost, cooldownDays:cd, active:true});
  renderManage(); save();
}

// ---------- Wiring ----------
function renderAll(){
  setHeader();
  renderHome();
  renderStats();
  renderManage();
  renderSettings();
}

function setupNav(){
  const tabs = $$('.tab');
  for(let i=0;i<tabs.length;i++){
    const btn = tabs[i];
    btn.onclick = function(){
      for(let j=0;j<tabs.length;j++) tabs[j].classList.remove('active');
      btn.classList.add('active');
      const t = btn.getAttribute('data-tab');
      const views = $$('.tabview');
      for(let k=0;k<views.length;k++) views[k].classList.remove('active');
      $('#tab-'+t).classList.add('active');
      if(t==='stats') renderStats();
      if(t==='home') renderHome();
      if(t==='manage') renderManage();
      if(t==='settings') renderSettings();
    };
  }
  $('#pillStreak').onclick = function(){ $$('.tab')[1].click(); };
  $('#btnReroll').onclick = reroll;
  $('#addTaskBtn').onclick = addTask;
  $('#addChallengeBtn').onclick = addChallenge;
  $('#addShopBtn').onclick = addShop;
  $('#inpResetHour').onchange = function(e){ state.settings.resetHour = Math.min(23, Math.max(0, parseInt(e.target.value||'4',10))); ensureDay(); save(); renderAll(); };
  $('#inpRerollCost').onchange = function(e){ state.settings.rerollCost = Math.max(0, parseInt(e.target.value||'20',10)); save(); };
  $('#toggleHaptics').onchange = function(e){ state.settings.haptics = !!e.target.checked; save(); };
  $('#btnExport').onclick = async function(){
    const json = await DB.exportJSON();
    const blob = new Blob([json], {type:'application/json'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'liferpg-export-'+Date.now()+'.json'; a.click();
  };
  $('#btnImport').onclick = function(){ $('#fileImport').click(); };
  $('#fileImport').onchange = async function(e){
    const file = e.target.files[0]; if(!file) return;
    const text = await file.text();
    try{ await DB.importJSON(text); toast('Imported'); }catch(err){ toast((err && err.message) || 'Import failed'); return; }
    state = await DB.getState(); ensureDay(); renderAll();
  };
  $('#btnWipe').onclick = async function(){
    if(!confirm('This will ERASE all data. Continue?')) return;
    state = JSON.parse(JSON.stringify(DEFAULT_STATE));
    state.today.day = todayGameDay(state.settings.resetHour);
    await DB.setState(state); renderAll(); toast('Wiped');
  };
}

async function main(){
  if('serviceWorker' in navigator){ try{ await navigator.serviceWorker.register('./sw.js'); }catch{} }
  setupNav();
  await loadState();
}
main();
