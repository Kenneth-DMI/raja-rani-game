// Raja Rani frontend - Netlify static + Render backend (Socket.IO)
// + offline Practice vs Bots (same classic rules)

const DEFAULT_SERVER = localStorage.getItem('rr_server') || 'https://raja-rani-server-8kjo.onrender.com';
let socket = null, serverUrl = DEFAULT_SERVER;

// Classic 9 non-thief roles (unchanged order) + extended court for 11-24 players.
// Fair rotation: non-royal roles max once per player per game; Raja/Rani/Minister max 3x.
const CLASSIC_ORDER = [
  { key:'raja', nameEn:'Raja', points:1000, emoji:'👑' },
  { key:'rani', nameEn:'Rani', points:800, emoji:'👸' },
  { key:'minister', nameEn:'Minister', points:700, emoji:'📜', guesser:true },
  { key:'commander', nameEn:'Commander', points:600, emoji:'🛡️' },
  { key:'soldier', nameEn:'Soldier', points:500, emoji:'💂' },
  { key:'guard', nameEn:'Guard', points:400, emoji:'🏰' },
  { key:'citizen', nameEn:'Citizen', points:300, emoji:'🧑‍🌾' },
  { key:'villager', nameEn:'Villager', points:200, emoji:'👳' },
  { key:'helper', nameEn:'Helper', points:100, emoji:'🙏' },
];
const EXTENDED_ROLES = [
  { key:'crownprince', nameEn:'Crown Prince', points:900, emoji:'🤴' },
  { key:'treasurer', nameEn:'Treasurer', points:850, emoji:'💎' },
  { key:'noble', nameEn:'Noble', points:750, emoji:'🎩' },
  { key:'advisor', nameEn:'Advisor', points:650, emoji:'🧙' },
  { key:'captain', nameEn:'Captain', points:550, emoji:'⚔️' },
  { key:'archer', nameEn:'Archer', points:450, emoji:'🏹' },
  { key:'merchant', nameEn:'Merchant', points:350, emoji:'💰' },
  { key:'blacksmith', nameEn:'Blacksmith', points:325, emoji:'🔨' },
  { key:'messenger', nameEn:'Messenger', points:250, emoji:'✉️' },
  { key:'drummer', nameEn:'Drummer', points:225, emoji:'🥁' },
  { key:'farmer', nameEn:'Farmer', points:150, emoji:'🌾' },
  { key:'cook', nameEn:'Cook', points:125, emoji:'🍳' },
  { key:'servant', nameEn:'Servant', points:50, emoji:'🧹' },
  { key:'wanderer', nameEn:'Wanderer', points:25, emoji:'🎒' },
];
const THIEF_ROLE = { key:'thief', nameEn:'Thief', points:0, emoji:'🥷', thief:true };
const POLICE_G = { key:'police', nameEn:'Police', points:500, emoji:'🚓', guesser:true };
const MAX_PLAYERS = 24;
const FULL_COURT = [...CLASSIC_ORDER, ...EXTENDED_ROLES, THIEF_ROLE];

function rolesFor(n){
  n=Math.max(4,Math.min(MAX_PLAYERS,n));
  if(n===4) return [CLASSIC_ORDER[0],CLASSIC_ORDER[1],POLICE_G,THIEF_ROLE];
  if(n<=10) return [...CLASSIC_ORDER.slice(0,n-1), THIEF_ROLE];
  return [...CLASSIC_ORDER, ...EXTENDED_ROLES.slice(0,n-10), THIEF_ROLE];
}

const $ = id => document.getElementById(id);
const S = { name:'', room:'', snap:null, myId:null, myRole:null, rajaId:null, guesserId:null, guesserKey:null, rajaCalled:false, bot:false, botState:null, timerInt:null, deadline:0 };

function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); window.scrollTo(0,0); }
function err(id,msg){ $(id).textContent = msg||''; }
function log(boxId, html){ const b=$(boxId); const d=document.createElement('div'); d.innerHTML=html; b.appendChild(d); b.scrollTop=b.scrollHeight; }
function esc(s){ return (s||'').replace(/[&<>']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;'}[c])); }

