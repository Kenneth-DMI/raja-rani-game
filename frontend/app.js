// Raja Rani frontend - Netlify static + Render backend (Socket.IO)
// + offline Practice vs Bots (same classic rules)

const DEFAULT_SERVER = localStorage.getItem('rr_server') || 'http://localhost:3001';
let socket = null, serverUrl = DEFAULT_SERVER;

const FULL_COURT = [
  { key:'raja', nameEn:'Raja', nameHi:'राजा', points:1000, emoji:'👑' },
  { key:'rani', nameEn:'Rani', nameHi:'रानी', points:800, emoji:'👸' },
  { key:'mantri', nameEn:'Mantri', nameHi:'मंत्री', points:700, emoji:'📜', guesser:true },
  { key:'senapati', nameEn:'Senapati', nameHi:'सेनापति', points:600, emoji:'🛡️' },
  { key:'sipahi', nameEn:'Sipahi', nameHi:'सिपाही', points:500, emoji:'💂' },
  { key:'kotwal', nameEn:'Kotwal', nameHi:'कोतवाल', points:400, emoji:'🏰' },
  { key:'praja', nameEn:'Praja', nameHi:'प्रजा', points:300, emoji:'🧑‍🌾' },
  { key:'villager', nameEn:'Villager', nameHi:'ग्रामीण', points:200, emoji:'👳' },
  { key:'sahayak', nameEn:'Sahayak', nameHi:'सहायक', points:100, emoji:'🙏' },
  { key:'chor', nameEn:'Chor', nameHi:'चोर', points:0, emoji:'🥷', chor:true },
];
const SIPAHI_G = { key:'sipahi', nameEn:'Sipahi (Police)', nameHi:'सिपाही', points:500, emoji:'💂', guesser:true };

function rolesFor(n){
  n=Math.max(4,Math.min(10,n));
  if(n===4) return [FULL_COURT[0],FULL_COURT[1],SIPAHI_G,FULL_COURT[9]];
  return [...FULL_COURT.slice(0,n-1), FULL_COURT[9]];
}

const $ = id => document.getElementById(id);
const S = { name:'', room:'', snap:null, myId:null, myRole:null, rajaId:null, guesserId:null, guesserKey:null, rajaCalled:false, bot:false, botState:null, timerInt:null, deadline:0 };

function show(id){ document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active')); $(id).classList.add('active'); window.scrollTo(0,0); }
function err(id,msg){ $(id).textContent = msg||''; }
function log(boxId, html){ const b=$(boxId); const d=document.createElement('div'); d.innerHTML=html; b.appendChild(d); b.scrollTop=b.scrollHeight; }
function esc(s){ return (s||'').replace(/[&<>']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;'}[c])); } // v1.0.1

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
  const n = Math.max(4,Math.min(10,parseInt($('inMax').value)||6));
  $('rolesPreview').innerHTML = rolesFor(n).map(r=>`<div class="role-row ${r.guesser?'guesser':''}"><span>${r.emoji} ${r.nameEn} <small>${r.nameHi}</small>${r.guesser?' 🔍':''}</span><b>${r.points}</b></div>`).join('');
}
$('inMax').oninput = renderRolesPreview; renderRolesPreview();