// ---------- server connect ----------
function connect(url){
  serverUrl = (url||'').trim().replace(/\/$/,'');
  if(!serverUrl) return;
  localStorage.setItem('rr_server', serverUrl);
  $('inServer').value = serverUrl;
  if(socket) socket.disconnect();
  try{
    socket = io(serverUrl, { transports:['websocket','polling'] });
  }catch(e){ setDot(false); return; }
  socket.on('connect', ()=> setDot(true));
  socket.on('disconnect', ()=> setDot(false));
  socket.on('connect_error', ()=> setDot(false));
  socket.on('roomUpdate', onRoomUpdate);
  socket.on('roundStarted', onRoundStarted);
  socket.on('rajaCalled', onRajaCalled);
  socket.on('roundResult', onRoundResult);
  socket.on('gameOver', onGameOver);
  socket.on('backToLobby', snap=>{ hideModals(); show('screen-lobby'); onRoomUpdate(snap); });
  socket.on('gameStarted', ()=>{ hideModals(); show('screen-game'); });
  socket.on('chat', m=>{ if(m.sys) { log('chatBox',`🤖 <i>${esc(m.text)}</i>`); log('logBox',`🤖 <i>${esc(m.text)}</i>`);} else { log('chatBox',`<b>${esc(m.name)}:</b> ${esc(m.text)}`); log('logBox',`<b>${esc(m.name)}:</b> ${esc(m.text)}`);} });
}
function setDot(on){ const d=$('connDot'); d.className='conn-dot '+(on?'online':'offline'); d.title=on?('Connected: '+serverUrl):('Offline: '+serverUrl); }

// ---------- home ----------
document.querySelectorAll('.tab').forEach(t=>t.onclick=()=>{
  document.querySelectorAll('.tab').forEach(x=>x.classList.remove('active')); t.classList.add('active');
  ['create','join','bot'].forEach(k=>$('tab-'+k).classList.add('hidden'));
  $('tab-'+t.dataset.tab).classList.remove('hidden');
});
function renderRolesPreview(){
  const n = Math.max(4,Math.min(MAX_PLAYERS,parseInt($('inMax').value)||6));
  $('rolesPreview').innerHTML = rolesFor(n).map(r=>`<div class="role-row ${r.guesser?'guesser':''}"><span>${r.emoji} ${r.nameEn}${r.guesser?' 🔍':''}</span><b>${r.points}</b></div>`).join('');
}
$('inMax').oninput = renderRolesPreview; renderRolesPreview();

$('btnCreate').onclick = ()=>{
  const name=$('inName').value.trim(); if(!name) return err('homeErr','Please enter your name 🙏');
  if(!socket||!socket.connected){ err('homeErr','Not connected to the server. Use the 🔌 Server button to set the Render URL (cold start takes 30-60s). Or play 🤖 Practice.'); return; }
  S.name=name;
  socket.emit('createRoom',{playerName:name,maxPlayers:parseInt($('inMax').value)||6,totalRounds:parseInt($('inRounds').value)||5},res=>{
    if(res.error) return err('homeErr',res.error);
    S.room=res.roomCode; S.myId=socket.id; show('screen-lobby'); onRoomUpdate(res.snapshot); err('homeErr','');
  });
};
$('btnJoin').onclick = ()=>{
  const name=$('inName').value.trim(), code=$('inCode').value.trim().toUpperCase();
  if(!name) return err('homeErr','Please enter your name 🙏'); if(!code) return err('homeErr','Please enter the room code 🔑');
  if(!socket||!socket.connected) return err('homeErr','Server is offline. Check the 🔌 Server URL.');
  S.name=name;
  socket.emit('joinRoom',{roomCode:code,playerName:name},res=>{
    if(res.error) return err('homeErr',res.error);
    S.room=res.roomCode; S.myId=socket.id; show('screen-lobby'); onRoomUpdate(res.snapshot); err('homeErr','');
  });
};

// ---------- lobby ----------
function onRoomUpdate(snap){
  if(!snap) return; S.snap=snap; S.room=snap.code;
  if($('screen-lobby').classList.contains('active')||$('screen-game').classList.contains('active')){
    $('lobbyCode').textContent=snap.code;
    $('lobbyMeta').textContent=`${snap.players.length}/${snap.maxPlayers} players • ${snap.totalRounds} rounds • status: ${snap.status}`;
    $('lobbyCount').textContent=snap.players.length;
    $('lobbyPlayers').innerHTML=snap.players.map(p=>`<li><span>${p.isHost?'👑 ':''}<b>${esc(p.name)}</b>${p.id===S.myId?' (you)':''} ${p.connected?'':'⚠️ off'}</span><span>🏆 ${p.score}</span></li>`).join('');
    // preview by maxPlayers
    $('lobbyRoles').innerHTML = rolesFor(snap.maxPlayers).map(r=>`<div class="role-row ${r.guesser?'guesser':''}"><span>${r.emoji} ${r.nameEn}${r.guesser?' 🔍 guesser':''}</span><b>${r.points}</b></div>`).join('');
    const amHost = snap.hostId===S.myId;
    $('btnStart').style.display = amHost?'block':'none';
    $('hostControls').querySelector('.hint').textContent = amHost?'You are the host — press Start with 4+ players.':'Waiting for the host to start…';
    renderTable();
  }
}
$('btnStart').onclick = ()=> socket.emit('startGame',{},res=>{ if(res&&res.error) err('lobbyErr',res.error); });
$('btnCopy').onclick = ()=>{ navigator.clipboard&&navigator.clipboard.writeText(S.room); $('btnCopy').textContent='✅ Copied!'; setTimeout(()=>$('btnCopy').textContent='📋 Copy',1500); };
$('btnShare').onclick = ()=>{ const link=location.origin+location.pathname+'?room='+S.room; (navigator.clipboard?navigator.clipboard.writeText(link):Promise.reject()).then(()=>$('btnShare').textContent='✅ Link copied!'); prompt('Send this link to friends:',link); };
function leaveAll(){ try{socket&&socket.emit('leaveRoom');}catch(e){} hideModals(); show('screen-home'); }
$('btnLeave1').onclick=leaveAll; $('btnLeave2').onclick=leaveAll;
$('chatSend').onclick=sendChat; $('logSend').onclick=sendChat;
function sendChat(){ const v=($('chatIn').value||$('logIn').value||'').trim(); if(!v) return; socket&&socket.emit('chat',{text:v}); $('chatIn').value=''; $('logIn').value=''; }
$('chatIn').onkeydown=e=>{if(e.key==='Enter')sendChat()}; $('logIn').onkeydown=e=>{if(e.key==='Enter')sendChat()};