$('btnCreate').onclick = ()=>{
  const name=$('inName').value.trim(); if(!name) return err('homeErr','Pehle apna naam likho 🙏');
  if(!socket||!socket.connected){ err('homeErr','Server se connected nahi. 🔌 Server button se Render URL lagao (cold start 30-60s). Ya 🤖 Practice khelo.'); return; }
  S.name=name;
  socket.emit('createRoom',{playerName:name,maxPlayers:parseInt($('inMax').value)||6,totalRounds:parseInt($('inRounds').value)||5},res=>{
    if(res.error) return err('homeErr',res.error);
    S.room=res.roomCode; S.myId=socket.id; show('screen-lobby'); onRoomUpdate(res.snapshot); err('homeErr','');
  });
};
$('btnJoin').onclick = ()=>{
  const name=$('inName').value.trim(), code=$('inCode').value.trim().toUpperCase();
  if(!name) return err('homeErr','Naam likho 🙏'); if(!code) return err('homeErr','Room code likho 🔑');
  if(!socket||!socket.connected) return err('homeErr','Server offline. 🔌 Server URL check karo.');
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
    $('lobbyPlayers').innerHTML=snap.players.map(p=>`<li><span>${p.isHost?'👑 ':''}<b>${esc(p.name)}</b>${p.id===S.myId?' (tum)':''} ${p.connected?'':'⚠️ off'}</span><span>🏆 ${p.score}</span></li>`).join('');
    const expect = rolesFor(Math.max(snap.players.length,4)<=snap.maxPlayers? Math.max(snap.players.length,snap.maxPlayers===4?4:snap.maxPlayers) : snap.maxPlayers);
    // simpler: preview by maxPlayers
    $('lobbyRoles').innerHTML = rolesFor(snap.maxPlayers).map(r=>`<div class="role-row ${r.guesser?'guesser':''}"><span>${r.emoji} ${r.nameEn}${r.guesser?' 🔍 guesser':''}</span><b>${r.points}</b></div>`).join('');
    const amHost = snap.hostId===S.myId;
    $('btnStart').style.display = amHost?'block':'none';
    $('hostControls').querySelector('.hint').textContent = amHost?'Tum host ho — 4+ players par Start dabao.':'Host ke Start ka intezaar karo…';
    if(snap.status==='lobby' && !$('screen-lobby').classList.contains('active') && !$('resultModal')){}
    renderTable();
  }
}
$('btnStart').onclick = ()=> socket.emit('startGame',{},res=>{ if(res&&res.error) err('lobbyErr',res.error); });
$('btnCopy').onclick = ()=>{ navigator.clipboard&&navigator.clipboard.writeText(S.room); $('btnCopy').textContent='✅ Copied!'; setTimeout(()=>$('btnCopy').textContent='📋 Copy',1500); };
$('btnShare').onclick = ()=>{ const link=location.origin+location.pathname+'?room='+S.room; (navigator.clipboard?navigator.clipboard.writeText(link):Promise.reject()).then(()=>$('btnShare').textContent='✅ Link copied!'); prompt('Ye link doston ko bhejo:',link); };
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
  $('phaseLabel').innerHTML=`👑 Raja <b>${esc(d.rajaName)}</b> mil gaye! “Mera Mantri Kaun?” ka intezaar…`;
  $('chatBox'); $('logBox').innerHTML='';
  log('logBox',`🎬 <b>Round ${d.round}</b> shuru! Raja <b>${esc(d.rajaName)}</b> hain.`);
  // my chit - tum apni dekh sakte ho (secret)
  $('myChit').className='chit revealed';
  $('myChit').innerHTML=`<div class="chit-info"><div class="emoji">${d.yourRole.emoji}</div><h2>${d.yourRole.nameEn}</h2><div>${d.yourRole.nameHi} • <b>${d.yourRole.points} pts</b></div>${d.yourRole.guesser?'<div>🔍 Tumhe CHOR pakadna hai!</div>':''}${d.yourRole.key==='raja'?'<div>👑 Tum Raja ho — button dabao!</div>':''}${d.yourRole.key==='chor'?'<div>🥷 Shhh… chhup jao!</div>':''}</div>`;
  $('myRoleLine').innerHTML = d.yourRole.key==='chor' ? `Tum <b>Chor</b> ho — Mantri ko dhokha do 😎` : `Tum <b>${d.yourRole.nameEn}</b> ho (${d.yourRole.points} pts)`;
  const amRaja = S.myId===d.rajaId;
  $('rajaAction').classList.toggle('hidden',!amRaja);
  $('guessAction').classList.add('hidden');
  $('waitLine').textContent = amRaja ? 'Neeche button dabao 👇' : `Raja ${d.rajaName} ke call ka intezaar karo…`;
  stopTimer(); renderTable();
}
$('btnRajaCall').onclick=()=>{
  if(S.bot){ botCall(); return; }
  socket.emit('rajaCall',{},res=>{ if(res&&res.error) alert(res.error); });
};