// ---------- game ----------
function onRoundStarted(d){
  S.bot=false; hideModals(); show('screen-game');
  S.myRole=d.yourRole; S.rajaId=d.rajaId; S.guesserKey=d.guesserKey; S.guesserId=null; S.rajaCalled=false;
  $('roundLabel').textContent=`Round ${d.round}/${d.totalRounds}`;
  $('phaseLabel').innerHTML=`👑 Raja <b>${esc(d.rajaName)}</b> is revealed! Waiting for "Who is my Minister?"…`;
  $('logBox').innerHTML='';
  log('logBox',`🎬 <b>Round ${d.round}</b> started! <b>${esc(d.rajaName)}</b> is the Raja.`);
  // my slip - only you can see it (secret)
  $('myChit').className='chit revealed';
  $('myChit').innerHTML=`<div class="chit-info"><div class="emoji">${d.yourRole.emoji}</div><h2>${d.yourRole.nameEn}</h2><div><b>${d.yourRole.points} pts</b></div>${d.yourRole.guesser?'<div>🔍 You must catch the THIEF!</div>':''}${d.yourRole.key==='raja'?'<div>👑 You are the Raja — press the button!</div>':''}${d.yourRole.key==='thief'?'<div>🥷 Shhh… stay hidden!</div>':''}</div>`;
  $('myRoleLine').innerHTML = d.yourRole.key==='thief' ? `You are the <b>Thief</b> — fool the Minister 😎` : `You are the <b>${d.yourRole.nameEn}</b> (${d.yourRole.points} pts)`;
  const fair = d.fairness || { timesHad: 1, isNewRole: true, unseenLeft: 0 };
  $('myRoleLine').innerHTML += fair.isNewRole
    ? `<br>✨ <b>New role!</b>${fair.unseenLeft>0 ? ` ${fair.unseenLeft} more to try.` : ''}`
    : `<br>🔁 Seen ${fair.timesHad}× this game (fair rotation).`;
  const amRaja = S.myId===d.rajaId;
  $('btnRajaCall').textContent = d.guesserKey==='police' ? '📢 "Police, catch the thief!"' : '📢 "Who is my Minister?"';
  $('rajaAction').classList.toggle('hidden',!amRaja);
  $('guessAction').classList.add('hidden');
  $('waitLine').textContent = amRaja ? 'Press the button below 👇' : `Waiting for Raja ${d.rajaName} to call…`;
  stopTimer(); renderTable();
}
$('btnRajaCall').onclick=()=>{
  if(S.bot){ botCall(); return; }
  socket.emit('rajaCall',{},res=>{ if(res&&res.error) alert(res.error); });
};

function onRajaCalled(d){
  S.rajaCalled=true; S.guesserId=d.guesserId;
  const callText = d.guesserRole.key==='police' ? 'Police, catch the thief!' : `Who is my ${d.guesserRole.nameEn}?`;
  $('phaseLabel').innerHTML=`🔍 <b>${esc(d.guesserName)}</b> (${d.guesserRole.nameEn}) is hunting the thief…`;
  log('logBox',`📢 The Raja called: <b>"${callText}"</b> → <b>${esc(d.guesserName)}</b> stepped forward!`);
  const amGuesser = S.myId===d.guesserId;
  $('guesserTitle').textContent=d.guesserRole.nameEn;
  $('rajaAction').classList.add('hidden');
  $('guessAction').classList.toggle('hidden',!amGuesser);
  $('waitLine').textContent = amGuesser ? '' : `${d.guesserName} is guessing… (60 sec)`;
  if(amGuesser){
    const cands = S.snap.players.filter(p=>p.id!==S.rajaId&&p.id!==d.guesserId);
    $('suspectBtns').innerHTML='';
    cands.forEach(p=>{ const b=document.createElement('button'); b.textContent=`🎯 ${p.name} is the thief!`; b.onclick=()=>{ b.disabled=true; socket.emit('makeGuess',{suspectId:p.id},res=>{ if(res&&res.error){alert(res.error);b.disabled=false;} }); }; $('suspectBtns').appendChild(b); });
  }
  startTimer(60); renderTable();
}
function startTimer(sec){ stopTimer(); S.deadline=Date.now()+sec*1000; $('guessTimer').classList.remove('hidden'); const tick=()=>{ const left=Math.max(0,Math.ceil((S.deadline-Date.now())/1000)); $('guessTimer').textContent='⏳ '+left; if(left<=0) stopTimer(); }; tick(); S.timerInt=setInterval(tick,500); }
function stopTimer(){ if(S.timerInt) clearInterval(S.timerInt); S.timerInt=null; $('guessTimer').classList.add('hidden'); }

function renderTable(){
  if(!S.snap) return;
  const box=$('tablePlayers'); if(!box) return;
  box.innerHTML = S.snap.players.map(p=>{
    const isRaja=p.id===S.rajaId, isG=p.id===S.guesserId&&S.rajaCalled, me=p.id===S.myId;
    let roleTxt='❓ hidden';
    if(isRaja) roleTxt='👑 Raja (revealed)';
    else if(isG) roleTxt=`🔍 ${S.guesserKey==='police'?'Police':'Minister'} (revealed)`;
    return `<div class="pcard ${isRaja?'raja':''} ${isG?'guesser':''} ${me?'me':''}"><div class="av">${isRaja?'👑':isG?'🔍':'🙈'}</div><div class="nm">${esc(p.name)}${me?' (you)':''}</div><div class="rl">${roleTxt}</div><div>🏆 ${p.score}</div></div>`;
  }).join('');
  $('scoreBoard').innerHTML=[...S.snap.players].sort((a,b)=>b.score-a.score).map(p=>`<li><b>${esc(p.name)}</b> — ${p.score} pts ${p.id===S.myId?'(you)':''}</li>`).join('');
}

function onRoundResult(r){
  stopTimer();
  const guesserName=(r.reveal.find(x=>x.id===r.guesserId)||{}).name||'Minister';
  const thiefName=(r.reveal.find(x=>x.id===r.thiefId)||{}).name||'?';
  $('resTitle').textContent = r.correct?`✅ ${guesserName} caught the thief!`:`❌ ${guesserName} was fooled!`;
  $('resSub').textContent = r.correct?`The thief was ${thiefName} — Minister is safe, Thief gets 0.`:`The real thief was ${thiefName} — the Thief stole the Minister's points! 😱`;
  $('resGrid').innerHTML=r.reveal.map(x=>`<div class="reveal"><div class="e">${x.role.emoji}</div><b>${esc(x.name)}</b><div>${x.role.nameEn}</div><div>+${x.pointsThisRound} → total ${x.total}</div></div>`).join('');
  $('resScores').innerHTML=r.scoreboard.map((p,i)=>`<li>${i===0?'👑 ':''}<b>${esc(p.name)}</b> — ${p.score}</li>`).join('');
  $('btnNext').textContent = r.isLastRound ? '🏁 See Final Result' : '➡️ Next Round';
  $('resultModal').classList.remove('hidden');
  log('logBox', r.correct?`✅ <b>${esc(guesserName)}</b> was right! The thief was <b>${esc(thiefName)}</b>.`:`❌ Wrong guess! The real thief <b>${esc(thiefName)}</b> escaped!`);
}
$('btnNext').onclick=()=>{
  if(S.bot){ botNext(); return; }
  socket.emit('nextRound',{},res=>{ if(res&&res.error) alert(res.error); });
};
$('btnToLobby').onclick=()=>{
  if(S.bot){ $('resultModal').classList.add('hidden'); S.bot=false; show('screen-home'); wireOnlineButtons(); return; }
  socket.emit('restartGame',{},()=>{});
};
function onGameOver(d){
  $('resultModal').classList.add('hidden');
  $('winTitle').textContent=`🏆 ${d.winner.name} — Raja of Rajas! (${d.winner.score} pts)`;
  $('finalScores').innerHTML=d.scoreboard.map((p,i)=>`<li>${i===0?'🥇':i===1?'🥈':i===2?'🥉':'•'} <b>${esc(p.name)}</b> — ${p.score}</li>`).join('');
  $('finalModal').classList.remove('hidden');
}
$('btnAgain').onclick=()=> socket.emit('restartGame',{},()=>{});
$('btnHome').onclick=leaveAll;
function hideModals(){ ['resultModal','finalModal'].forEach(id=>$(id).classList.add('hidden')); }