function onRajaCalled(d){
  S.rajaCalled=true; S.guesserId=d.guesserId;
  $('phaseLabel').innerHTML=`🔍 <b>${esc(d.guesserName)}</b> (${d.guesserRole.nameEn}) chor dhoondh raha…`;
  log('logBox',`📢 Raja ne pukara: <b>“Mera ${d.guesserRole.nameEn} Kaun?”</b> → <b>${esc(d.guesserName)}</b> saamne aaya!`);
  const amGuesser = S.myId===d.guesserId;
  $('guesserTitle').textContent=d.guesserRole.nameEn;
  $('rajaAction').classList.add('hidden');
  $('guessAction').classList.toggle('hidden',!amGuesser);
  $('waitLine').textContent = amGuesser ? '' : `${d.guesserName} guess kar raha hai… (60 sec)`;
  if(amGuesser){
    const cands = S.snap.players.filter(p=>p.id!==S.rajaId&&p.id!==d.guesserId);
    $('suspectBtns').innerHTML='';
    cands.forEach(p=>{ const b=document.createElement('button'); b.textContent=`🎯 ${p.name} chor hai!`; b.onclick=()=>{ b.disabled=true; socket.emit('makeGuess',{suspectId:p.id},res=>{ if(res&&res.error){alert(res.error);b.disabled=false;} }); }; $('suspectBtns').appendChild(b); });
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
    else if(isG) roleTxt=`🔍 ${S.guesserKey==='sipahi'?'Sipahi':'Mantri'} (revealed)`;
    return `<div class="pcard ${isRaja?'raja':''} ${isG?'guesser':''} ${me?'me':''}"><div class="av">${isRaja?'👑':isG?'🔍':'🙈'}</div><div class="nm">${esc(p.name)}${me?' (tum)':''}</div><div class="rl">${roleTxt}</div><div>🏆 ${p.score}</div></div>`;
  }).join('');
  $('scoreBoard').innerHTML=[...S.snap.players].sort((a,b)=>b.score-a.score).map(p=>`<li><b>${esc(p.name)}</b> — ${p.score} pts ${p.id===S.myId?'(tum)':''}</li>`).join('');
}