// ---------- Practice vs Bots (offline, same rules, 4P) ----------
const BOT_NAMES=['Chintu','Pintu','Meena'];
$('btnBot').onclick=()=>{
  const name=$('inName').value.trim()||'You';
  S.name=name; S.bot=true; S.botState={ round:0, total:5, scores:{}, names:[name,...BOT_NAMES], hist:{} };
  S.botState.names.forEach(n=>S.botState.scores[n]=0);
  show('screen-game'); hideModals(); $('logBox').innerHTML='';
  botRound();
};
function botRound(){
  const st=S.botState; st.round++;
  const roles=rolesFor(4);
  // fair rotation (same rule as online): non-royals max once, Raja/Rani max 3x
  const cap=k=>(k==='raja'||k==='rani')?3:1;
  let best=null,bestViol=Infinity;
  for(let t=0;t<60;t++){
    const rem=roles.slice().sort(()=>Math.random()-.5);
    const order=st.names.slice().sort(()=>Math.random()-.5);
    const a={}; let viol=0;
    for(const nm of order){
      const seen=st.hist[nm]||{};
      let pool=rem.filter(r=>(seen[r.key]||0)<cap(r.key));
      if(!pool.length){ pool=rem.slice(); viol++; }
      const chosen=pool[Math.floor(Math.random()*pool.length)];
      a[nm]=chosen.key; rem.splice(rem.indexOf(chosen),1);
    }
    if(viol===0){ best=a; break; }
    if(viol<bestViol){ best=a; bestViol=viol; }
  }
  st.assign=best;
  for(const nm of st.names){ st.hist[nm]=st.hist[nm]||{}; st.hist[nm][best[nm]]=(st.hist[nm][best[nm]]||0)+1; }
  st.roles=roles;
  st.raja=st.names.find(n=>st.assign[n]==='raja');
  st.guesser=st.names.find(n=>st.assign[n]==='police');
  st.thief=st.names.find(n=>st.assign[n]==='thief');
  st.called=false; st.guessed=null;
  $('roundLabel').textContent=`Practice Round ${st.round}/${st.total} (bots)`;
  $('phaseLabel').innerHTML=`👑 Raja <b>${esc(st.raja)}</b>!`;
  const myRole=roles.find(r=>r.key===st.assign[S.name]);
  $('myChit').className='chit revealed';
  $('myChit').innerHTML=`<div class="chit-info"><div class="emoji">${myRole.emoji}</div><h2>${myRole.nameEn}</h2><div>${myRole.points} pts</div></div>`;
  $('myRoleLine').innerHTML=`You are the <b>${myRole.nameEn}</b>`;
  const botHad=(st.hist[S.name]||{})[st.assign[S.name]]||1;
  $('myRoleLine').innerHTML+= botHad<=1 ? `<br>✨ <b>New role!</b>` : `<br>🔁 Seen ${botHad}× this game (fair rotation).`;
  // fake snapshot for table
  S.snap={players:st.names.map(n=>({id:n,name:n,score:st.scores[n]}))};
  S.rajaId=st.raja; S.guesserId=null; S.rajaCalled=false; S.guesserKey='police'; S.myId=S.name;
  renderTable();
  log('logBox',`🎬 <b>Practice Round ${st.round}</b> — Raja is <b>${esc(st.raja)}</b>`);
  $('rajaAction').classList.toggle('hidden',st.raja!==S.name);
  $('guessAction').classList.add('hidden');
  $('waitLine').textContent = st.raja===S.name ? 'You are the Raja — press the button 👇' : `${st.raja} is thinking…`;
  if(st.raja!==S.name) setTimeout(()=>botCall(),1800);
}
function botCall(){
  const st=S.botState; if(!st||st.called) return; st.called=true;
  S.guesserId=st.guesser; S.rajaCalled=true;
  $('phaseLabel').innerHTML=`🔍 <b>${esc(st.guesser)}</b> (Police) is hunting the thief…`;
  log('logBox',`📢 "Police, catch the thief!" → <b>${esc(st.guesser)}</b>!`);
  $('rajaAction').classList.add('hidden');
  renderTable();
  if(st.guesser===S.name){
    $('guessAction').classList.remove('hidden'); $('guesserTitle').textContent='Police';
    $('waitLine').textContent='';
    $('suspectBtns').innerHTML='';
    st.names.filter(n=>n!==st.raja&&n!==st.guesser).forEach(n=>{ const b=document.createElement('button'); b.textContent=`🎯 ${n} is the thief!`; b.onclick=()=>botScore(n); $('suspectBtns').appendChild(b); });
  } else {
    $('guessAction').classList.add('hidden');
    $('waitLine').textContent=`${st.guesser} is guessing…`;
    setTimeout(()=>{
      // bots catch the thief 65% of the time
      const cands=st.names.filter(n=>n!==st.raja&&n!==st.guesser);
      const pick = Math.random()<0.65 ? st.thief : cands.find(c=>c!==st.thief);
      botScore(pick);
    },2200);
  }
}
function botScore(guessed){
  const st=S.botState; st.guessed=guessed;
  const correct = guessed===st.thief;
  const pts={}; st.names.forEach(n=>{ const k=st.assign[n]; if(k==='police') pts[n]=correct?500:0; else if(k==='thief') pts[n]=correct?0:500; else pts[n]=(st.roles.find(r=>r.key===k)||{points:0}).points; st.scores[n]+=pts[n]; });
  const reveal=st.names.map(n=>{ const k=st.assign[n]; const r=st.roles.find(x=>x.key===k); return {name:n,role:r,pts:pts[n],total:st.scores[n]}; });
  $('resTitle').textContent=correct?`✅ ${st.guesser} caught the thief!`:`❌ ${st.guesser} was wrong! The real thief was ${st.thief}`;
  $('resSub').textContent = correct?'Minister is safe, Thief gets 0.':'The Thief stole 500 points!';
  $('resGrid').innerHTML=reveal.map(x=>`<div class="reveal"><div class="e">${x.role.emoji}</div><b>${esc(x.name)}</b><div>${x.role.nameEn}</div><div>+${x.pts} → ${x.total}</div></div>`).join('');
  $('resScores').innerHTML=[...st.names].sort((a,b)=>st.scores[b]-st.scores[a]).map(n=>`<li><b>${esc(n)}</b> — ${st.scores[n]}</li>`).join('');
  $('btnNext').textContent = st.round>=st.total?'🏁 See Final':'➡️ Next Round';
  $('resultModal').classList.remove('hidden');
  S.snap={players:st.names.map(n=>({id:n,name:n,score:st.scores[n]}))}; renderTable();
}