function onRoundResult(r){
  stopTimer();
  const guesserName=(r.reveal.find(x=>x.id===r.guesserId)||{}).name||'Mantri';
  const chorName=(r.reveal.find(x=>x.id===r.chorId)||{}).name||'?';
  $('resTitle').textContent = r.correct?`✅ ${esc(guesserName)} ne Chor pakad liya!`:`❌ ${esc(guesserName)} dhokha kha gaya!`;
  $('resSub').textContent = r.correct?`Chor tha ${chorName} — Mantri safe, Chor 0.`:`Asli Chor ${chorName} tha — Chor ne Mantri ke points loot liye! 😱`;
  $('resGrid').innerHTML=r.reveal.map(x=>`<div class="reveal"><div class="e">${x.role.emoji}</div><b>${esc(x.name)}</b><div>${x.role.nameEn} (${x.role.nameHi})</div><div>+${x.pointsThisRound} → total ${x.total}</div></div>`).join('');
  $('resScores').innerHTML=r.scoreboard.map((p,i)=>`<li>${i===0?'👑 ':''}<b>${esc(p.name)}</b> — ${p.score}</li>`).join('');
  $('btnNext').textContent = r.isLastRound ? '🏁 Final Result Dekho' : '➡️ Agla Round';
  $('resultModal').classList.remove('hidden');
  log('logBox', r.correct?`✅ <b>${esc(guesserName)}</b> sahi! Chor <b>${esc(chorName)}</b>.`:`❌ Galat guess! Asli chor <b>${esc(chorName)}</b> bach nikla!`);
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
  const name=$('inName').value.trim()||'Tum';
  S.name=name; S.bot=true; S.botState={ round:0, total:5, scores:{}, names:[name,...BOT_NAMES] };
  S.botState.names.forEach(n=>S.botState.scores[n]=0);
  show('screen-game'); hideModals(); $('logBox').innerHTML='';
  botRound();
};
function botRound(){
  const st=S.botState; st.round++;
  const roles=rolesFor(4);
  const order=[...st.names].sort(()=>Math.random()-.5);
  st.assign={}; order.forEach((n,i)=>st.assign[n]=roles[i].key);
  st.roles=roles;
  st.raja=st.names.find(n=>st.assign[n]==='raja');
  st.guesser=st.names.find(n=>st.assign[n]==='sipahi');
  st.chor=st.names.find(n=>st.assign[n]==='chor');
  st.called=false; st.guessed=null;
  $('roundLabel').textContent=`Practice Round ${st.round}/${st.total} (bots)`;
  $('phaseLabel').innerHTML=`👑 Raja <b>${esc(st.raja)}</b>!`;
  const myRole=roles.find(r=>r.key===st.assign[S.name]);
  $('myChit').className='chit revealed';
  $('myChit').innerHTML=`<div class="chit-info"><div class="emoji">${myRole.emoji}</div><h2>${myRole.nameEn}</h2><div>${myRole.points} pts</div></div>`;
  $('myRoleLine').innerHTML=`Tum <b>${myRole.nameEn}</b> ho`;
  // fake snapshot for table
  S.snap={players:st.names.map(n=>({id:n,name:n,score:st.scores[n]}))};
  S.rajaId=st.raja; S.guesserId=null; S.rajaCalled=false; S.guesserKey='sipahi'; S.myId=S.name;
  renderTable();
  log('logBox',`🎬 <b>Practice Round ${st.round}</b> — Raja <b>${esc(st.raja)}</b>`);
  $('rajaAction').classList.toggle('hidden',st.raja!==S.name);
  $('guessAction').classList.add('hidden');
  $('waitLine').textContent = st.raja===S.name ? 'Tum Raja ho — button dabao 👇' : `${st.raja} soch raha hai…`;
  if(st.raja!==S.name) setTimeout(()=>botCall(),1800);
}
function botCall(){
  const st=S.botState; if(!st||st.called) return; st.called=true;
  S.guesserId=st.guesser; S.rajaCalled=true;
  $('phaseLabel').innerHTML=`🔍 <b>${esc(st.guesser)}</b> (Sipahi) chor dhoondh raha…`;
  log('logBox',`📢 “Mera Sipahi Kaun?” → <b>${esc(st.guesser)}</b>!`);
  $('rajaAction').classList.add('hidden');
  renderTable();
  if(st.guesser===S.name){
    $('guessAction').classList.remove('hidden'); $('guesserTitle').textContent='Sipahi';
    $('waitLine').textContent='';
    $('suspectBtns').innerHTML='';
    st.names.filter(n=>n!==st.raja&&n!==st.guesser).forEach(n=>{ const b=document.createElement('button'); b.textContent=`🎯 ${n} chor hai!`; b.onclick=()=>botScore(n); $('suspectBtns').appendChild(b); });
  } else {
    $('guessAction').classList.add('hidden');
    $('waitLine').textContent=`${st.guesser} guess kar raha hai…`;
    setTimeout(()=>{
      // bots 65% sahi pakadte hain
      const cands=st.names.filter(n=>n!==st.raja&&n!==st.guesser);
      const pick = Math.random()<0.65 ? st.chor : cands.find(c=>c!==st.chor);
      botScore(pick);
    },2200);
  }
}
function botScore(guessed){
  const st=S.botState; st.guessed=guessed;
  const correct = guessed===st.chor;
  const pts={}; st.names.forEach(n=>{ const k=st.assign[n]; if(k==='sipahi') pts[n]=correct?500:0; else if(k==='chor') pts[n]=correct?0:500; else pts[n]=(st.roles.find(r=>r.key===k)||{points:0}).points; st.scores[n]+=pts[n]; });
  const reveal=st.names.map(n=>{ const k=st.assign[n]; const r=st.roles.find(x=>x.key===k); return {name:n,role:r,pts:pts[n],total:st.scores[n]}; });
  $('resTitle').textContent=correct?`✅ ${st.guesser} ne chor pakda!`:`❌ ${st.guesser} galat! Asli chor ${st.chor}`;
  $('resSub').textContent = correct?'Mantri safe, Chor 0.':'Chor ne 500 loot liye!';
  $('resGrid').innerHTML=reveal.map(x=>`<div class="reveal"><div class="e">${x.role.emoji}</div><b>${esc(x.name)}</b><div>${x.role.nameEn}</div><div>+${x.pts} → ${x.total}</div></div>`).join('');
  $('resScores').innerHTML=[...st.names].sort((a,b)=>st.scores[b]-st.scores[a]).map(n=>`<li><b>${esc(n)}</b> — ${st.scores[n]}</li>`).join('');
  $('btnNext').textContent = st.round>=st.total?'🏁 Final Dekho':'➡️ Agla Round';
  $('resultModal').classList.remove('hidden');
  S.snap={players:st.names.map(n=>({id:n,name:n,score:st.scores[n]}))}; renderTable();
}

function botNext(){
  const st=S.botState; if(!st) return;
  $('resultModal').classList.add('hidden');
  if(st.round>=st.total){
    const win=[...st.names].sort((a,b)=>st.scores[b]-st.scores[a])[0];
    $('winTitle').textContent=`🏆 ${win} jeetta! (${st.scores[win]} pts)`;
    $('finalScores').innerHTML=[...st.names].sort((a,b)=>st.scores[b]-st.scores[a]).map(n=>`<li><b>${esc(n)}</b> — ${st.scores[n]}</li>`).join('');
    $('finalModal').classList.remove('hidden');
  } else botRound();
}

function wireOnlineButtons(){
  $('btnNext').textContent='➡️ Agla Round';
  $('btnAgain').onclick=()=>{ if(S.bot){ $('finalModal').classList.add('hidden'); S.botState={round:0,total:5,scores:{},names:S.botState.names}; S.botState.names.forEach(n=>S.botState.scores[n]=0); botRound(); } else socket.emit('restartGame',{},()=>{}); };
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