function botNext(){
  const st=S.botState; if(!st) return;
  $('resultModal').classList.add('hidden');
  if(st.round>=st.total){
    const win=[...st.names].sort((a,b)=>st.scores[b]-st.scores[a])[0];
    $('winTitle').textContent=`🏆 ${win} wins! (${st.scores[win]} pts)`;
    $('finalScores').innerHTML=[...st.names].sort((a,b)=>st.scores[b]-st.scores[a]).map(n=>`<li><b>${esc(n)}</b> — ${st.scores[n]}</li>`).join('');
    $('finalModal').classList.remove('hidden');
  } else botRound();
}

function wireOnlineButtons(){
  $('btnNext').textContent='➡️ Next Round';
  $('btnAgain').onclick=()=>{ if(S.bot){ $('finalModal').classList.add('hidden'); S.botState={round:0,total:5,scores:{},names:S.botState.names,hist:{}}; S.botState.names.forEach(n=>S.botState.scores[n]=0); botRound(); } else socket.emit('restartGame',{},()=>{}); };
  $('btnHome').onclick=()=>{ if(S.bot){ location.reload(); } else leaveAll(); };
}

// ---------- modals / server ----------
$('btnServer').onclick=()=>$('serverModal').classList.remove('hidden');
$('btnCloseServer').onclick=()=>$('serverModal').classList.add('hidden');
$('btnSaveServer').onclick=()=>{ connect($('inServer').value); $('serverModal').classList.add('hidden'); };
$('btnHow').onclick=()=>$('howModal').classList.remove('hidden');
$('btnCloseHow').onclick=()=>$('howModal').classList.add('hidden');

// ---------- init ----------
(function init(){
  $('inServer').value=serverUrl;
  wireOnlineButtons();
  const q=new URLSearchParams(location.search);
  if(q.get('room')){ $('inCode').value=q.get('room').toUpperCase(); document.querySelector('[data-tab="join"]').click(); }
  if(q.get('server')){ connect(q.get('server')); } else connect(serverUrl);
})();
