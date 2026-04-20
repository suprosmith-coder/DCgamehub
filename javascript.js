
'use strict';
// ═══════════════════════════════════════════════════════════════
// CONFIG
// ═══════════════════════════════════════════════════════════════
const CFG = {
  SUPABASE_URL:      'https://hfxagwcwaalrmaqzhyfj.supabase.co',
  SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhmeGFnd2N3YWFscm1hcXpoeWZqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ2MzY5NzIsImV4cCI6MjA5MDIxMjk3Mn0.LMFfFRmqW34PT70zAOTj4zsUWmrDl_P4MXL0wZBkxYc',
  DISCORD_CLIENT_ID: '1487252546060947476',
  CARD_PATH: 'https://suprosmith-coder.github.io/DCgamehub/cards/',
  GROQ_API_KEY: '',   // 🔑 Paste your Groq API key here
  TURN_SECONDS: 25,
  AI_THINK_MIN: 900,
  AI_THINK_MAX: 2800,
};

// ═══════════════════════════════════════════════════════════════
// GLOBALS
// ═══════════════════════════════════════════════════════════════
let SB = null, CH = null, META_CH = null, discordSdk = null;
let MY_ID = 'player_' + Math.random().toString(36).slice(2,9);
let MY_NAME = '';
let roomCode = '';
let isHost = false;
let isAiMode = false;
let isSpectator = false;
let gameType = 'uno';
let G = null;
let lobbyPlayers = {};
let selectedIndices = []; // multi-stack selection
let _turnTimerInterval = null;
let _turnTimerRemaining = 0;
let _aiThinkTimeout = null;
let chatOpen = false;
let chatUnreadCount = 0;
let houseRules = { stack2: false, seven: false, zero: false, multistack: true };
let _gameStartTime = null;

const TURN_SECONDS = CFG.TURN_SECONDS;
const RING_CIRC = 50.26;
const AI_ID_PREFIX = 'ai_player_';
const AI_NAMES = ['Blaze','Nova','Chip','Orion','Pixel','Echo'];
// AI Personalities: affects card selection bias and chat taunts
const AI_PERSONALITIES = {
  Blaze:  { style:'aggressive', taunts:["🔥 I'm literally unstoppable","Watch and learn, human 😤","Too easy lol"], unoTaunt:"UNO! Get rekt 💀" },
  Nova:   { style:'smart',      taunts:["Hmm, interesting move...","Calculated. ♟️","I see what you're doing."], unoTaunt:"UNO. I've been planning this." },
  Chip:   { style:'troll',      taunts:["Oops 🙃","Did you mean to do that?","Skill issue 😇"], unoTaunt:"UNO LMAOOO" },
  Orion:  { style:'aggressive', taunts:["You can't beat me!","I've already won 😎","Incoming +4 🎯"], unoTaunt:"ORION WINS. UNO!" },
  Pixel:  { style:'troll',      taunts:["Beep boop 🤖","404: your win not found","Random.exe has entered the chat"], unoTaunt:"UNO! Did not expect that, did you?" },
  Echo:   { style:'smart',      taunts:["Interesting…","Pattern detected.","Adapting strategy…"], unoTaunt:"UNO. Efficient." },
};
const AI_COLORS = ['#818cf8','#f43f5e','#22c55e','#f59e0b','#06b6d4','#8b5cf6'];
const CARD_COLORS = ['red','blue','green','yellow'];
const COLOR_DOT = { red:'#e8302c', blue:'#1a73e8', green:'#2db552', yellow:'#f9c023', black:'#555' };
const VALUE_LABEL = {
  skip:'Skip', reverse:'Reverse', draw2:'+2', wild:'Wild', wild4:'+4', command:'CMD',
  '0':'0','1':'1','2':'2','3':'3','4':'4','5':'5','6':'6','7':'7','8':'8','9':'9'
};

// ═══════════════════════════════════════════════════════════════
// WEB AUDIO — SOUND EFFECTS
// ═══════════════════════════════════════════════════════════════
let audioCtx = null;
function getAudioCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
function playSound(type) {
  try {
    const ctx = getAudioCtx();
    if (ctx.state === 'suspended') ctx.resume();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    const now = ctx.currentTime;
    const sounds = {
      play:    () => {
        // Card snap — dual tone thwack
        o.type='square'; o.frequency.setValueAtTime(800,now); o.frequency.exponentialRampToValueAtTime(200,now+.06);
        g.gain.setValueAtTime(.18,now); g.gain.exponentialRampToValueAtTime(.001,now+.1); o.start(now); o.stop(now+.1);
        const o3=ctx.createOscillator(); const g3=ctx.createGain();
        o3.connect(g3); g3.connect(ctx.destination);
        o3.type='sine'; o3.frequency.setValueAtTime(440,now+.04);
        g3.gain.setValueAtTime(0,now+.04); g3.gain.linearRampToValueAtTime(.12,now+.06);
        g3.gain.exponentialRampToValueAtTime(.001,now+.18); o3.start(now+.04); o3.stop(now+.18);
      },
      draw:    () => {
        // Satisfying draw sound — low whoosh
        o.type='triangle'; o.frequency.setValueAtTime(300,now); o.frequency.exponentialRampToValueAtTime(150,now+.2);
        g.gain.setValueAtTime(.22,now); g.gain.exponentialRampToValueAtTime(.001,now+.25); o.start(now); o.stop(now+.25);
      },
      tick:    () => {
        o.type='sine'; o.frequency.setValueAtTime(880,now);
        g.gain.setValueAtTime(.08,now); g.gain.exponentialRampToValueAtTime(.001,now+.05); o.start(now); o.stop(now+.05);
      },
      urgentTick: () => {
        [880,1100].forEach((f,i) => {
          const ot=ctx.createOscillator(); const gt=ctx.createGain();
          ot.connect(gt); gt.connect(ctx.destination);
          ot.type='sine'; ot.frequency.value=f;
          gt.gain.setValueAtTime(0,now+i*.06); gt.gain.linearRampToValueAtTime(.1,now+i*.06+.02);
          gt.gain.exponentialRampToValueAtTime(.001,now+i*.06+.07);
          ot.start(now+i*.06); ot.stop(now+i*.06+.1);
        });
      },
      uno:     () => {
        const freqs = [660,880,1100];
        freqs.forEach((f,i) => {
          const o2 = ctx.createOscillator(); const g2 = ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.type='square'; o2.frequency.value=f;
          g2.gain.setValueAtTime(0,now+i*.1); g2.gain.linearRampToValueAtTime(.15,now+i*.1+.05);
          g2.gain.exponentialRampToValueAtTime(.001,now+i*.1+.15);
          o2.start(now+i*.1); o2.stop(now+i*.1+.2);
        });
      },
      skip:    () => { o.type='sawtooth'; o.frequency.setValueAtTime(800,now); o.frequency.exponentialRampToValueAtTime(200,now+.25); g.gain.setValueAtTime(.2,now); g.gain.exponentialRampToValueAtTime(.001,now+.25); o.start(now); o.stop(now+.25); },
      reverse: () => { o.type='sine'; o.frequency.setValueAtTime(300,now); o.frequency.exponentialRampToValueAtTime(600,now+.12); o.frequency.exponentialRampToValueAtTime(300,now+.25); g.gain.setValueAtTime(.2,now); g.gain.exponentialRampToValueAtTime(.001,now+.3); o.start(now); o.stop(now+.3); },
      wild:    () => {
        [330,415,523,659].forEach((f,i) => {
          const o2=ctx.createOscillator(); const g2=ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.type='triangle'; o2.frequency.value=f;
          g2.gain.setValueAtTime(0,now+i*.06); g2.gain.linearRampToValueAtTime(.18,now+i*.06+.04);
          g2.gain.exponentialRampToValueAtTime(.001,now+i*.06+.12);
          o2.start(now+i*.06); o2.stop(now+i*.06+.15);
        });
      },
      win:     () => {
        [523,659,784,1047].forEach((f,i) => {
          const o2=ctx.createOscillator(); const g2=ctx.createGain();
          o2.connect(g2); g2.connect(ctx.destination);
          o2.type='sine'; o2.frequency.value=f;
          g2.gain.setValueAtTime(0,now+i*.12); g2.gain.linearRampToValueAtTime(.2,now+i*.12+.05);
          g2.gain.exponentialRampToValueAtTime(.001,now+i*.12+.25);
          o2.start(now+i*.12); o2.stop(now+i*.12+.3);
        });
      },
    };
    sounds[type]?.();
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// ANIMATED BACKGROUND
// ═══════════════════════════════════════════════════════════════
(function initBg() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let W, H;
  const ORB_CONFIGS = [
    { x:.15, y:.8,  r:260, color:'rgba(124,58,237,', speed:.0004, drift:.0003 },
    { x:.85, y:.2,  r:220, color:'rgba(88,101,242,',  speed:.0003, drift:.0005 },
    { x:.5,  y:.5,  r:180, color:'rgba(236,72,153,',  speed:.0005, drift:.0002 },
    { x:.1,  y:.1,  r:150, color:'rgba(232,48,44,',   speed:.0006, drift:.0004 },
  ];
  const orbs = ORB_CONFIGS.map(c => ({ ...c, ox:0, oy:0, angle1: Math.random()*Math.PI*2, angle2: Math.random()*Math.PI*2 }));
  const PARTICLE_COUNT = 38;
  const particles = Array.from({ length: PARTICLE_COUNT }, () => spawnParticle(true));
  function spawnParticle(random) {
    return { x: Math.random()*(W||innerWidth), y: random?Math.random()*(H||innerHeight):(H||innerHeight)+10,
      vy:-(0.3+Math.random()*0.8), vx:(Math.random()-.5)*.4, size:1+Math.random()*2.5, opacity:0,
      maxOp:0.15+Math.random()*.35, color:['rgba(165,180,252,','rgba(196,181,253,','rgba(249,192,35,'][Math.floor(Math.random()*3)],
      life:0, maxLife:120+Math.random()*200 };
  }
  function resize() { W=canvas.width=innerWidth; H=canvas.height=innerHeight; }
  window.addEventListener('resize', resize); resize();
  let t = 0;
  function draw() {
    ctx.clearRect(0,0,W,H); t++;
    orbs.forEach(o => {
      o.angle1+=o.speed; o.angle2+=o.drift;
      o.ox=Math.sin(o.angle1)*W*.08; o.oy=Math.cos(o.angle2)*H*.08;
      const cx=o.x*W+o.ox, cy=o.y*H+o.oy;
      const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,o.r);
      grad.addColorStop(0,o.color+'0.09)'); grad.addColorStop(1,o.color+'0)');
      ctx.fillStyle=grad; ctx.beginPath(); ctx.arc(cx,cy,o.r,0,Math.PI*2); ctx.fill();
    });
    particles.forEach((p,i) => {
      p.life++; p.x+=p.vx; p.y+=p.vy;
      if (p.life<20) p.opacity=p.maxOp*(p.life/20);
      else if (p.life>p.maxLife-20) p.opacity=p.maxOp*((p.maxLife-p.life)/20);
      else p.opacity=p.maxOp;
      if (p.life>=p.maxLife||p.y<-10) particles[i]=spawnParticle(false);
      ctx.fillStyle=p.color+p.opacity+')'; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,Math.PI*2); ctx.fill();
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

// ═══════════════════════════════════════════════════════════════
// CARD HELPERS
// ═══════════════════════════════════════════════════════════════
function cardFilename(card) {
  if (card.value === 'command') return 'CC.png';
  const colorMap = { red:'R', blue:'B', green:'G', yellow:'Y', black:'W' };
  const valMap = { skip:'S', reverse:'R', draw2:'A2', wild:'C', wild4:'4' };
  const c = colorMap[card.color] || 'W';
  const v = valMap[card.value] ?? card.value;
  if (card.color === 'black') return (card.value === 'wild' ? 'WC' : 'W4') + '.png';
  return c + v + '.png';
}
function cardLabel(card) {
  return (card.color !== 'black' ? card.color.charAt(0).toUpperCase()+card.color.slice(1)+' ' : '') + (VALUE_LABEL[card.value] || card.value);
}
function isAiId(id) { return id && id.startsWith(AI_ID_PREFIX); }
function isMyTurn() {
  if (!G || !G.started || G.over || isSpectator) return false;
  return G.turnOrder[G.currentTurnIdx] === MY_ID;
}
function getNextIdx(steps) {
  const n = G.turnOrder.length;
  return ((G.currentTurnIdx + steps * G.direction) % n + n) % n;
}
function advanceTurn(steps=1) {
  const n = G.turnOrder.length;
  const prev = G.currentTurnIdx;
  G.currentTurnIdx = ((G.currentTurnIdx + steps * G.direction) % n + n) % n;
  // Only increment round when we wrap back to idx 0 going forward
  if (G.currentTurnIdx < prev && G.direction === 1) G.round++;
  else if (G.currentTurnIdx > prev && G.direction === -1 && prev === 0) G.round++;
}
function currentTurnName() {
  const id = G.turnOrder[G.currentTurnIdx];
  return G.players[id]?.name || 'Player';
}
function isPlayable(card) {
  if (!G) return false;
  if (card.value === 'command') return true; // Command card is always playable
  if (G.drawStack > 0) {
    if (houseRules.stack2 && card.value === 'draw2') return true;
    if (card.value === 'wild4') return true;
    return false;
  }
  if (card.color === 'black') return true;
  return card.color === G.topColor || card.value === G.topCard.value;
}
function isAiPlayable(card, topCard, topColor, drawStack) {
  if (card.value === 'command') return true;
  if (drawStack > 0) {
    if (houseRules.stack2 && card.value === 'draw2') return true;
    if (card.value === 'wild4') return true;
    return false;
  }
  if (card.color === 'black') return true;
  return card.color === topColor || card.value === topCard.value;
}
function canStackWith(card, stackCards) {
  if (stackCards.length === 0) return isPlayable(card);
  // Same number rule — can stack same value across colors
  const baseCard = stackCards[0];
  return card.value === baseCard.value && CARD_COLORS.includes(card.color);
}

// ═══════════════════════════════════════════════════════════════
// DECK BUILDER
// ═══════════════════════════════════════════════════════════════
function buildDeck() {
  const deck = [];
  for (const color of CARD_COLORS) {
    deck.push({ color, value: '0' });
    for (const v of ['1','2','3','4','5','6','7','8','9','skip','reverse','draw2']) {
      deck.push({ color, value: v });
      deck.push({ color, value: v });
    }
  }
  for (let i = 0; i < 4; i++) {
    deck.push({ color:'black', value:'wild' });
    deck.push({ color:'black', value:'wild4' });
  }
  // 3 Command Cards — always playable, player commands anything
  for (let i = 0; i < 3; i++) {
    deck.push({ color:'black', value:'command' });
  }
  return deck;
}
function shuffle(arr) {
  const a=[...arr];
  for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}
  return a;
}

// ═══════════════════════════════════════════════════════════════
// DOM CARD BUILDERS
// ═══════════════════════════════════════════════════════════════
function cardEl(card, { w=56, h=84, idx=-1, inHand=false, isDiscard=false, animate=false } = {}) {
  const wrap = document.createElement('div');
  const isSelected = inHand && selectedIndices.includes(idx);
  const isFirstSelected = inHand && selectedIndices[0] === idx;
  const playable = inHand && (card.value === 'command' || isPlayable(card));
  const canStack = inHand && selectedIndices.length > 0 && canStackWith(card, selectedIndices.map(i=>G.myHand[i]));

  wrap.className = 'card-img-wrap' +
    (inHand ? ' clickable' : '') +
    (isSelected ? (isFirstSelected ? ' selected' : ' stacked-selected') : '') +
    (inHand && playable ? ' playable' : '') +
    (inHand && !playable && !isSelected ? ' not-playable' : '');
  wrap.style.cssText = 'display:inline-block;';
  const img = document.createElement('img');
  img.src   = CFG.CARD_PATH + cardFilename(card);
  img.alt   = cardLabel(card);
  img.style.cssText = `width:${w}px;height:${h}px;pointer-events:none;user-select:none;-webkit-user-drag:none;display:block;`;
  if (isDiscard) img.classList.add(animate ? 'card-fly-in' : 'card-play-anim');
  img.onerror = function() {
    this.style.display='none';
    const fb=document.createElement('div');
    fb.className=`card-css card-${card.color}`;
    fb.style.cssText=`width:${w}px;height:${h}px;font-size:${Math.round(w*.38)}px;`;
    fb.textContent=VALUE_LABEL[card.value]?.split(' ')[0]??card.value;
    wrap.appendChild(fb);
  };
  wrap.appendChild(img);
  if (inHand) wrap.addEventListener('click', () => selectCard(idx));
  return wrap;
}
function getEquippedSkin() {
  const data = getShopData();
  const equipped = data.equippedCardBack || 'cb_default';
  return SHOP_ITEMS.cardBacks.find(x => x.id === equipped) || SHOP_ITEMS.cardBacks[0];
}

function cardBackEl(w=62, h=93) {
  const skin = getEquippedSkin();
  const div = document.createElement('div');
  div.style.cssText = `width:${w}px;height:${h}px;flex-shrink:0;position:relative;`;

  if (skin.id === 'cb_default') {
    // Default: use the image
    const img = document.createElement('img');
    img.src = CFG.CARD_PATH + 'UB.png';
    img.alt = 'Card Back';
    img.style.cssText = `width:${w}px;height:${h}px;border-radius:10px;display:block;object-fit:cover;box-shadow:0 4px 14px rgba(0,0,0,.5);`;
    img.onerror = function() {
      this.style.display = 'none';
      const fb = document.createElement('div');
      fb.className = 'card-back-css';
      fb.style.cssText = `width:${w}px;height:${h}px;`;
      fb.innerHTML = `<div class="card-back-logo" style="width:${Math.round(w*.65)}px;height:${Math.round(w*.65)}px;font-size:${Math.round(w*.24)}px;">UNO</div>`;
      div.appendChild(fb);
    };
    div.appendChild(img);
  } else {
    // Skinned: build a CSS gradient card back from the skin's colors
    const c = skin.colors;
    const skinDiv = document.createElement('div');
    skinDiv.className = 'skinned-card-back';
    skinDiv.style.cssText = `
      --cb-w:${w}px;--cb-h:${h}px;
      width:${w}px;height:${h}px;
      background:linear-gradient(145deg,${c[0]},${c[1]},${c[2]},${c[3]});
      border-radius:10px;box-shadow:0 4px 14px rgba(0,0,0,.5);
    `;
    // Inner UNO logo circle
    const logo = document.createElement('div');
    logo.style.cssText = `
      width:${Math.round(w*.55)}px;height:${Math.round(w*.55)}px;
      border-radius:50%;background:rgba(0,0,0,.3);
      display:flex;align-items:center;justify-content:center;
      font-family:'Fredoka One',cursive;font-size:${Math.round(w*.2)}px;
      color:rgba(255,255,255,.85);transform:rotate(-15deg);border:2px solid rgba(255,255,255,.2);
    `;
    logo.textContent = 'UNO';
    skinDiv.appendChild(logo);
    div.appendChild(skinDiv);
  }
  return div;
}

// ═══════════════════════════════════════════════════════════════
// SUPABASE INIT
// ═══════════════════════════════════════════════════════════════
function initSupabase() {
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY) { console.warn('Supabase not configured.'); return false; }
  try { SB = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY); return true; }
  catch(e) { console.warn('Supabase init error:', e); return false; }
}

// ═══════════════════════════════════════════════════════════════
// REALTIME CHANNEL
// ═══════════════════════════════════════════════════════════════
async function setupChannel(code) {
  if (CH) { await SB.removeChannel(CH); CH = null; }
  if (!SB) return;
  CH = SB.channel(`uno-room-${code}`, {
    config: { broadcast: { self: true }, presence: { key: MY_ID } }
  });
  CH.on('presence', { event: 'sync' }, () => {
    const state = CH.presenceState();
    lobbyPlayers = {};
    for (const id in state) { const p=state[id][0]; if(p) lobbyPlayers[id]=p; }
    updateLobbyUI();
    if (G && G.started) updatePlayerChips();
    updateLobbyBrowser();
  });
  CH.on('presence', { event: 'join' }, ({ newPresences }) => {
    if (newPresences[0]) {
      showToast(`${newPresences[0].name} joined`, 'fa-user-plus');
      addChatMessage(null, `${newPresences[0].name} joined the game`, true);
    }
  });
  CH.on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
    if (leftPresences[0]) {
      showToast(`${leftPresences[0].name} left`, 'fa-user-minus');
      addChatMessage(null, `${leftPresences[0].name} left`, true);
    }
    if (G && G.started && G.players[key]) {
      G.players[key].connected = false;
      addLog(`${G.players[key].name} disconnected.`, 'log-warn');
      if (isHost) { if(G.turnOrder[G.currentTurnIdx]===key) advanceTurn(1); broadcastFullState(); }
    }
  });
  CH.on('broadcast', { event: 'game_state' }, ({ payload }) => { if(isHost) return; applyStateUpdate(payload); });
  CH.on('broadcast', { event: 'game_action' }, ({ payload }) => { if(!isHost) return; processAction(payload); });
  CH.on('broadcast', { event: 'tod_action' }, ({ payload }) => { applyTodAction(payload); });
  CH.on('broadcast', { event: 'chat_msg' }, ({ payload }) => { receiveChatMessage(payload); });
  CH.on('broadcast', { event: 'command_announce' }, ({ payload }) => {
    showToast(`🃏 ${payload.playerName} commanded: ${payload.commandText}`, 'fa-bolt', 6000);
    showCardEffect('command', 'COMMAND!');
    addChatMessage(null, `🃏 Command: ${payload.commandText}`, true);
  });
  CH.on('broadcast', { event: 'house_rules' }, ({ payload }) => {
    if (!isHost) { houseRules = payload; syncHouseRulesUI(); }
  });
  await CH.subscribe(async (status) => {
    if (status==='SUBSCRIBED') {
      const dcUser = getDiscordUser();
      await CH.track({
        id: MY_ID, name: MY_NAME, isHost, isSpectator,
        avatar_url: dcUser?.avatar_url || null,
      });
    }
  });
}

function broadcast(event, payload) { if(!CH) return; CH.send({ type:'broadcast', event, payload }); }
function broadcastFullState() {
  if(!isHost||!CH) return;
  broadcast('game_state', {
    topCard: G.topCard, topColor: G.topColor, turnOrder: G.turnOrder,
    currentTurnIdx: G.currentTurnIdx, direction: G.direction, drawStack: G.drawStack,
    players: G.players, started: G.started, over: G.over, winner: G.winner,
    round: G.round, deckSize: G.deck.length, log: G.log.slice(-20), hands: G.hands,
    houseRules,
  });
}
function applyStateUpdate(payload) {
  if(!G) G={};
  Object.assign(G, payload);
  if (payload.houseRules) { houseRules = payload.houseRules; syncHouseRulesUI(); }
  if (G.hands && G.hands[MY_ID]) G.myHand = G.hands[MY_ID];
  if (payload.screenSwitch === 'uno') showScreen('screen-uno');
  renderGame();
}

// ═══════════════════════════════════════════════════════════════
// LOBBY BROWSER
// ═══════════════════════════════════════════════════════════════
let _lobbyBrowserData = {}; // roomCode -> { players, started, gameType, host }

function openLobbyBrowser(type) {
  gameType = type;
  document.getElementById('browser-title').innerHTML = type === 'uno'
    ? '<i class="fas fa-layer-group"></i> UNO Lobbies'
    : '<i class="fas fa-bullseye"></i> ToD Lobbies';
  document.getElementById('browser-inp-name').value = MY_NAME || '';
  document.getElementById('browser-confirm-name').disabled = !MY_NAME;
  document.getElementById('browser-name-box').style.display = MY_NAME ? 'none' : '';
  document.getElementById('browser-room-section').style.display = MY_NAME ? 'flex' : 'none';
  showScreen('screen-lobby-browser');
  if (MY_NAME) refreshLobbyBrowser();
}

async function refreshLobbyBrowser() {
  const grid = document.getElementById('lobby-cards-grid');
  grid.innerHTML = '<div class="no-lobbies"><i class="fas fa-satellite-dish"></i>Searching for lobbies…</div>';

  if (!SB) {
    grid.innerHTML = '<div class="no-lobbies"><i class="fas fa-plug"></i>No connection — create a lobby below</div>';
    return;
  }

  // Remove old meta channel if any
  if (META_CH) { try { await SB.removeChannel(META_CH); } catch(e){} META_CH = null; }

  const discovered = {};
  META_CH = SB.channel('meta-lobby-v2', {
    config: { presence: { key: MY_ID } }
  });

  META_CH.on('presence', { event: 'sync' }, () => {
    const state = META_CH.presenceState();
    for (const uid in state) {
      const p = state[uid][0];
      if (p && p.code && p.hostName) {
        discovered[p.code] = {
          hostName: p.hostName,
          playerCount: p.playerCount || 1,
          started: !!p.started,
          gameType: p.gameType || 'uno',
        };
      }
    }
    _lobbyBrowserData = { ...discovered };
    renderLobbyBrowserRooms();
  });

  await META_CH.subscribe(async (status) => {
    if (status === 'SUBSCRIBED') {
      // Track as a browser (no code = just browsing)
      await META_CH.track({ browsing: true, name: MY_NAME });
      // Show "no lobbies" after timeout if none found
      setTimeout(() => {
        if (Object.keys(discovered).length === 0) {
          grid.innerHTML = '<div class="no-lobbies"><i class="fas fa-search"></i>No active lobbies found<br><span style="font-size:11px;margin-top:6px;display:block;">Create one below!</span></div>';
        }
      }, 3500);
    }
  });
}

function renderLobbyBrowserRooms() {
  const grid = document.getElementById('lobby-cards-grid');
  const entries = Object.entries(_lobbyBrowserData);
  if (entries.length === 0) {
    grid.innerHTML = '<div class="no-lobbies"><i class="fas fa-search"></i>No active lobbies found<br><span style="font-size:11px;margin-top:6px;display:block;">Create one below!</span></div>';
    return;
  }
  grid.innerHTML = '';
  entries.forEach(([code, info]) => {
    const started = info.started;
    const count = info.playerCount || 0;
    const el = document.createElement('div');
    el.className = 'lobby-card-item' + (started ? ' in-progress' : '');
    const statusClass = started ? 'playing' : 'waiting';
    const actionText = started ? 'SPECTATE' : 'JOIN';
    el.innerHTML = `
      <div class="lci-avatar" style="background:rgba(88,101,242,.2)">
        <i class="fas fa-layer-group" style="color:var(--accent2);"></i>
      </div>
      <div class="lci-info">
        <div class="lci-name">${info.hostName || 'Room'}'s Game</div>
        <div class="lci-meta">
          <span class="lci-players"><i class="fas fa-users" style="font-size:9px;"></i> ${count} player${count!==1?'s':''}</span>
          Code: <strong>${code}</strong>
        </div>
      </div>
      <span class="lci-status ${statusClass}">${actionText}</span>
    `;
    el.addEventListener('click', () => joinLobbyFromBrowser(code, started));
    grid.appendChild(el);
  });
}

function joinLobbyFromBrowser(code, started) {
  if (started) {
    // Join as spectator
    isSpectator = true;
    roomCode = code;
    isHost = false;
    enterWaitingRoom(true);
  } else {
    document.getElementById('inp-room-code').value = code;
    openWaitingLobby();
    joinRoom();
  }
}

function announceLobby() {
  if (!isHost || !roomCode) return;
  const info = {
    code: roomCode,
    hostName: MY_NAME,
    playerCount: Object.keys(lobbyPlayers).length,
    started: !!(G && G.started),
    gameType,
  };
  // Update local cache
  _lobbyBrowserData[roomCode] = {
    hostName: MY_NAME,
    playerCount: Object.keys(lobbyPlayers).length,
    started: !!(G && G.started),
  };
  // Track on shared discovery channel so all browsers see it in real-time
  if (SB) {
    if (!META_CH || META_CH.state === 'closed') {
      META_CH = SB.channel('meta-lobby-v2', {
        config: { presence: { key: MY_ID } }
      });
      META_CH.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') await META_CH.track(info);
      });
    } else {
      META_CH.track(info).catch(()=>{});
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// LOBBY
// ═══════════════════════════════════════════════════════════════
function openLobby(type) {
  gameType = type;
  const icon = type === 'uno' ? '<i class="fas fa-layer-group"></i>' : '<i class="fas fa-bullseye"></i>';
  document.getElementById('lobby-title').innerHTML = `${icon} ${type === 'uno' ? 'UNO Lobby' : 'ToD Lobby'}`;
  if (MY_NAME) {
    openLobbyBrowser(type);
  } else {
    openLobbyBrowser(type);
  }
}

function openWaitingLobby() {
  showScreen('screen-lobby');
  document.getElementById('lobby-room-box').style.display = '';
  document.getElementById('lobby-waiting-box').style.display = 'none';
}

function onNameInput(el) {
  const v = (el?.value || document.getElementById('inp-name')?.value || '').trim();
  document.getElementById('btn-confirm-name') && (document.getElementById('btn-confirm-name').disabled = v.length < 1);
}

function genRoomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(3)))
    .map(b => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b & 31]).join('');
}

async function createRoom() {
  roomCode = genRoomCode();
  isHost = true;
  isAiMode = false;
  isSpectator = false;
  await _enterRoom();
  document.getElementById('room-code-display').style.display = '';
  document.getElementById('room-code-text').textContent = roomCode;
  document.getElementById('btn-start-game').style.display = '';
  document.getElementById('lobby-waiting-msg').style.display = 'none';
  document.getElementById('house-rules-panel').style.display = '';
  syncHouseRulesUI();
  announceLobby();
}

async function joinRoom() {
  const code = document.getElementById('inp-room-code').value.trim().toUpperCase();
  if (code.length < 3) { showToast('Enter a room code first', 'fa-exclamation-triangle'); return; }
  roomCode = code;
  isHost = false;
  isAiMode = false;
  isSpectator = false;
  await _enterRoom();
}

async function enterWaitingRoom(asSpectator=false) {
  isSpectator = asSpectator;
  await _enterRoom();
}

async function _enterRoom() {
  showScreen('screen-lobby');
  document.getElementById('lobby-room-box').style.display = 'none';
  document.getElementById('lobby-waiting-box').style.display = '';
  document.getElementById('lobby-player-count').textContent = '1 player';
  if (SB) {
    await setupChannel(roomCode);
  } else {
    lobbyPlayers[MY_ID] = { id:MY_ID, name:MY_NAME, isHost, isSpectator };
    updateLobbyUI();
    if (isHost) {
      document.getElementById('btn-start-game').style.display = '';
      document.getElementById('lobby-waiting-msg').style.display = 'none';
    }
  }
}

function syncHouseRulesUI() {
  document.getElementById('rule-stack2').checked = houseRules.stack2;
  document.getElementById('rule-seven').checked = houseRules.seven;
  document.getElementById('rule-zero').checked = houseRules.zero;
  document.getElementById('rule-multistack').checked = houseRules.multistack;
}

function onHouseRuleChange() {
  if (!isHost) return;
  houseRules.stack2 = document.getElementById('rule-stack2').checked;
  houseRules.seven = document.getElementById('rule-seven').checked;
  houseRules.zero = document.getElementById('rule-zero').checked;
  houseRules.multistack = document.getElementById('rule-multistack').checked;
  broadcast('house_rules', houseRules);
}

function startAiGame() {
  isAiMode = true;
  isHost = true;
  isSpectator = false;
  roomCode = 'AI_' + genRoomCode();
  const aiCount = parseInt(document.getElementById('ai-count-select').value, 10) || 2;
  lobbyPlayers = {};
  lobbyPlayers[MY_ID] = { id:MY_ID, name:MY_NAME, isHost:true };
  for (let i=0;i<aiCount;i++) {
    const aiId = AI_ID_PREFIX+i;
    lobbyPlayers[aiId] = { id:aiId, name:AI_NAMES[i]||`AI-${i+1}`, isHost:false, isAi:true };
  }
  houseRules.stack2 = document.getElementById('rule-stack2').checked;
  houseRules.seven = document.getElementById('rule-seven').checked;
  houseRules.zero = document.getElementById('rule-zero').checked;
  houseRules.multistack = document.getElementById('rule-multistack').checked;
  const playerIds = Object.keys(lobbyPlayers);
  _gameStartTime = Date.now();
  initGameState(playerIds);
  document.getElementById('ai-mode-badge').style.display = '';
  document.getElementById('spectator-badge').style.display = 'none';
  document.getElementById('spectator-indicator').style.display = 'none';
  initChatPanel();
  // Run deal animation then show game
  runDealAnimation(() => {
    renderGame();
    _afterTurnSetup();
    startMusic();
  });
}

function startAiTod() {
  const BG = ['#818cf8','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
  lobbyPlayers = {};
  lobbyPlayers[MY_ID] = { id:MY_ID, name:MY_NAME, isHost:true };
  // Add 3 AI "players" as named participants for context-rich prompts
  const todAiNames = ['Alex','Jordan','Sam'];
  todAiNames.forEach((name, i) => {
    const aiId = AI_ID_PREFIX + i;
    lobbyPlayers[aiId] = { id:aiId, name, isHost:false, isAi:true };
  });
  todAiMode = true;
  initTodWithPlayers();
  showScreen('screen-tod');
  // Show AI mode badge in topbar
  const topbarTitle = document.querySelector('#screen-tod .topbar-title');
  if (topbarTitle && !document.getElementById('tod-ai-badge')) {
    const badge = document.createElement('span');
    badge.id = 'tod-ai-badge';
    badge.style.cssText = 'background:rgba(129,140,248,.2);border:1px solid rgba(129,140,248,.35);border-radius:8px;padding:2px 8px;font-size:10px;color:var(--ai-color);font-family:\'Nunito\',sans-serif;font-weight:800;margin-left:4px;';
    badge.innerHTML = '<i class="fas fa-robot" style="font-size:8px;"></i> AI';
    topbarTitle.appendChild(badge);
  }
}

function updateLobbyUI() {
  const list = document.getElementById('lobby-player-list');
  list.innerHTML = '';
  const ids = Object.keys(lobbyPlayers);
  document.getElementById('lobby-player-count').textContent = ids.length + ' player' + (ids.length!==1?'s':'');
  const BG_COLORS = ['#5865F2','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
  ids.forEach((id,i) => {
    const p = lobbyPlayers[id];
    const item = document.createElement('div');
    item.className = 'lobby-player-item';
    const avatarContent = p.avatar_url
      ? `<img src="${p.avatar_url}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;display:block;" onerror="this.outerHTML='<span style=\\'font-size:14px;font-weight:900;\\'>${(p.name||'?').slice(0,1).toUpperCase()}</span>'">`
      : `<span style="font-size:14px;font-weight:900;">${(p.name||'?').slice(0,1).toUpperCase()}</span>`;
    item.innerHTML = `
      <div class="lp-avatar" style="background:${BG_COLORS[i%BG_COLORS.length]};overflow:hidden;display:flex;align-items:center;justify-content:center;">${avatarContent}</div>
      <div class="lp-name">${p.name}</div>
      ${p.isHost ? '<span class="lp-badge host">HOST</span>' : ''}
      ${id===MY_ID ? '<span class="lp-badge you">YOU</span>' : ''}
      ${p.isAi ? '<span class="lp-badge ai-badge"><i class="fas fa-robot" style="font-size:8px;"></i> AI</span>' : ''}
      ${p.isSpectator ? '<span class="lp-badge spectator-badge"><i class="fas fa-eye" style="font-size:8px;"></i> Watching</span>' : ''}
    `;
    list.appendChild(item);
  });
  if (isHost) {
    const btn = document.getElementById('btn-start-game');
    btn.disabled = ids.filter(id => !lobbyPlayers[id]?.isSpectator).length < 2;
  }
}

function updateLobbyBrowser() {
  if (isHost && roomCode) announceLobby();
}

async function startGame() {
  if (!isHost) return;
  if (gameType === 'tod') {
    initTodWithPlayers();
    showScreen('screen-tod');
    broadcast('tod_action', { type:'start_tod' });
    return;
  }
  const playerIds = Object.keys(lobbyPlayers).filter(id => !lobbyPlayers[id]?.isSpectator);
  if (playerIds.length < 2 && SB) { showToast('Need at least 2 players to start','fa-exclamation-triangle'); return; }
  initGameState(playerIds);
  _gameStartTime = Date.now();
  document.getElementById('ai-mode-badge').style.display = 'none';
  initChatPanel();
  broadcast('game_state', { ...getSerializableState(), screenSwitch:'dealing', houseRules });
  runDealAnimation(() => {
    renderGame();
    broadcast('game_state', { ...getSerializableState(), screenSwitch:'uno', houseRules });
    _afterTurnSetup();
    announceLobby();
    startMusic();
  });
}

// ═══════════════════════════════════════════════════════════════
// DEAL ANIMATION
// ═══════════════════════════════════════════════════════════════
function runDealAnimation(onComplete) {
  showScreen('screen-dealing');
  const titleEl  = document.getElementById('deal-title');
  const deckArea = document.getElementById('deal-deck-area');
  const playersRow = document.getElementById('deal-players-row');
  const statusEl  = document.getElementById('deal-status');

  // Build player slots
  const BG = ['#5865F2','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f43f5e','#14b8a6'];
  const AI_BG = ['#818cf8','#f43f5e','#22c55e','#f59e0b','#06b6d4','#8b5cf6'];
  playersRow.innerHTML = '';
  const slotMap = {};
  G.turnOrder.forEach((id, i) => {
    const p = G.players[id];
    const isMe = id === MY_ID;
    const isAiP = isAiId(id);
    const bg = isAiP ? AI_BG[i % AI_BG.length] : BG[i % BG.length];
    const slot = document.createElement('div');
    slot.className = 'deal-player-slot';
    slot.id = `deal-slot-${id}`;
    slot.innerHTML = `
      <div class="deal-player-avatar" id="deal-avatar-${id}" style="background:${bg}">
        ${isAiP ? '<i class="fas fa-robot" style="font-size:13px;"></i>' : (p.name||'?').slice(0,1).toUpperCase()}
      </div>
      <div class="deal-player-name">${isMe ? 'You' : p.name}</div>
      <div class="deal-card-count" id="deal-count-${id}">0</div>
    `;
    playersRow.appendChild(slot);
    slotMap[id] = slot;
  });

  // Build deck stack visual (8 stacked cards using UB.png)
  deckArea.innerHTML = '';
  for (let i = 0; i < 8; i++) {
    const c = document.createElement('div');
    c.className = 'deal-deck-card';
    c.style.transform = `rotate(${(i - 4) * 1.5}deg) translateY(${i * -1}px)`;
    const img = document.createElement('img');
    img.src = CFG.CARD_PATH + 'UB.png';
    img.alt = 'Card Back';
    img.style.cssText = 'width:66px;height:99px;border-radius:9px;display:block;object-fit:cover;';
    img.onerror = function(){ this.style.display='none'; c.textContent='UNO'; };
    c.appendChild(img);
    deckArea.appendChild(c);
  }

  // Phase 1: Shuffle animation
  titleEl.textContent = '🔀 Shuffling Deck…';
  statusEl.textContent = 'Riffle… riffle… riffle…';
  let shuffleCount = 0;
  const SHUFFLE_ROUNDS = 5;

  function doShuffle() {
    if (shuffleCount >= SHUFFLE_ROUNDS) {
      // Phase 2: Deal cards
      titleEl.textContent = '🃏 Dealing Cards…';
      setTimeout(dealNextCard, 300);
      return;
    }
    deckArea.classList.add('shuffling');
    playSound('draw');
    setTimeout(() => {
      deckArea.classList.remove('shuffling');
      shuffleCount++;
      setTimeout(doShuffle, 180);
    }, 260);
  }
  doShuffle();

  // Phase 2: Deal one card at a time to each player, 7 rounds
  const CARDS_PER_PLAYER = 7;
  const playerIds = G.turnOrder;
  let dealRound = 0;
  let dealPlayerIdx = 0;
  const dealCounts = {};
  playerIds.forEach(id => { dealCounts[id] = 0; });

  function dealNextCard() {
    if (dealRound >= CARDS_PER_PLAYER) {
      // Done dealing
      statusEl.textContent = '✅ All cards dealt!';
      titleEl.textContent = `🎮 ${G.players[G.turnOrder[G.currentTurnIdx]]?.name || 'Player'} goes first!`;
      setTimeout(() => {
        showScreen('screen-uno');
        onComplete();
      }, 900);
      return;
    }

    const targetId = playerIds[dealPlayerIdx];
    const avatarEl = document.getElementById(`deal-avatar-${targetId}`);
    const countEl  = document.getElementById(`deal-count-${targetId}`);
    const deckRect = deckArea.getBoundingClientRect();
    const slotEl   = document.getElementById(`deal-slot-${targetId}`);
    const slotRect = slotEl ? slotEl.getBoundingClientRect() : deckRect;

    // Animate a flying card from deck to player slot
    const flyCard = document.createElement('div');
    flyCard.className = 'deal-flying-card';
    const flyImg = document.createElement('img');
    flyImg.src = CFG.CARD_PATH + 'UB.png';
    flyImg.alt = 'Card';
    flyImg.style.cssText = 'width:46px;height:69px;border-radius:6px;display:block;object-fit:cover;';
    flyImg.onerror = function(){ this.style.display='none'; flyCard.textContent='🃏'; };
    flyCard.appendChild(flyImg);
    flyCard.style.top  = deckRect.top  + 'px';
    flyCard.style.left = deckRect.left + 'px';
    document.body.appendChild(flyCard);

    // Flash avatar
    if (avatarEl) { avatarEl.classList.add('receiving'); setTimeout(() => avatarEl.classList.remove('receiving'), 320); }

    playSound('play');
    statusEl.textContent = `Dealing to ${G.players[targetId]?.name || 'Player'}…`;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flyCard.style.top  = (slotRect.top  + 4) + 'px';
        flyCard.style.left = (slotRect.left + 4) + 'px';
        flyCard.style.opacity = '0';
      });
    });

    setTimeout(() => {
      flyCard.remove();
      dealCounts[targetId]++;
      if (countEl) countEl.textContent = dealCounts[targetId];
    }, 340);

    // Advance to next player/round
    dealPlayerIdx++;
    if (dealPlayerIdx >= playerIds.length) {
      dealPlayerIdx = 0;
      dealRound++;
    }

    setTimeout(dealNextCard, 160);
  }
}

function leaveLobby() {
  stopTurnTimer();
  clearTimeout(_aiThinkTimeout);
  if (CH) { SB?.removeChannel(CH); CH = null; }
  if (META_CH) { try { META_CH.untrack(); SB?.removeChannel(META_CH); } catch(e){} META_CH = null; }
  roomCode = '';
  isHost = false;
  isAiMode = false;
  isSpectator = false;
  todAiMode = false;
  G = null;
  selectedIndices = [];
  stopMusic();
  document.getElementById('ai-mode-badge').style.display = 'none';
  document.getElementById('spectator-badge').style.display = 'none';
  const todBadge = document.getElementById('tod-ai-badge');
  if (todBadge) todBadge.remove();
  showScreen('screen-launcher');
}
function confirmLeaveGame() {
  if (confirm('Leave the game?')) leaveLobby();
}

// ═══════════════════════════════════════════════════════════════
// GAME ENGINE
// ═══════════════════════════════════════════════════════════════
function initGameState(playerIds) {
  const deck = shuffle(buildDeck());
  const hands = {}, players = {};
  const BG = ['#5865F2','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#f43f5e','#14b8a6'];

  for (let i=0;i<playerIds.length;i++) {
    const id = playerIds[i];
    hands[id] = deck.splice(0,7);
    const pData = lobbyPlayers[id];
    players[id] = {
      name: pData?.name||`P${i+1}`, cardCount:7, score:0, connected:true,
      isAi: !!pData?.isAi,
      color: isAiId(id) ? AI_COLORS[parseInt(id.replace(AI_ID_PREFIX,''),10)%AI_COLORS.length] : BG[i%BG.length],
    };
  }

  let topCard;
  do { topCard = deck.shift(); } while (topCard.color === 'black');
  const turnOrder = shuffle([...playerIds]);

  G = {
    deck, hands, players,
    topCard, topColor: topCard.color,
    turnOrder, currentTurnIdx:0,
    direction:1, drawStack:0,
    started:true, over:false, winner:null,
    round:1,
    _noDrawThisGame: true,
    _drawCount: 0,
    log:[
      { text:'Game started!', cls:'log-system' },
      { text:`${players[turnOrder[0]]?.name||'Player'} goes first.`, cls:'log-warn' },
    ],
    myHand: null,
  };
  G.myHand = G.hands[MY_ID] || [];
}

function getSerializableState() {
  if(!G) return {};
  return {
    topCard:G.topCard, topColor:G.topColor, turnOrder:G.turnOrder,
    currentTurnIdx:G.currentTurnIdx, direction:G.direction, drawStack:G.drawStack,
    players:G.players, started:G.started, over:G.over, winner:G.winner,
    round:G.round, deckSize:G.deck.length, log:G.log.slice(-20), hands:G.hands,
  };
}

function processAction({ type, playerId, cards, card, chosenColor, swapTargetId }) {
  // ── Challenge tracking for card plays ──
  if (type === 'play_card' && playerId === MY_ID) {
    try {
      const playedCards = cards ? (Array.isArray(cards) ? cards : [cards]) : (card ? [card] : []);
      const specials = playedCards.filter(c=>['skip','reverse','draw2','wild4'].includes(c.value));
      const wilds = playedCards.filter(c=>c.color==='black');
      if (specials.length > 0) progressChallenge('specials', specials.length);
      if (wilds.length > 0) progressChallenge('wilds', wilds.length);
      if (playedCards.length >= 3) {
        const prog = getProgData();
        prog.maxCombo = Math.max(prog.maxCombo||0, playedCards.length);
        saveProgData(prog);
        progressChallenge('combos', 1);
      }
    } catch(e){}
  }
  if (!G || !isHost) return;

  if (type === 'play_card' || type === 'play_cards') {
    const playedCards = cards || [card];
    if (G.hands[playerId]) {
      for (const c of playedCards) {
        const idx = G.hands[playerId].findIndex(h => h.color===c.color && h.value===c.value);
        if (idx!==-1) G.hands[playerId].splice(idx,1);
      }
    }
    G.players[playerId].cardCount = G.hands[playerId]?.length ?? 0;

    // Multi-stack: apply each card effect, final one sets the top
    const lastCard = playedCards[playedCards.length-1];
    G.topCard  = lastCard;
    G.topColor = chosenColor || lastCard.color;

    const namesStr = playedCards.length > 1
      ? `${playedCards.length} cards (${playedCards.map(c=>cardLabel(c)).join(', ')})`
      : cardLabel({ color:G.topColor, value:lastCard.value });
    addLog(`${G.players[playerId]?.name||'Player'} played ${namesStr}.`,
      isAiId(playerId)?'log-ai':(playerId===MY_ID?'log-you':''));

    if (checkWin(playerId)) { broadcastFullState(); return; }
    applyCardEffect(lastCard, playerId, chosenColor, swapTargetId, playedCards);

  } else if (type === 'draw_card') {
    if (!G.deck.length) reshuffleDeck();
    const drawn = G.deck.splice(0, Math.max(1, G.drawStack));
    G.hands[playerId] = [...(G.hands[playerId]||[]), ...drawn];
    G.players[playerId].cardCount = G.hands[playerId].length;
    if (G.drawStack > 0) {
      addLog(`${G.players[playerId]?.name} drew ${G.drawStack} cards!`, 'log-warn');
      G.drawStack = 0;
    } else {
      addLog(`${G.players[playerId]?.name||'Player'} drew a card.`,
        isAiId(playerId)?'log-ai':(playerId===MY_ID?'log-you':''));
    }
    advanceTurn(1);

  } else if (type === 'uno_shout') {
    addLog(`${G.players[playerId]?.name} shouted UNO!`, 'log-warn');

  } else if (type === 'command_card') {
    // Remove the command card from hand (find by value='command')
    if (G.hands[playerId]) {
      const idx = G.hands[playerId].findIndex(h => h.value === 'command');
      if (idx !== -1) G.hands[playerId].splice(idx, 1);
    }
    G.players[playerId].cardCount = G.hands[playerId]?.length ?? 0;
    const pName = G.players[playerId]?.name || 'Player';
    const cmdText = (card.commandText || '').toLowerCase().trim();
    addLog(`🃏 ${pName} commanded: "${card.commandText}"`, 'log-special');
    showCardEffect('command', 'COMMAND!');

    // Parse and auto-execute common command patterns
    const everyoneDraw = cmdText.match(/everyone.*(draw|take|pick up)\s*(\d+)/i);
    const skipNext = cmdText.match(/skip\s+(?:the\s+)?next\s*(\d+)?/i);
    const nextDraw = cmdText.match(/next\s+player.*(?:draw|take|pick up)\s*(\d+)/i);
    const reverseTurn = cmdText.match(/reverse/i);
    const allSkip = cmdText.match(/everyone\s+skip|skip\s+everyone/i);

    if (everyoneDraw) {
      const n = parseInt(everyoneDraw[2], 10) || 2;
      G.turnOrder.forEach(id => {
        if (id === playerId) return;
        if (!G.deck.length) reshuffleDeck();
        const drawn = G.deck.splice(0, n);
        G.hands[id] = [...(G.hands[id]||[]), ...drawn];
        G.players[id].cardCount = G.hands[id].length;
      });
      addLog(`Everyone (except ${pName}) drew ${n} cards!`, 'log-warn');
      showCardEffect('draw', `+${n} ALL`);
    } else if (allSkip) {
      addLog(`Everyone is skipped! ${pName} goes again.`, 'log-special');
      showCardEffect('skip', 'ALL SKIP!');
      // Don't advance turn — player goes again
      if (checkWin(playerId)) { broadcastFullState(); return; }
      if (!isAiMode) broadcastFullState();
      if (G.hands && G.hands[MY_ID]) G.myHand = G.hands[MY_ID];
      renderGame();
      broadcast('command_announce', { playerName: pName, commandText: card.commandText });
      if (G.started && !G.over) _afterTurnSetup();
      return;
    } else if (nextDraw) {
      const n = parseInt(nextDraw[1], 10) || 2;
      G.drawStack += n;
      addLog(`Next player must draw ${n}!`, 'log-warn');
      showCardEffect('draw', `+${n}`);
    } else if (reverseTurn) {
      G.direction *= -1;
      addLog('Direction reversed by command!', 'log-system');
      showCardEffect('reverse', 'REVERSE!');
    } else if (skipNext) {
      const skips = parseInt(skipNext[1], 10) || 1;
      addLog(`Next ${skips > 1 ? skips + ' players are' : 'player is'} skipped by command!`, 'log-special');
      showCardEffect('skip', skips > 1 ? `SKIP ×${skips}` : 'SKIP!');
      if (checkWin(playerId)) { broadcastFullState(); return; }
      broadcast('command_announce', { playerName: pName, commandText: card.commandText });
      advanceTurn(skips + 1);
      if (!isAiMode) broadcastFullState();
      if (G.hands && G.hands[MY_ID]) G.myHand = G.hands[MY_ID];
      renderGame();
      if (G.started && !G.over) _afterTurnSetup();
      return;
    }

    if (checkWin(playerId)) { broadcastFullState(); return; }
    broadcast('command_announce', { playerName: pName, commandText: card.commandText });
    advanceTurn(1);

  } else if (type === 'timer_draw') {
    if (!G.deck.length) reshuffleDeck();
    const drawn = G.deck.splice(0,1);
    G.hands[playerId] = [...(G.hands[playerId]||[]), ...drawn];
    G.players[playerId].cardCount = G.hands[playerId].length;
    addLog(`⏱ ${G.players[playerId]?.name} ran out of time!`, 'log-timer');
    advanceTurn(1);
  }

  if (G.hands && G.hands[MY_ID]) G.myHand = G.hands[MY_ID];
  if (!isAiMode) broadcastFullState();
  renderGame();
  if (G.started && !G.over) _afterTurnSetup();
}

function _afterTurnSetup() {
  if(!G||!G.started||G.over) return;
  const curId = G.turnOrder[G.currentTurnIdx];
  if (isAiId(curId)) { stopTurnTimer(); maybeScheduleAiTurn(); }
  else if (curId === MY_ID && !isSpectator) startTurnTimer();
  else stopTurnTimer();
}

function applyCardEffect(card, playerId, chosenColor, swapTargetId, allCards) {
  const nextIdx = getNextIdx(1);
  const nextId  = G.turnOrder[nextIdx];

  // Handle multi-stack: stack draw penalties
  if (allCards && allCards.length > 1) {
    // Count draw effects
    let stackDraw = 0;
    let hasSkip = false, hasReverse = false;
    for (const c of allCards) {
      if (c.value === 'draw2') stackDraw += 2;
      if (c.value === 'wild4') stackDraw += 4;
      if (c.value === 'skip') hasSkip = true;
      if (c.value === 'reverse') hasReverse = true;
    }
    if (stackDraw > 0) {
      G.drawStack += stackDraw;
      addLog(`${G.players[nextId]?.name} must draw ${G.drawStack}!`, 'log-warn');
      showCardEffect('draw', `+${G.drawStack}`);
      playSound('skip');
      advanceTurn(1);
      return;
    }
  }

  if (card.value === 'skip') {
    addLog(`${G.players[nextId]?.name} was skipped!`, 'log-special');
    showCardEffect('skip', 'SKIP!');
    playSound('skip');
    advanceTurn(2);

  } else if (card.value === 'reverse') {
    G.direction *= -1;
    addLog('Direction reversed!', 'log-system');
    showCardEffect('reverse', 'REVERSE!');
    playSound('reverse');
    advanceTurn(G.turnOrder.length === 2 ? 2 : 1);

  } else if (card.value === 'draw2') {
    G.drawStack += 2;
    addLog(`${G.players[nextId]?.name} must draw 2 (or stack)!`, 'log-warn');
    showCardEffect('draw', '+2');
    playSound('skip');
    advanceTurn(1);

  } else if (card.value === 'wild4') {
    G.drawStack += 4;
    addLog(`${G.players[nextId]?.name} must draw 4!`, 'log-warn');
    showCardEffect('wild', '+4 WILD');
    playSound('wild');
    advanceTurn(1);

  } else if (card.value === 'wild') {
    addLog(`Wild! Color changed to ${G.topColor}.`, 'log-system');
    showCardEffect('wild', 'WILD!');
    playSound('wild');
    advanceTurn(1);

  } else if (card.value === '7' && houseRules.seven && chosenColor === null) {
    // Swap hands handled via modal
    if (swapTargetId && G.hands[swapTargetId]) {
      const myHand = G.hands[playerId];
      G.hands[playerId] = G.hands[swapTargetId];
      G.hands[swapTargetId] = myHand;
      G.players[playerId].cardCount = G.hands[playerId].length;
      G.players[swapTargetId].cardCount = G.hands[swapTargetId].length;
      addLog(`${G.players[playerId]?.name} swapped hands with ${G.players[swapTargetId]?.name}!`, 'log-special');
      showCardEffect('skip', 'SWAP!');
    }
    advanceTurn(1);

  } else if (card.value === '0' && houseRules.zero) {
    // Rotate all hands
    const order = G.turnOrder;
    const firstHand = G.hands[order[0]];
    for (let i=0;i<order.length-1;i++) {
      G.hands[order[i]] = G.hands[order[i+1]];
      G.players[order[i]].cardCount = G.hands[order[i]].length;
    }
    G.hands[order[order.length-1]] = firstHand;
    G.players[order[order.length-1]].cardCount = firstHand.length;
    addLog('Hands rotated!', 'log-special');
    showCardEffect('reverse', 'ROTATE!');
    advanceTurn(1);

  } else if (card.value === 'command') {
    // Command handled separately — just advance turn
    addLog(`${G.players[playerId]?.name} issued a Command!`, 'log-special');
    showCardEffect('command', 'COMMAND!');
    advanceTurn(1);

  } else {
    advanceTurn(1);
  }
}
function checkWin(playerId) {
  if (!G.hands[playerId] || G.hands[playerId].length > 0) return false;
  G.over = true;
  G.winner = playerId;
  const p = G.players[playerId];
  if (p) p.score = (p.score||0)+1;
  addLog(`${G.players[playerId]?.name} wins this round!`, 'log-warn');
  stopTurnTimer();
  clearTimeout(_aiThinkTimeout);
  playSound('win');
  // Handle tournament tracking
  if (G._tournamentMatch) {
    const isPlayerWin = playerId === MY_ID;
    setTimeout(() => onTournamentMatchWin(isPlayerWin), 500);
  }
  // Delay so final card render shows before modal
  setTimeout(() => {
    if (G && G.over) renderGame();
  }, 350);
  return true;
}
function reshuffleDeck() { G.deck = shuffle(buildDeck()); }
function addLog(text, cls='') { G.log = G.log||[]; G.log.push({ text, cls }); }

// ═══════════════════════════════════════════════════════════════
// CARD EFFECTS
// ═══════════════════════════════════════════════════════════════
let _effectTimeout = null;
function showCardEffect(type, text) {
  const overlay = document.getElementById('effect-overlay');
  const textEl = document.getElementById('effect-text');
  clearTimeout(_effectTimeout);
  overlay.className = `effect-overlay effect-overlay-${type} show`;
  textEl.textContent = text;
  textEl.style.animation = 'none';
  requestAnimationFrame(() => { textEl.style.animation = ''; });
  _effectTimeout = setTimeout(() => { overlay.classList.remove('show'); }, 900);
}

function setDiscardEffect(card) {
  const pile = document.getElementById('discard-pile');
  pile.className = 'discard-pile';
  if (card.value === 'skip') pile.classList.add('discard-special-skip');
  else if (card.value === 'reverse') pile.classList.add('discard-special-reverse');
  else if (card.value === 'draw2' || card.value === 'wild4') pile.classList.add('discard-special-draw');
  else if (card.value === 'wild') pile.classList.add('discard-special-wild');
}

// ═══════════════════════════════════════════════════════════════
// TURN TIMER
// ═══════════════════════════════════════════════════════════════
function startTurnTimer() {
  stopTurnTimer();
  if (!G||!G.started||G.over) return;
  _turnTimerRemaining = TURN_SECONDS;
  _updateTimerUI(TURN_SECONDS);
  document.getElementById('topbar-timer').style.display = '';
  document.getElementById('hand-timer-bar').classList.add('visible');
  _turnTimerInterval = setInterval(() => {
    _turnTimerRemaining--;
    _updateTimerUI(_turnTimerRemaining);
    if (_turnTimerRemaining <= 0) { stopTurnTimer(); onTimerExpired(); }
  }, 1000);
}
function stopTurnTimer() {
  clearInterval(_turnTimerInterval); _turnTimerInterval = null;
  document.getElementById('topbar-timer').style.display = 'none';
  document.getElementById('hand-timer-bar').classList.remove('visible');
}
function _updateTimerUI(secs) {
  const timerEl=document.getElementById('topbar-timer');
  const numEl=document.getElementById('topbar-timer-num');
  const ringFg=document.getElementById('timer-ring-fg');
  const barFill=document.getElementById('hand-timer-fill');
  numEl.textContent=Math.max(0,secs);
  const frac=secs/TURN_SECONDS;
  ringFg.style.strokeDashoffset=RING_CIRC*(1-frac);
  timerEl.classList.remove('warn','crit');
  barFill.classList.remove('warn','crit');
  if (secs<=5){timerEl.classList.add('crit');barFill.classList.add('crit'); playSound('urgentTick');}
  else if (secs<=10){timerEl.classList.add('warn');barFill.classList.add('warn'); playSound('tick');}
  barFill.style.width=Math.max(0,frac*100)+'%';
}
function onTimerExpired() {
  if (!G||G.over) return;
  const curId = G.turnOrder[G.currentTurnIdx];
  if (isAiId(curId)) return;
  if (curId === MY_ID) {
    showToast("⏱ Time's up! Auto-drew.", 'fa-clock');
    if (isHost) processAction({ type:'timer_draw', playerId:MY_ID });
    else { broadcast('game_action',{type:'timer_draw',playerId:MY_ID}); renderGame(); }
  } else if (isHost) {
    processAction({ type:'timer_draw', playerId:curId });
  }
}

// ═══════════════════════════════════════════════════════════════
// AI ENGINE
// ═══════════════════════════════════════════════════════════════
function maybeScheduleAiTurn() {
  if (!isAiMode||!G||!G.started||G.over) return;
  const curId = G.turnOrder[G.currentTurnIdx];
  if (!isAiId(curId)) return;
  clearTimeout(_aiThinkTimeout);
  const thinkMs = CFG.AI_THINK_MIN + Math.random()*(CFG.AI_THINK_MAX-CFG.AI_THINK_MIN);
  renderPlayers();
  _aiThinkTimeout = setTimeout(() => { renderPlayers(); executeAiTurn(curId); }, thinkMs);
}

function executeAiTurn(aiId) {
  if (!G||G.over) return;
  const hand = G.hands[aiId] || [];
  const playable = hand.filter(c => isAiPlayable(c, G.topCard, G.topColor, G.drawStack));
  const aiName = G.players[aiId]?.name || 'AI';
  const personality = AI_PERSONALITIES[aiName] || AI_PERSONALITIES.Blaze;

  if (playable.length === 0) {
    processAction({ type:'draw_card', playerId:aiId });
    if (hand.length === 1) {
      setTimeout(() => {
        showToast(`${aiName}: ${personality.unoTaunt}`,'fa-robot',3500);
        addLog(`${aiName} shouted UNO!`,'log-ai');
        renderLog();
      }, 400);
    }
    return;
  }

  // Personality-driven card selection
  let chosen = null;
  const actionValues = ['skip','reverse','draw2','wild4'];

  if (personality.style === 'aggressive') {
    for (const v of ['wild4','draw2','skip','reverse']) {
      const f=playable.find(c=>c.value===v); if(f){chosen=f;break;}
    }
  } else if (personality.style === 'troll') {
    chosen = playable[Math.floor(Math.random()*playable.length)];
  } else {
    for (const v of actionValues) { const f=playable.find(c=>c.value===v&&c.color===G.topColor); if(f){chosen=f;break;} }
    if (!chosen) chosen = playable.find(c=>c.color===G.topColor);
    if (!chosen) chosen = playable.find(c=>c.value===G.topCard.value);
  }
  if (!chosen) chosen = playable.find(c=>c.color==='black');
  if (!chosen) chosen = playable[0];

  let chosenColor = null;
  if (chosen.color === 'black') {
    const cc={red:0,blue:0,green:0,yellow:0};
    for(const c of hand) if(CARD_COLORS.includes(c.color)) cc[c.color]++;
    chosenColor = Object.entries(cc).sort((a,b)=>b[1]-a[1])[0][0];
  }

  // UNO shout on 2-card hand
  if (hand.length === 2) {
    setTimeout(() => {
      showToast(`${aiName}: ${personality.unoTaunt}`,'fa-robot',3500);
      playSound('uno');
      addLog(`${aiName} shouted UNO!`,'log-ai');
      renderLog();
    }, 400);
  }

  // Groq AI taunts — fire-and-forget, 25% chance on action cards or low hand
  const isActionCard = ['skip','reverse','draw2','wild4','wild','command'].includes(chosen.value);
  const isLowHand = hand.length <= 3;
  const shouldTaunt = CFG.GROQ_API_KEY && (isActionCard ? Math.random() < 0.55 : Math.random() < 0.18 || isLowHand);
  if (shouldTaunt) {
    generateGroqUnoTaunt(aiName, personality.style, chosen, hand.length, chosenColor).then(taunt => {
      if (taunt && G && !G.over) {
        addChatMessage({ playerId:aiId, name:aiName }, null, false,
          `<span class="chat-msg-name" style="color:var(--ai-color);">${aiName}:</span><span class="chat-msg-text"> ${taunt}</span>`
        );
      }
    }).catch(()=>{
      // Silent fallback to static taunts
      if (Math.random() < 0.4 && personality.taunts) {
        const t = personality.taunts[Math.floor(Math.random()*personality.taunts.length)];
        setTimeout(() => addChatMessage({ playerId:aiId, name:aiName }, null, false,
          `<span class="chat-msg-name" style="color:var(--ai-color);">${aiName}:</span><span class="chat-msg-text"> ${t}</span>`
        ), 600);
      }
    });
  } else if (Math.random() < 0.12 && personality.taunts) {
    // Static fallback when Groq not configured
    const taunt = personality.taunts[Math.floor(Math.random()*personality.taunts.length)];
    setTimeout(() => addChatMessage({ playerId:aiId, name:aiName }, null, false,
      `<span class="chat-msg-name" style="color:var(--ai-color);">${aiName}:</span><span class="chat-msg-text"> ${taunt}</span>`
    ), 600);
  }

  playSound('play');
  processAction({ type:'play_card', playerId:aiId, card:chosen, chosenColor });
}

// ═══════════════════════════════════════════════════════════════
// LOCAL ACTIONS
// ═══════════════════════════════════════════════════════════════
function selectCard(idx) {
  if (!isMyTurn()) { showToast('Not your turn!','fa-hourglass-half'); return; }
  const card = G.myHand[idx];

  if (houseRules.multistack && selectedIndices.length > 0) {
    // Try to add to stack
    const alreadySelected = selectedIndices.indexOf(idx);
    if (alreadySelected !== -1) {
      selectedIndices.splice(alreadySelected,1);
    } else {
      const baseCard = G.myHand[selectedIndices[0]];
      if (card.value === baseCard.value && CARD_COLORS.includes(card.color) && CARD_COLORS.includes(baseCard.color)) {
        if (!selectedIndices.includes(idx)) selectedIndices.push(idx);
      } else {
        // Switch to this card only
        selectedIndices = [idx];
      }
    }
  } else {
    selectedIndices = selectedIndices[0] === idx ? [] : [idx];
  }

  renderHand();
  const hasSelected = selectedIndices.length > 0;
  document.getElementById('play-btn').disabled = !hasSelected;
  document.getElementById('play-btn-count').style.display = selectedIndices.length > 1 ? '' : 'none';
  document.getElementById('play-btn-count').textContent = ` (${selectedIndices.length})`;

  const stackBar = document.getElementById('stack-mode-indicator');
  stackBar.style.display = selectedIndices.length > 0 && houseRules.multistack ? '' : 'none';
  document.getElementById('stack-count-badge').textContent = selectedIndices.length;
}

function playSelected() {
  if (selectedIndices.length === 0 || !isMyTurn()) return;
  const cards = selectedIndices.map(i => G.myHand[i]);

  // Command card is always playable — open its modal immediately
  if (cards.length === 1 && cards[0].value === 'command') {
    document.getElementById('command-card-inp').value = '';
    document.getElementById('command-modal').classList.add('show');
    return;
  }

  // Check all cards are playable
  const firstCard = cards[0];
  if (!isPlayable(firstCard)) {
    const el = document.querySelector('.card-img-wrap.selected');
    if (el) { el.classList.add('card-invalid-shake'); setTimeout(()=>el.classList.remove('card-invalid-shake'),450); }
    showToast("Can't play that card right now!",'fa-ban');
    return;
  }

  if (cards.length === 1 && firstCard.color === 'black' && firstCard.value !== 'command') {
    document.getElementById('color-modal').classList.add('show');
    return;
  }

  // 7-swap
  if (cards.length === 1 && firstCard.value === '7' && houseRules.seven) {
    openSwapModal();
    return;
  }

  executePlay(cards, null);
}

function executePlay(cards, chosenColor, swapTargetId=null, commandText=null) {
  clearTimeout(_aiThinkTimeout);
  stopTurnTimer();
  const indices = [...selectedIndices].sort((a,b)=>b-a);
  for (const i of indices) G.myHand.splice(i,1);
  if (G.hands[MY_ID]) G.hands[MY_ID] = [...G.myHand];
  selectedIndices = [];
  document.getElementById('stack-mode-indicator').style.display = 'none';
  playSound('play');
  if (G.myHand.length === 1) setTimeout(()=>showToast('1 card left — shout UNO!','fa-exclamation'),200);

  // If this is a command card, show the command text toast immediately to local player
  if (commandText) {
    showToast(`🃏 Command: ${commandText}`, 'fa-bolt', 5000);
    showCardEffect('command', 'COMMAND!');
  }

  const payload = {
    type: commandText ? 'command_card' : (cards.length > 1 ? 'play_cards' : 'play_card'),
    playerId: MY_ID,
    cards, card: { ...cards[0], commandText },
    chosenColor, swapTargetId,
  };
  // Show combo if 3+ cards played
  if (cards.length >= 3) setTimeout(() => showCombo(cards.length), 300);
  if (isHost) processAction(payload);
  else { broadcast('game_action', payload); renderGame(); _afterTurnSetup(); }
}

function drawCardAction() {
  if (!isMyTurn()) { showToast('Not your turn!','fa-hourglass-half'); return; }
  if (G) { G._noDrawThisGame = false; G._drawCount = (G._drawCount||0)+1; }
  clearTimeout(_aiThinkTimeout);
  stopTurnTimer();
  selectedIndices = [];
  playSound('draw');
  if (isHost) processAction({ type:'draw_card', playerId:MY_ID });
  else { broadcast('game_action',{type:'draw_card',playerId:MY_ID}); renderGame(); _afterTurnSetup(); }
}

function pickColor(color) {
  document.getElementById('color-modal').classList.remove('show');
  if (selectedIndices.length === 0 || !G.myHand[selectedIndices[0]]) return;
  const cards = selectedIndices.map(i=>G.myHand[i]);
  executePlay(cards, color);
}

function openSwapModal() {
  const list = document.getElementById('swap-player-list');
  list.innerHTML = '';
  G.turnOrder.forEach(id => {
    if (id === MY_ID) return;
    const p = G.players[id];
    const btn = document.createElement('button');
    btn.className = 'btn btn-secondary';
    btn.style.marginBottom = '8px';
    btn.innerHTML = `<i class="fas fa-exchange-alt"></i> ${p.name} (${p.cardCount} cards)`;
    btn.addEventListener('click', () => {
      document.getElementById('swap-modal').classList.remove('show');
      const cards = selectedIndices.map(i=>G.myHand[i]);
      executePlay(cards, null, id);
    });
    list.appendChild(btn);
  });
  document.getElementById('swap-modal').classList.add('show');
}

function shoutUno() {
  if (!G||!G.myHand) return;
  if (G.myHand.length === 1) {
    showToast('UNO! Nice call!','fa-bullhorn');
    playSound('uno');
    broadcast('game_action',{type:'uno_shout',playerId:MY_ID});
    if (isHost) addLog(`${G.players[MY_ID]?.name} shouted UNO!`,'log-warn');
    try { progressChallenge('unoShouts', 1); } catch(e){}
  } else {
    showToast(`You have ${G.myHand.length} cards — not UNO yet!`,'fa-times-circle');
  }
}

function closeWinModal() {
  document.getElementById('win-modal').classList.remove('show');
  stopTurnTimer();
  if (isAiMode) {
    G.over = false;
    showScreen('screen-lobby');
    document.getElementById('lobby-room-box').style.display = '';
    document.getElementById('lobby-waiting-box').style.display = 'none';
    isAiMode = false;
    return;
  }
  G.over = false;
  showScreen('screen-lobby');
  document.getElementById('lobby-room-box').style.display = 'none';
  document.getElementById('lobby-waiting-box').style.display = '';
  if (isHost) {
    document.getElementById('btn-start-game').style.display = '';
    document.getElementById('lobby-waiting-msg').style.display = 'none';
    document.getElementById('room-code-display').style.display = '';
    document.getElementById('room-code-text').textContent = roomCode;
  }
  updateLobbyUI();
}

// ═══════════════════════════════════════════════════════════════
// IN-GAME CHAT
// ═══════════════════════════════════════════════════════════════
function initChatPanel() {
  chatUnreadCount = 0;
  document.getElementById('chat-messages').innerHTML = '';
  addChatMessage(null, 'Game started! Good luck 🎮', true);
  // Inject emote bar after short delay (panel needs to be visible)
  setTimeout(() => {
    if (document.getElementById('emote-bar')) document.getElementById('emote-bar').remove();
    const chatPanel = document.getElementById('chat-panel');
    if (!chatPanel) return;
    const bar = document.createElement('div');
    bar.id = 'emote-bar';
    bar.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;padding:5px 8px;border-top:1px solid rgba(255,255,255,.06);background:rgba(0,0,0,.2);';
    const data = getShopData();
    const baseEmotes = ['😂','🔥','😈','🤯','💀','🎉','😤','🤖','🌀','⚡'];
    const bonusEmotes = ['🗿','💅','😎','🫡','🧠','🦾','👑','🎯','😭','🤡'];
    const emotes = data['pk_emotes'] ? [...baseEmotes, ...bonusEmotes] : baseEmotes;
    emotes.forEach(e => {
      const btn = document.createElement('button');
      btn.textContent = e;
      btn.title = e;
      btn.style.cssText = 'background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);border-radius:7px;padding:3px 5px;font-size:15px;cursor:pointer;transition:transform .15s;line-height:1;';
      btn.onmouseover = ()=>btn.style.transform='scale(1.25)';
      btn.onmouseout  = ()=>btn.style.transform='scale(1)';
      btn.onclick = () => {
        if (isAiMode) {
          addChatMessage(MY_ID, e, false);
          if (Math.random() < 0.3) {
            const aiId = G?.turnOrder?.find(id=>isAiId(id));
            if (aiId) {
              const responses = ['😂','🔥 watch out','💀 rip','🤖 calculating...','👑 too easy'];
              setTimeout(()=>addChatMessage(aiId, responses[Math.floor(Math.random()*responses.length)], false), 900+Math.random()*800);
            }
          }
        } else {
          broadcast('chat_msg', { senderId: MY_ID, senderName: MY_NAME, text: e });
          addChatMessage(MY_ID, e, false);
        }
      };
      bar.appendChild(btn);
    });
    // Insert before the chat send row
    const sendBtn = chatPanel.querySelector('#chat-send');
    const sendRow = sendBtn?.parentElement;
    if (sendRow) sendRow.before(bar);
    else chatPanel.appendChild(bar);
  }, 400);
}

function toggleChat() {
  chatOpen = !chatOpen;
  const panel = document.getElementById('chat-panel');
  const chevron = document.getElementById('chat-chevron');
  if (chatOpen) {
    panel.classList.remove('collapsed');
    chevron.innerHTML = '<i class="fas fa-chevron-down"></i>';
    chatUnreadCount = 0;
    document.getElementById('chat-unread').classList.remove('show');
    document.getElementById('chat-unread').textContent = '0';
  } else {
    panel.classList.add('collapsed');
    chevron.innerHTML = '<i class="fas fa-chevron-up"></i>';
  }
}

function sendChatMessage() {
  const inp = document.getElementById('chat-inp');
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  const payload = { playerId: MY_ID, name: MY_NAME, text };
  broadcast('chat_msg', payload);
  addChatMessage(payload, null, false);
}

function receiveChatMessage(payload) {
  if (payload.playerId === MY_ID) return; // we already rendered ours
  addChatMessage(payload, null, false);
  if (!chatOpen) {
    chatUnreadCount++;
    const badge = document.getElementById('chat-unread');
    badge.textContent = chatUnreadCount;
    badge.classList.add('show');
  }
}

function addChatMessage(payload, systemText, isSystem, rawHtml) {
  const container = document.getElementById('chat-messages');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'chat-msg';
  if (rawHtml) {
    el.innerHTML = rawHtml;
  } else if (isSystem) {
    el.innerHTML = `<span class="chat-msg-system">${systemText}</span>`;
  } else {
    const isMe = payload.playerId === MY_ID;
    el.innerHTML = `<span class="chat-msg-name ${isMe?'is-me':''}">${payload.name}:</span><span class="chat-msg-text">${escapeHtml(payload.text)}</span>`;
  }
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ═══════════════════════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════════════════════
function renderGame() {
  if (!G||!G.started) return;
  const curScreen = document.querySelector('.screen.active')?.id;
  if (curScreen !== 'screen-uno') showScreen('screen-uno');
  renderPlayers();
  renderDiscardPile();
  renderHand();
  renderLog();
  renderTurnState();
  updateActiveColorLabel();
  updateDrawStackBadge();
  document.getElementById('uno-round').textContent = G.round||1;
  if (G.over && !document.getElementById('win-modal').classList.contains('show')) showWinModal(G.winner);
}

function getPlayerAvatar(id, name, size=38) {
  const isAiP = isAiId(id);
  if (isAiP) return `<i class="fas fa-robot" style="font-size:${Math.round(size*.37)}px;"></i>`;
  // Check if this player has a Discord avatar stored in lobbyPlayers
  const lp = lobbyPlayers[id];
  if (lp?.avatar_url) {
    return `<img src="${lp.avatar_url}" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;display:block;" onerror="this.outerHTML='<span style=\\'font-size:${Math.round(size*.44)}px;font-weight:900;\\'>${(name||'?').slice(0,1).toUpperCase()}</span>'">`;
  }
  return `<span style="font-size:${Math.round(size*.44)}px;font-weight:900;">${(name||'?').slice(0,1).toUpperCase()}</span>`;
}

function renderPlayers() {
  const container = document.getElementById('uno-players');
  container.innerHTML = '';
  const myTurn = isMyTurn();
  const curTurnId = G.turnOrder[G.currentTurnIdx];
  G.turnOrder.forEach(id => {
    const p = G.players[id];
    if (!p) return;
    const chip = document.createElement('div');
    const isMe = id === MY_ID;
    const isAiP = isAiId(id);
    const isActive = id === curTurnId;
    chip.className = 'player-chip' +
      (isAiP ? ' ai-chip' : '') +
      (isMe && myTurn ? ' active-player' : '') +
      (!isMe && isActive ? ' other-active-player' : '');
    const cardCountDisplay = isMe ? G.myHand.length : (p.cardCount??0);
    const thinkingHtml = isAiP && isActive && !G.over
      ? `<div class="ai-thinking-chip"><i class="fas fa-robot" style="font-size:8px;color:var(--ai-color);"></i><span>Thinking</span><div class="ai-dots"><span></span><span></span><span></span></div></div>`
      : '';
    chip.innerHTML = `
      <div class="player-avatar" style="background:${p.color};overflow:hidden;display:flex;align-items:center;justify-content:center;">
        ${getPlayerAvatar(id, p.name, 38)}
        <div class="card-count-badge">${cardCountDisplay}</div>
      </div>
      <div class="player-name">${isMe?'You':p.name}</div>
      <div class="player-score">Score: ${p.score||0}</div>
      ${thinkingHtml}
    `;
    container.appendChild(chip);
  });
  const arrow = document.getElementById('turn-arrow-path');
  if (arrow) {
    if (G.direction === -1) {
      arrow.setAttribute('d','M 110 20 A 90 90 0 0 0 20 110');
    } else {
      arrow.setAttribute('d','M 110 20 A 90 90 0 1 1 20 110');
    }
  }
}

function renderDiscardPile() {
  const pile = document.getElementById('discard-pile');
  pile.innerHTML = '';
  if (!G.topCard) return;
  const el = cardEl(G.topCard, { w:80, h:120, isDiscard:true, animate:true });
  el.classList.add('card-snap');
  pile.appendChild(el);
  setDiscardEffect(G.topCard);
}

function renderHand() {
  const hand = document.getElementById('hand-cards');
  hand.innerHTML = '';
  if (!G.myHand || isSpectator) return;
  G.myHand.forEach((card,i) => {
    const el = cardEl(card, { w:52, h:78, idx:i, inHand:true });
    el.style.animationDelay = `${i*0.03}s`;
    // Drag support
    if (isMyTurn()) {
      el.setAttribute('draggable', 'true');
      el.addEventListener('dragstart', (e) => onCardDragStart(e, i));
      el.addEventListener('dragend',   onCardDragEnd);
    }
    hand.appendChild(el);
  });
  document.getElementById('play-btn').disabled = selectedIndices.length === 0;
  setupDropZone();
}

function renderLog() {
  const log = document.getElementById('game-log');
  if (!G.log) return;
  log.innerHTML = G.log.slice(-6).map(e=>`<div class="log-entry ${e.cls||''}">${e.text}</div>`).join('');
}

function renderTurnState() {
  const ind = document.getElementById('turn-indicator');
  const curId = G.turnOrder[G.currentTurnIdx];
  const isAiTurn = isAiId(curId);
  const spectatorEl = document.getElementById('spectator-indicator');

  if (isSpectator) {
    ind.style.display = 'none';
    spectatorEl.style.display = '';
    document.getElementById('hand-cards').style.display = 'none';
    document.getElementById('action-bar')?.classList.add('hidden');
    return;
  }

  if (isMyTurn()) {
    ind.innerHTML = `<i class="fas fa-bolt"></i> ${G.drawStack>0?`Draw ${G.drawStack} or stack!`:'Your turn!'}`;
    ind.className = 'turn-indicator is-your-turn';
  } else if (isAiTurn) {
    ind.innerHTML = `<i class="fas fa-robot"></i> ${currentTurnName()} is thinking…`;
    ind.className = 'turn-indicator';
  } else {
    ind.innerHTML = `<i class="fas fa-hourglass-half"></i> ${currentTurnName()}'s turn…`;
    ind.className = 'turn-indicator';
  }
}

function updateActiveColorLabel() {
  const lbl = document.getElementById('active-color-label');
  if (!G||!G.topColor) { lbl.innerHTML=''; return; }
  lbl.innerHTML = `<span class="active-color-dot" style="background:${COLOR_DOT[G.topColor]};"></span>`;
}

function updateDrawStackBadge() {
  const badge = document.getElementById('draw-stack-badge');
  if (G && G.drawStack > 0) {
    badge.style.display = '';
    badge.textContent = `+${G.drawStack}`;
  } else {
    badge.style.display = 'none';
  }
}

function updatePlayerChips() { if(G&&G.started) renderPlayers(); }

function showWinModal(winnerId) {
  const p = G.players[winnerId];
  const isMe = winnerId === MY_ID;
  const isAiWinner = isAiId(winnerId);
  const icon = document.getElementById('win-icon');
  icon.className = isMe ? 'fas fa-trophy win-icon' : (isAiWinner?'fas fa-robot win-icon':'fas fa-star win-icon');
  icon.style.color = isMe ? 'var(--uno-yellow)' : (isAiWinner?'var(--ai-color)':'#a78bfa');
  document.getElementById('win-title').textContent   = isMe?'You Win! 🎉':`${p?.name||'Player'} Wins!`;
  document.getElementById('win-subtitle').textContent = isMe?'Great play!':(isAiWinner?'The AI beat you this time!':'Better luck next round!');

  // Award shards
  const shardsEl = document.getElementById('win-shards-earned');
  const shardsNum = document.getElementById('win-shards-num');
  let earned = 0;
  if (shardsEl && shardsNum) {
    if (isMe) {
      earned = isAiMode ? 20 : 50;
      // 2× shards perk
      const shopData = getShopData();
      if (shopData['pk_xp2'] > 0) {
        earned *= 2;
        shopData['pk_xp2']--;
        if (shopData['pk_xp2'] <= 0) delete shopData['pk_xp2'];
        saveShopData(shopData);
      }
    } else {
      earned = 5;
    }
    shardsEl.style.display = '';
    shardsNum.textContent = earned;
    addShards(earned, isMe ? 'Win Bonus!' : 'Participation');
  }

  // Record game result + show streak
  const duration = _gameStartTime ? Math.round((Date.now() - _gameStartTime) / 1000) : 0;
  const playerNames = G.turnOrder.map(id => G.players[id]?.name || id).join(', ');
  recordGameResult(isMe, earned, duration, G.players[winnerId]?.name || 'Unknown', playerNames, isAiMode);

  // Show win streak
  const streak = getWinStreak();
  const streakEl = document.getElementById('win-streak-display');
  if (streakEl) {
    if (isMe && streak > 1) {
      streakEl.textContent = `🔥 ${streak} win streak!`;
      streakEl.style.display = '';
    } else {
      streakEl.style.display = 'none';
    }
  }

  // Show rematch button for host in AI mode
  const rematchBtn = document.getElementById('win-rematch-btn');
  if (rematchBtn) rematchBtn.style.display = (isHost && isAiMode) ? '' : 'none';

  document.getElementById('win-modal').classList.add('show');
  // Check if new shop items are now affordable
  setTimeout(checkShopAffordability, 1200);

  // ── PROGRESSION & CHALLENGES ──
  try {
    const prog = getProgData();
    prog.wins = (prog.wins||0) + (isMe?1:0);
    if (isMe && selectedDifficulty === 'hard') prog.beatenHardAi = (prog.beatenHardAi||0)+1;
    saveProgData(prog);
    if (isMe) {
      const baseXP = isAiMode ? 30 : 80;
      const streakBonus = Math.min(streak, 5) * 10;
      awardXP(baseXP + streakBonus, isAiMode ? '🤖 AI Win' : '🏆 Win');
      progressChallenge('wins', 1);
      progressChallenge('gamesPlayed', 1);
      if (selectedDifficulty === 'hard') progressChallenge('hardAiWin', 1);
      if (G._noDrawThisGame) progressChallenge('noDrawWin', 1);
      // XP display in win modal
      setTimeout(() => {
        const existing = document.querySelector('.xp-earned-display');
        if (existing) existing.remove();
        const xpDiv = document.createElement('div');
        xpDiv.className = 'xp-earned-display';
        xpDiv.style.cssText = 'background:rgba(129,140,248,.1);border:1px solid rgba(129,140,248,.25);border-radius:12px;padding:8px 16px;margin:6px 0;font-family:"Fredoka One",cursive;font-size:16px;color:#a5b4fc;text-align:center;';
        xpDiv.innerHTML = `⬆️ +${baseXP+streakBonus} XP &nbsp;·&nbsp; Lv.${getLevelFromXP(getTotalXP())}`;
        const shardDiv = document.getElementById('win-shards-earned');
        if (shardDiv) shardDiv.after(xpDiv);
      }, 100);
    } else {
      awardXP(10, 'Participation');
      progressChallenge('gamesPlayed', 1);
    }
  } catch(e) { console.warn('Progression error:', e); }
}

// ═══════════════════════════════════════════════════════════════
// TRUTH OR DARE
// ═══════════════════════════════════════════════════════════════
const TRUTHS = [
  "What's the most embarrassing thing you've texted to the wrong person?",
  "Have you ever lied to get out of plans with a friend?",
  "What's your most irrational fear?",
  "Have you ever pretended to be sick to skip school or work?",
  "What's the pettiest thing you've ever done to get revenge?",
  "What's something you've done that you'd be mortified if your parents found out?",
  "Have you ever stalked an ex on social media? How recently?",
  "What's the most childish thing you still do?",
  "What's a secret you've never told anyone in this call?",
  "What's the most trouble you've ever been in?",
  "Have you ever ghosted someone you actually liked?",
  "What's the biggest lie you've told and gotten away with?",
  "What's a habit you have that you'd never admit in person?",
  "Who here would you most want to swap lives with for a week?",
  "What's the most cringe thing on your phone right now?",
  "Have you ever pretended to not see someone in public to avoid them?",
  "What's the most embarrassing thing you've done on social media?",
  "What song do you know all the words to but would never admit?",
  "What's the most money you've ever spent on something you regret?",
  "Have you ever told a secret you promised to keep?",
];
const DARES = [
  "Send a compliment to the 3rd person in your contact list — right now.",
  "Speak in an accent for the next 2 rounds.",
  "Share the last song you listened to.",
  "Type your next 3 messages with your eyes closed.",
  "Change your server nickname to something embarrassing for 10 minutes.",
  "Write a 2-sentence love poem about the player to your left.",
  "Do your best impression of another player until they guess who you are.",
  "Send your most recent camera roll photo to the group.",
  "Tell everyone your most recent search history item.",
  "Sing the chorus of the last song stuck in your head.",
  "Send a voice message of you making animal sounds for 10 seconds.",
  "Read the last message you sent in your most recent chat, out loud.",
  "Do 10 jumping jacks on camera right now.",
  "Send a dramatic monologue about losing your favorite snack.",
  "Describe your fashion sense in exactly 3 words.",
];
const WILDS = [
  "Everyone must whisper everything they say for the next 2 rounds.",
  "The group votes: the player with the worst dare idea gets a penalty dare!",
  "Everyone skips their next turn — the wildcard player goes twice.",
  "Next player to laugh on camera draws 2 cards.",
  "Everyone swaps their seats (or camera angles) for the next round.",
  "The oldest player gets to create a custom truth for the current player.",
  "Silent round — nobody can speak for 60 seconds!",
  "Speed round: every player must share one embarrassing fact in 30 seconds.",
];

const todState = { players:[], currentIdx:0, round:1, spun:false };
let todAiMode = false;
const todPromptHistory = []; // tracks recent prompts to avoid repetition

function initTodWithPlayers() {
  const BG=['#818cf8','#22c55e','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
  const ids = Object.keys(lobbyPlayers);
  todState.players = ids.map((id,i) => ({
    id, name:lobbyPlayers[id]?.name||`P${i+1}`,
    color:BG[i%BG.length], score:0, spotlight:i===0,
  }));
  todState.currentIdx = 0;
  todState.round = 1;
  todState.spun = false;
  renderTod();
}

function renderTod() {
  const container = document.getElementById('tod-players');
  container.innerHTML = '';
  todState.players.forEach(p => {
    const chip = document.createElement('div');
    chip.className = `tod-player-chip${p.spotlight?' spotlight':''}`;
    chip.innerHTML = `
      <div class="tod-avatar" style="background:${p.color}">${p.name.slice(0,1).toUpperCase()}</div>
      <div class="tod-pname">${p.name}</div>
      <div class="tod-pscore"><i class="fas fa-star" style="color:var(--uno-yellow);font-size:8px;"></i> ${p.score}</div>
      ${p.spotlight?'<i class="fas fa-bullseye" style="position:absolute;top:-13px;color:var(--tod-pink);font-size:13px;animation:bounce 1s ease infinite;"></i>':''}
    `;
    container.appendChild(chip);
  });
  document.getElementById('tod-round').textContent = todState.round;
  document.getElementById('tod-choice-btns').style.display = 'none';
  document.getElementById('tod-prompt-area').innerHTML = '';
  const icon = document.getElementById('wheel-icon');
  if (icon) icon.className = 'fas fa-bullseye';
  document.getElementById('wheel-label').textContent = 'Spin!';
  todState.spun = false;
  renderTodScoreboard();
}

function renderTodScoreboard() {
  const area = document.getElementById('tod-scoreboard-area');
  if (!area) return;
  const sorted = [...todState.players].sort((a,b)=>b.score-a.score);
  area.innerHTML = `
    <div class="tod-scoreboard">
      <div class="tod-scoreboard-title"><i class="fas fa-trophy"></i> Scoreboard</div>
      ${sorted.map((p,i)=>`
        <div class="score-row">
          <span class="score-rank rank-${i+1}">${i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`}</span>
          <span class="score-name">${p.name}</span>
          <span class="score-pts">${p.score} pt${p.score!==1?'s':''}</span>
        </div>
      `).join('')}
    </div>
  `;
}

function spinWheel() {
  if (todState.spun) return;
  todState.spun = true;
  const wheel = document.getElementById('tod-wheel');
  wheel.classList.add('spinning');
  playSound('play');
  setTimeout(() => {
    wheel.classList.remove('spinning');
    const cur = todState.players[todState.currentIdx];
    const icon = document.getElementById('wheel-icon');
    if (icon) icon.className = 'fas fa-star';
    document.getElementById('wheel-label').textContent = cur.name+'!';
    document.getElementById('tod-choice-btns').style.display = 'flex';
    showToast(`${cur.name}'s turn!`,'fa-bullseye');
    if (SB) broadcast('tod_action',{type:'spin',playerName:cur.name});
  }, 900);
}

function chooseTod(type) {
  document.getElementById('tod-choice-btns').style.display = 'none';
  const cur = todState.players[todState.currentIdx];
  const useGroq = todAiMode && CFG.GROQ_API_KEY;
  document.getElementById('tod-prompt-area').innerHTML = `
    <div class="ai-thinking">
      <i class="fas fa-${useGroq ? 'robot' : 'dice'}" style="color:var(--accent2);"></i>
      <span>${useGroq ? 'AI is crafting your ' + type + '…' : 'Picking a ' + type + '…'}</span>
      <div class="ai-thinking-dots"><span></span><span></span><span></span></div>
    </div>`;
  if (useGroq) {
    generateGroqPrompt(type, cur.name).then(prompt => showPrompt(type, prompt)).catch(() => {
      // Fallback to static on error
      showPrompt(type, null);
    });
  } else {
    setTimeout(() => showPrompt(type, null), 1200);
  }
}

async function generateGroqPrompt(type, playerName) {
  const players = todState.players.map(p => p.name).join(', ');
  const round = todState.round;
  const recent = todPromptHistory.slice(-4).map(h => `"${h}"`).join(', ');
  const systemMsg = `You are the host of a fun party game of Truth or Dare being played on Discord. Keep everything PG-13 — fun, a little embarrassing but never offensive, sexual, or harmful. Be creative, specific, and vary your style. Never repeat prompts.`;
  const userMsg = `Generate ONE ${type} prompt for the player named "${playerName}". 
Players in the game: ${players}. Round: ${round}.
${recent ? `Recent prompts used (do NOT repeat these): ${recent}` : ''}
Rules:
- Truth: a question they must answer honestly. Make it personal, funny, or revealing.
- Dare: an action they must perform right now (Discord-friendly, like sending a message, making a voice, sharing a photo, etc).
- Wild: a rule or challenge that affects ALL players.
Reply with ONLY the prompt text. No labels, no quotes, no explanation.`;

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${CFG.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'llama3-8b-8192',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg },
      ],
      max_tokens: 120,
      temperature: 1.1,
    }),
  });
  if (!res.ok) throw new Error('Groq error ' + res.status);
  const data = await res.json();
  const prompt = data.choices?.[0]?.message?.content?.trim();
  if (!prompt) throw new Error('Empty response');
  todPromptHistory.push(prompt);
  if (todPromptHistory.length > 20) todPromptHistory.shift();
  return prompt;
}

// ═══════════════════════════════════════════════════════════════
// GROQ UNO AI TAUNTS
// ═══════════════════════════════════════════════════════════════
const _groqTauntCache = {}; // prevent duplicate in-flight requests per AI
async function generateGroqUnoTaunt(aiName, style, playedCard, handSize, chosenColor) {
  if (_groqTauntCache[aiName]) return null; // already has one in flight
  _groqTauntCache[aiName] = true;
  try {
    const cardDesc = playedCard.color === 'black'
      ? `${playedCard.value === 'wild4' ? 'Wild +4' : 'Wild'} (chose ${chosenColor})`
      : `${playedCard.color} ${VALUE_LABEL[playedCard.value] || playedCard.value}`;
    const playerName = G?.players[MY_ID]?.name || 'the human';
    const styleDesc = style === 'aggressive' ? 'aggressive and competitive' : style === 'troll' ? 'chaotic troll, sarcastic and unpredictable' : 'calculating and strategic';
    const systemMsg = `You are ${aiName}, an AI playing UNO. Your personality is ${styleDesc}. You speak in short punchy chat messages — max 12 words, no emojis unless it really fits. Stay in character. PG-13 only.`;
    const context = handSize === 1
      ? `You just played your last card and won!`
      : handSize <= 2
      ? `You just played ${cardDesc} and only have ${handSize} card${handSize===1?'':'s'} left.`
      : `You just played ${cardDesc} against ${playerName}.`;
    const userMsg = `${context} Write a single in-character reaction. No quotes, no labels, just the message.`;

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CFG.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          { role: 'system', content: systemMsg },
          { role: 'user', content: userMsg },
        ],
        max_tokens: 40,
        temperature: 1.2,
      }),
    });
    if (!res.ok) throw new Error('Groq ' + res.status);
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } finally {
    // Allow next taunt after a cooldown
    setTimeout(() => { delete _groqTauntCache[aiName]; }, 4000);
  }
}

function showPrompt(type, aiPrompt) {
  const arr = type==='truth'?TRUTHS:type==='dare'?DARES:WILDS;
  const prompt = aiPrompt || arr[Math.floor(Math.random()*arr.length)];
  const area = document.getElementById('tod-prompt-area');
  const iconHtml = type==='truth'?'<i class="fas fa-comment"></i> Truth':type==='dare'?'<i class="fas fa-fire"></i> Dare':'<i class="fas fa-bolt"></i> Wild Card';
  const aiTag = aiPrompt ? ' <span style="font-size:9px;background:rgba(129,140,248,.2);border:1px solid rgba(129,140,248,.3);border-radius:6px;padding:1px 6px;color:var(--ai-color);font-family:Nunito,sans-serif;font-weight:800;letter-spacing:.08em;vertical-align:middle;"><i class="fas fa-robot" style="font-size:7px;"></i> AI</span>' : '';
  area.innerHTML = `
    <div class="prompt-card ${type}-card card-play-anim">
      <div class="prompt-type">${iconHtml}${aiTag}</div>
      <div class="prompt-text">${prompt}</div>
      <div class="prompt-actions">
        <button class="prompt-action-btn btn-complete" id="tod-complete-btn">
          <i class="fas fa-check"></i> Done!
        </button>
        <button class="prompt-action-btn btn-skip" id="tod-skip-btn">
          <i class="fas fa-forward"></i> Skip (−1 pt)
        </button>
      </div>
    </div>`;
  document.getElementById('tod-complete-btn').addEventListener('click', completePrompt);
  document.getElementById('tod-skip-btn').addEventListener('click', skipPrompt);
}

function completePrompt() {
  const p = todState.players[todState.currentIdx];
  p.score += 1;
  showToast(`${p.name} completed it! +1`,'fa-check-circle');
  playSound('play');
  advanceTod();
}
function skipPrompt() {
  const p = todState.players[todState.currentIdx];
  p.score = Math.max(0,(p.score||0)-1);
  showToast('Skipped! −1 pt','fa-forward');
  advanceTod();
}
function advanceTod() {
  todState.players.forEach(p=>p.spotlight=false);
  todState.currentIdx = (todState.currentIdx+1)%todState.players.length;
  if (todState.currentIdx===0) todState.round++;
  todState.players[todState.currentIdx].spotlight=true;
  setTimeout(()=>renderTod(),700);
}
function applyTodAction(payload) {
  if (payload.type==='start_tod'&&!isHost) { initTodWithPlayers(); showScreen('screen-tod'); }
}

// ═══════════════════════════════════════════════════════════════
// SCREEN MANAGER
// ═══════════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s=>s.classList.remove('active'));
  document.getElementById(id)?.classList.add('active');
  window.scrollTo(0,0);
  // Show/hide shard HUD
  const shardHud = document.getElementById('shard-hud');
  if (shardHud) {
    shardHud.style.display = (id === 'screen-launcher' || id === 'screen-lobby-browser') ? 'none' : '';
  }
  // Restart/stop floaters based on screen
  if (id === 'screen-launcher') {
    document.querySelectorAll('.card-floater').forEach(f=>f.remove()); // remove old
    setTimeout(startCardFloaters, 500);
  } else {
    document.querySelectorAll('.card-floater').forEach(f=>f.remove());
  }
}

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
let _toastTimer;
function showToast(msg, iconClass='fa-info-circle', ms=2800) {
  const t = document.getElementById('toast');
  t.innerHTML = `<i class="fas ${iconClass}"></i> ${msg}`;
  t.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(()=>t.classList.remove('show'), ms);
}

// ═══════════════════════════════════════════════════════════════
// DISCORD SDK
// ═══════════════════════════════════════════════════════════════
async function tryInitDiscordSdk() {
  if (!CFG.DISCORD_CLIENT_ID) return null;
  try {
    const { DiscordSDK } = await import('./.proxy/esm.sh/@discord/embedded-app-sdk@1');
    discordSdk = new DiscordSDK(CFG.DISCORD_CLIENT_ID);
    await discordSdk.ready();

    // ── Activity Auth: no OAuth redirects inside the Activity iframe ──
    // authenticate() gives us a scoped access token without any page navigation.
    await discordSdk.commands.authenticate({
      client_id: CFG.DISCORD_CLIENT_ID,
      response_type: 'code',
      state: '',
      prompt: 'none',
      scope: ['identify', 'guilds.members.read'],
    }).catch(() => {});

    // Get user identity directly from the SDK
    let sdkUser = null;
    try { sdkUser = await discordSdk.commands.getUser(); } catch(e) {}

    if (sdkUser && sdkUser.id) {
      const dcUser = {
        discord_id: sdkUser.id,
        username: sdkUser.username + (sdkUser.discriminator && sdkUser.discriminator !== '0' ? '#' + sdkUser.discriminator : ''),
        avatar_url: sdkUser.avatar
          ? `https://cdn.discordapp.com/avatars/${sdkUser.id}/${sdkUser.avatar}.webp?size=128`
          : `https://cdn.discordapp.com/embed/avatars/${parseInt(sdkUser.id) % 5}.png`,
      };
      saveDiscordUser(dcUser);
      if (!MY_NAME) MY_NAME = dcUser.username.split('#')[0];
      await syncUserWithSupabase(dcUser);
      updateDiscordProfileUI(dcUser);
      showToast(`Welcome, ${dcUser.username}! 👋`, 'fa-check-circle', 3000);
      const authModal = document.getElementById('auth-modal');
      if (authModal) authModal.classList.remove('show');
    }
    return discordSdk;
  } catch(e) { console.log('Discord SDK not available:', e?.message || e); return null; }
}

// ═══════════════════════════════════════════════════════════════
// EVENT WIRING
// ═══════════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', () => {
  const wire = (sel,fn) => document.querySelector(sel)?.addEventListener('click',fn);

  // Launcher
  document.querySelectorAll('.activity-card.uno-card').forEach(el=>el.addEventListener('click',()=>openLobby('uno')));
  document.querySelectorAll('.activity-card.tod-card').forEach(el=>el.addEventListener('click',()=>openLobby('tod')));
  document.querySelectorAll('.uno-card .launch-btn').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();openLobby('uno');}));
  document.querySelectorAll('.tod-card .launch-btn').forEach(el=>el.addEventListener('click',e=>{e.stopPropagation();openLobby('tod');}));

  // Lobby browser
  wire('#browser-back-btn', ()=>showScreen('screen-launcher'));
  wire('#browser-refresh-btn', refreshLobbyBrowser);
  wire('#browser-create-btn', ()=>{ createRoom(); });

  // Browser AI quick launch
  wire('#browser-play-ai-btn', () => {
    const type = document.getElementById('ai-game-type-select').value;
    gameType = type;
    if (type === 'tod') {
      startAiTod();
    } else {
      const count = parseInt(document.getElementById('browser-ai-count').value, 10) || 2;
      document.getElementById('ai-count-select').value = String(count);
      startAiGame();
    }
  });
  document.getElementById('ai-game-type-select')?.addEventListener('change', () => {
    const isTod = document.getElementById('ai-game-type-select').value === 'tod';
    document.getElementById('ai-opponent-count-wrap').style.display = isTod ? 'none' : '';
    document.getElementById('browser-play-ai-btn').innerHTML = isTod
      ? '<i class="fas fa-bullseye"></i> Start Truth or Dare'
      : '<i class="fas fa-robot"></i> Play vs AI';
  });
  document.getElementById('browser-inp-name')?.addEventListener('input', () => {
    const v = document.getElementById('browser-inp-name').value.trim();
    document.getElementById('browser-confirm-name').disabled = v.length < 1;
  });
  wire('#browser-confirm-name', () => {
    MY_NAME = document.getElementById('browser-inp-name').value.trim();
    if (!MY_NAME) return;
    document.getElementById('browser-name-box').style.display = 'none';
    document.getElementById('browser-room-section').style.display = 'flex';
    refreshLobbyBrowser();
  });
  document.getElementById('browser-inp-name')?.addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('browser-confirm-name').click(); });

  // Join by code (lobby browser)
  document.getElementById('browser-join-code-inp')?.addEventListener('input', () => {
    const el = document.getElementById('browser-join-code-inp');
    el.value = el.value.toUpperCase();
    document.getElementById('browser-join-code-btn').disabled = el.value.trim().length < 3;
  });
  document.getElementById('browser-join-code-inp')?.addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('browser-join-code-btn').click(); });
  wire('#browser-join-code-btn', () => {
    const code = document.getElementById('browser-join-code-inp').value.trim().toUpperCase();
    if (code.length < 3) { showToast('Enter a room code first','fa-exclamation-triangle'); return; }
    joinLobbyFromBrowser(code, false);
  });

  // Lobby waiting room
  wire('#lobby-back-btn', leaveLobby);
  wire('#btn-start-game', startGame);
  wire('#btn-play-ai', startAiGame);
  wire('#btn-join', () => {
    const code = document.getElementById('inp-room-code').value.trim().toUpperCase();
    if (code.length < 3) { showToast('Enter a room code first','fa-exclamation-triangle'); return; }
    roomCode = code; isHost = false; isAiMode = false; isSpectator = false;
    _enterRoom();
  });

  // AI mode toggle
  const aiToggle = document.getElementById('ai-mode-toggle');
  aiToggle?.addEventListener('change', () => {
    const on = aiToggle.checked;
    document.getElementById('ai-count-row').style.display = on?'':'none';
    document.getElementById('btn-play-ai').style.display = on?'':'none';
  });

  // House rules
  ['rule-stack2','rule-seven','rule-zero','rule-multistack'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', onHouseRuleChange);
  });

  // Back buttons in game
  wire('#uno-leave-btn', confirmLeaveGame);
  wire('#tod-back-btn', ()=>{ if(confirm('Leave Truth or Dare?')) leaveLobby(); });

  // UNO buttons
  wire('#play-btn', playSelected);
  wire('#uno-shout-btn', shoutUno);
  wire('#draw-pile-btn', drawCardAction);

  // Color picker
  document.querySelectorAll('.color-pick-btn').forEach(btn => {
    const colorMap={'cpb-red':'red','cpb-blue':'blue','cpb-yellow':'yellow','cpb-green':'green'};
    for(const [cls,color] of Object.entries(colorMap)) {
      if(btn.classList.contains(cls)){ btn.addEventListener('click',()=>pickColor(color)); break; }
    }
  });

  // Command card modal
  wire('#command-card-cancel', () => {
    document.getElementById('command-modal').classList.remove('show');
    selectedIndices = [];
    renderHand();
    document.getElementById('play-btn').disabled = true;
  });
  wire('#command-card-confirm', () => {
    const text = document.getElementById('command-card-inp').value.trim();
    if (!text) { showToast('Enter a command first!','fa-exclamation-triangle'); return; }
    document.getElementById('command-modal').classList.remove('show');
    if (selectedIndices.length === 0) return;
    const cards = selectedIndices.map(i=>G.myHand[i]);
    executePlay(cards, null, null, text);
  });
  document.getElementById('command-card-inp')?.addEventListener('keydown', e=>{ if(e.key==='Enter'&&!e.shiftKey) document.getElementById('command-card-confirm').click(); });

  // Win modal
  wire('#win-modal-btn', closeWinModal);
  wire('#win-rematch-btn', doRematch);

  // ToD
  wire('#tod-wheel', spinWheel);
  document.querySelectorAll('.tod-truth-btn').forEach(b=>b.addEventListener('click',()=>chooseTod('truth')));
  document.querySelectorAll('.tod-dare-btn').forEach(b=>b.addEventListener('click',()=>chooseTod('dare')));
  document.querySelectorAll('.tod-wild-btn').forEach(b=>b.addEventListener('click',()=>chooseTod('wild')));

  // Chat
  wire('#chat-toggle', toggleChat);
  wire('#chat-send', sendChatMessage);
  document.getElementById('chat-inp')?.addEventListener('keydown', e=>{ if(e.key==='Enter') sendChatMessage(); });

  // Swap modal close on backdrop
  document.getElementById('swap-modal')?.addEventListener('click', e=>{ if(e.target===document.getElementById('swap-modal')) document.getElementById('swap-modal').classList.remove('show'); });

  // Room code input
  document.getElementById('inp-room-code')?.addEventListener('input', () => {
    const el=document.getElementById('inp-room-code');
    el.value=el.value.toUpperCase();
  });
  document.getElementById('inp-room-code')?.addEventListener('keydown', e=>{ if(e.key==='Enter') document.getElementById('btn-join').click(); });
});

// ═══════════════════════════════════════════════════════════════
// SHARDS ECONOMY
// ═══════════════════════════════════════════════════════════════
const SHARDS_KEY = 'nixai_shards_v1';
const SHOP_KEY   = 'nixai_shop_v1';
function getShards() { try { return parseInt(localStorage.getItem(SHARDS_KEY)||'0',10); } catch(e){return 0;} }
function saveShards(n) { try { localStorage.setItem(SHARDS_KEY, String(n)); } catch(e){} }
function addShards(n, label) {
  try {
    const cur = getShards();
    const newTotal = cur + n;
    saveShards(newTotal);
    updateShardHUD();
    // Sync to cloud (fire-and-forget)
    pushShardsToCloud(newTotal).catch(()=>{});
    // Show floating reward
    const pop = document.createElement('div');
    pop.className = 'shard-reward-pop';
    pop.innerHTML = `+${n} 💎 ${label||'Shards'}`;
    pop.style.left = (Math.random()*40+30)+'%';
    pop.style.top = '45%';
    document.body.appendChild(pop);
    setTimeout(()=>pop.remove(),1800);
    // Challenge tracking for shards earned from wins/combos
    if (label && (label.includes('Win') || label.includes('win') || label.includes('Combo') || label.includes('combo'))) {
      try { progressChallenge('shardsWon', n); } catch(e){}
    }
  } catch(e){}
}
function updateShardHUD() {
  const el = document.getElementById('shard-count');
  if(el) el.textContent = getShards().toLocaleString();
}

// ═══════════════════════════════════════════════════════════════
// SHOP DATA & LOGIC
// ═══════════════════════════════════════════════════════════════
const SHOP_ITEMS = {
  cardBacks: [
    { id:'cb_default', name:'Classic', desc:'Original dark UNO back', icon:'🃏', price:0, colors:['#1e2040','#1e2040','#1e2040','#1e2040'] },
    { id:'cb_fire',    name:'Fire',    desc:'Hot red flame back',      icon:'🔥', price:120, colors:['#c0392b','#e74c3c','#e67e22','#f39c12'] },
    { id:'cb_ocean',   name:'Ocean',   desc:'Deep blue wave back',     icon:'🌊', price:120, colors:['#1a5276','#2471a3','#5dade2','#85c1e9'] },
    { id:'cb_galaxy',  name:'Galaxy',  desc:'Cosmic purple-pink back', icon:'🌌', price:200, colors:['#6c3483','#a569bd','#ec4899','#818cf8'] },
    { id:'cb_neon',    name:'Neon',    desc:'Bright cyberpunk glow',   icon:'💡', price:250, colors:['#00ff88','#00d4ff','#ff00ff','#ffff00'] },
    { id:'cb_gold',    name:'Gold',    desc:'Premium golden luxury',   icon:'✨', price:500, colors:['#d4ac0d','#f1c40f','#f9c023','#f0e68c'] },
    { id:'cb_crimson', name:'Crimson', desc:'Deep blood-red luxury',   icon:'🩸', price:180, colors:['#7f0000','#c0392b','#e74c3c','#ff6b6b'] },
    { id:'cb_ice',     name:'Ice',     desc:'Frosty arctic crystal',   icon:'🧊', price:180, colors:['#a8edea','#72c8e0','#4a9bc0','#1a6488'] },
    { id:'cb_forest',  name:'Forest',  desc:'Deep woodland emerald',   icon:'🌲', price:180, colors:['#1a4731','#2d6a4f','#52b788','#95d5b2'] },
    { id:'cb_void',    name:'Void',    desc:'Dark matter singularity', icon:'🌑', price:320, colors:['#0a0a0a','#111','#1a0533','#2d0a6e'] },
    { id:'cb_aurora',  name:'Aurora',  desc:'Northern lights shimmer', icon:'🌈', price:400, colors:['#00ff88','#00bcd4','#7c4dff','#e040fb'] },
    { id:'cb_lava',    name:'Lava',    desc:'Volcanic eruption glow',  icon:'🌋', price:300, colors:['#ff4500','#ff6b35','#ffa500','#ffcc02'] },
  ],
  perks: [
    { id:'pk_xp2',     name:'2× Shards',    desc:'Earn double shards on wins for 5 games',      icon:'💰', price:300, consumable:true },
    { id:'pk_undo',    name:'Undo Card',     desc:'Take back your last card once per game',       icon:'↩️', price:400, consumable:true },
    { id:'pk_lucky',   name:'Lucky Draw',    desc:'First card drawn each game is always playable',icon:'🍀', price:350, consumable:true },
    { id:'pk_taunt',   name:'Extra Taunts',  desc:'Unlock rare AI taunts and reactions',          icon:'😈', price:180 },
    { id:'pk_emotes',  name:'Emote Pack',    desc:'Unlock 12 extra in-game chat reactions',       icon:'😂', price:220 },
    { id:'pk_winfx',   name:'Win Effect',    desc:'Epic confetti+lightning on win',               icon:'🎆', price:350 },
    { id:'pk_xpboost', name:'XP Boost',      desc:'2× XP earned for 10 games',                   icon:'🚀', price:400, consumable:true },
  ],
  tableThemes: [
    { id:'tt_default',   name:'Dark Space',  desc:'Classic deep space bg',   icon:'🌌', price:0,   bg:'#0d0e1c' },
    { id:'tt_jungle',    name:'Jungle',      desc:'Deep green jungle vibes', icon:'🌴', price:200, bg:'linear-gradient(135deg,#0a1a0a,#0d2b0d,#112211)' },
    { id:'tt_neon_city', name:'Neon City',   desc:'Cyberpunk cityscape',     icon:'🏙️', price:300, bg:'linear-gradient(135deg,#0a001a,#001135,#001a2e)' },
    { id:'tt_sunset',    name:'Sunset',      desc:'Warm twilight orange sky',icon:'🌅', price:250, bg:'linear-gradient(135deg,#1a0800,#2a1000,#3d1800)' },
    { id:'tt_arctic',    name:'Arctic',      desc:'Frozen tundra aesthetic', icon:'❄️', price:250, bg:'linear-gradient(135deg,#021a2a,#032035,#041c35)' },
  ],
};

function getShopData() {
  try { return JSON.parse(localStorage.getItem(SHOP_KEY)||'{}'); } catch(e) { return {}; }
}
function saveShopData(d) { try { localStorage.setItem(SHOP_KEY, JSON.stringify(d)); } catch(e){} }

function showShardInfo() { openShop(); }

function openShop() {
  const modal = document.getElementById('shop-modal');
  modal.classList.add('show');
  document.getElementById('shop-shard-count').textContent = getShards().toLocaleString();
  renderShopItems();
}
function closeShop() {
  document.getElementById('shop-modal').classList.remove('show');
}

function renderShopItems() {
  const data = getShopData();
  const shards = getShards();

  // Card backs
  const backsEl = document.getElementById('shop-card-backs');
  backsEl.innerHTML = '';
  SHOP_ITEMS.cardBacks.forEach(item => {
    const owned = item.price === 0 || !!data[item.id];
    const equipped = (data.equippedCardBack || 'cb_default') === item.id;
    const canAfford = shards >= item.price;
    const el = document.createElement('div');
    el.className = 'shop-item' + (owned?' owned':'') + (equipped?' equipped':'');
    el.innerHTML = `
      ${equipped ? '<span class="shop-item-badge badge-equipped">Equipped</span>' : owned ? '<span class="shop-item-badge badge-owned">Owned</span>' : ''}
      <div class="shop-item-icon">${item.icon}</div>
      <div class="shop-item-name">${item.name}</div>
      <div class="shop-item-desc">${item.desc}</div>
      <div class="shop-item-price">${item.price===0?'Free':'💎 '+item.price}</div>
      <button class="btn ${equipped?'btn-secondary':owned?'btn-primary':'btn-danger'}" style="margin-top:6px;padding:6px 10px;font-size:11px;width:100%;" onclick="shopAction('${item.id}','cardBack')">
        ${equipped?'Equipped':owned?'Equip':canAfford?'Buy':'Need '+item.price+' 💎'}
      </button>
    `;
    el.addEventListener('mouseenter', () => previewCardBack(item));
    backsEl.appendChild(el);
  });

  // Perks
  const perksEl = document.getElementById('shop-perks');
  perksEl.innerHTML = '';
  SHOP_ITEMS.perks.forEach(item => {
    const owned = !!data[item.id];
    const canAfford = shards >= item.price;
    const el = document.createElement('div');
    el.className = 'shop-item' + (owned&&!item.consumable?' owned':'');
    el.innerHTML = `
      ${owned&&!item.consumable?'<span class="shop-item-badge badge-owned">Owned</span>':''}
      <div class="shop-item-icon">${item.icon}</div>
      <div class="shop-item-name">${item.name}</div>
      <div class="shop-item-desc">${item.desc}</div>
      <div class="shop-item-price">💎 ${item.price}</div>
      <button class="btn ${owned&&!item.consumable?'btn-secondary':'btn-danger'}" style="margin-top:6px;padding:6px 10px;font-size:11px;width:100%;" onclick="shopAction('${item.id}','perk')" ${owned&&!item.consumable?'disabled':''}>
        ${owned&&!item.consumable?'Owned':canAfford?'Buy':'Need '+item.price+' 💎'}
      </button>
    `;
    perksEl.appendChild(el);
  });

  // Table Themes section — injected after perks
  let ttSection = document.getElementById('shop-table-themes-section');
  if (!ttSection) {
    const shopBox = document.querySelector('.shop-box');
    if (shopBox) {
      ttSection = document.createElement('div');
      ttSection.id = 'shop-table-themes-section';
      const ttTitle = document.createElement('div');
      ttTitle.className = 'shop-section-title';
      ttTitle.style.marginTop = '14px';
      ttTitle.innerHTML = '<i class="fas fa-palette"></i> Table Themes';
      const ttGrid = document.createElement('div');
      ttGrid.className = 'shop-grid';
      ttGrid.id = 'shop-table-themes-grid';
      ttSection.appendChild(ttTitle);
      ttSection.appendChild(ttGrid);
      shopBox.appendChild(ttSection);
    }
  }
  const ttGrid = document.getElementById('shop-table-themes-grid');
  if (ttGrid) {
    ttGrid.innerHTML = '';
    SHOP_ITEMS.tableThemes.forEach(item => {
      const owned = item.price === 0 || !!data[item.id];
      const equipped = (data.equippedTheme||'tt_default') === item.id;
      const canAfford = shards >= item.price;
      const el = document.createElement('div');
      el.className = 'shop-item' + (owned?' owned':'') + (equipped?' equipped':'');
      el.innerHTML = `
        ${equipped?'<span class="shop-item-badge badge-equipped">Active</span>':owned?'<span class="shop-item-badge badge-owned">Owned</span>':''}
        <div class="shop-item-icon">${item.icon}</div>
        <div class="shop-item-name">${item.name}</div>
        <div class="shop-item-desc">${item.desc}</div>
        <div class="shop-item-price">${item.price===0?'Free':'💎 '+item.price}</div>
        <button class="btn ${equipped?'btn-secondary':owned?'btn-primary':'btn-danger'}" style="margin-top:6px;padding:6px 10px;font-size:11px;width:100%;" onclick="shopThemeAction('${item.id}')">
          ${equipped?'Active':owned?'Apply':canAfford?'Buy':'Need '+item.price+' 💎'}
        </button>`;
      ttGrid.appendChild(el);
    });
  }
}

function previewCardBack(item) {
  const area = document.getElementById('shop-preview-area');
  area.innerHTML = item.colors.map((c,i) => `<div class="card-color-swatch" style="background:${c};">${i+1}</div>`).join('');
}

function shopAction(itemId, type) {
  const data = getShopData();
  const shards = getShards();
  let allItems = [...SHOP_ITEMS.cardBacks, ...SHOP_ITEMS.perks];
  const item = allItems.find(x => x.id === itemId);
  if (!item) return;

  if (type === 'cardBack') {
    if (item.price === 0 || data[itemId]) {
      // Equip it
      data.equippedCardBack = itemId;
      saveShopData(data);
      pushInventoryToCloud(itemId, 'cardBack', true, 1).catch(()=>{});
      showToast(`Equipped "${item.name}" card back!`, 'fa-check');
      renderShopItems();
      document.getElementById('shop-shard-count').textContent = getShards().toLocaleString();
      return;
    }
    if (shards < item.price) { showToast('Not enough Shards!', 'fa-times-circle'); return; }
    const newShards = shards - item.price;
    saveShards(newShards);
    pushShardsToCloud(newShards).catch(()=>{});
    data[itemId] = true;
    data.equippedCardBack = itemId;
    saveShopData(data);
    pushInventoryToCloud(itemId, 'cardBack', true, 1).catch(()=>{});
    showToast(`Bought & equipped "${item.name}"! 💎`, 'fa-check-circle');
  } else {
    if (data[itemId] && !item.consumable) { showToast('Already owned!', 'fa-info-circle'); return; }
    if (shards < item.price) { showToast('Not enough Shards!', 'fa-times-circle'); return; }
    const newShards = shards - item.price;
    saveShards(newShards);
    pushShardsToCloud(newShards).catch(()=>{});
    data[itemId] = (data[itemId]||0) + 1;
    saveShopData(data);
    pushInventoryToCloud(itemId, 'perk', false, data[itemId]).catch(()=>{});
    showToast(`Bought "${item.name}"! 💎`, 'fa-check-circle');
  }
  updateShardHUD();
  renderShopItems();
  document.getElementById('shop-shard-count').textContent = getShards().toLocaleString();
}

// ═══════════════════════════════════════════════════════════════
// COMBO DISPLAY
// ═══════════════════════════════════════════════════════════════
let _comboTimeout = null;
function showCombo(cardCount) {
  if (cardCount < 3) return;
  const overlay = document.getElementById('combo-overlay');
  const label   = document.getElementById('combo-label');
  const sub     = document.getElementById('combo-sub');
  clearTimeout(_comboTimeout);
  let comboText = 'COMBO!';
  let subText   = `${cardCount} Cards!`;
  if (cardCount === 3) { comboText = 'TRIPLE!';  subText = '3 Card Combo! 🔥'; }
  else if (cardCount === 4) { comboText = 'QUAD!';    subText = '4 Card Combo! 🔥🔥'; }
  else if (cardCount >= 5) { comboText = 'INSANE!';  subText = `${cardCount}× MEGA COMBO! 🔥🔥🔥`; }
  label.textContent = comboText;
  sub.textContent   = subText;
  label.style.animation = 'none';
  label.offsetWidth; // reflow
  label.style.animation = '';
  overlay.classList.add('show');
  _comboTimeout = setTimeout(() => overlay.classList.remove('show'), 1800);
  // Bonus shards for combos
  const bonusShards = (cardCount - 2) * 3;
  addShards(bonusShards, `${cardCount}× Combo!`);
}

// ═══════════════════════════════════════════════════════════════
// DRAG & DROP
// ═══════════════════════════════════════════════════════════════
let _dragCardIdx = -1;
let _dragGhost = null;

function onCardDragStart(e, idx) {
  _dragCardIdx = idx;
  // Select the card visually
  if (!selectedIndices.includes(idx)) {
    if (houseRules.multistack && selectedIndices.length > 0) {
      const baseCard = G.myHand[selectedIndices[0]];
      const card = G.myHand[idx];
      if (card.value === baseCard.value && CARD_COLORS.includes(card.color)) {
        selectedIndices.push(idx);
      } else {
        selectedIndices = [idx];
      }
    } else {
      selectedIndices = [idx];
    }
    renderHand();
    document.getElementById('play-btn').disabled = false;
  }
  // Custom ghost image
  try {
    const ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = '🃏';
    ghost.style.cssText = 'position:fixed;top:-200px;left:-200px;';
    document.body.appendChild(ghost);
    _dragGhost = ghost;
    e.dataTransfer.setDragImage(ghost, 27, 40);
    e.dataTransfer.effectAllowed = 'move';
  } catch(_) {}
  // Highlight drop zone
  const dz = document.getElementById('discard-drop-zone');
  if (dz) setTimeout(() => dz.classList.add('drag-over'), 50);
  // Add dragging class
  e.currentTarget.classList.add('dragging');
}

function onCardDragEnd(e) {
  e.currentTarget.classList.remove('dragging');
  const dz = document.getElementById('discard-drop-zone');
  if (dz) dz.classList.remove('drag-over');
  if (_dragGhost) { _dragGhost.remove(); _dragGhost = null; }
  _dragCardIdx = -1;
}

function setupDropZone() {
  const dz = document.getElementById('discard-drop-zone');
  if (!dz) return;
  dz.ondragover = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    dz.classList.add('drag-over');
  };
  dz.ondragleave = () => dz.classList.remove('drag-over');
  dz.ondrop = (e) => {
    e.preventDefault();
    dz.classList.remove('drag-over');
    if (_dragCardIdx < 0 || !isMyTurn()) return;
    // Trigger play logic same as clicking Play Card button
    playSelected();
  };
}


// ═══════════════════════════════════════════════════════════════
let _musicPlaying = false;
let _musicInterval = null;
let _musicCtx = null;
let _musicGain = null;

function getMusicCtx() {
  if (!_musicCtx) {
    _musicCtx = new (window.AudioContext || window.webkitAudioContext)();
    _musicGain = _musicCtx.createGain();
    _musicGain.gain.setValueAtTime(0.06, _musicCtx.currentTime);
    _musicGain.connect(_musicCtx.destination);
  }
  return _musicCtx;
}

// Simple looping chiptune-style background music using Web Audio
const MUSIC_SCALE = [261.63, 293.66, 329.63, 349.23, 392.00, 440.00, 493.88, 523.25]; // C major
const MUSIC_MELODY = [0,2,4,5,4,2,0,2, 4,5,7,5,4,2,4,0]; // note indices
let _musicBeat = 0;
let _musicNextNote = 0;

function playMusicNote() {
  if (!_musicPlaying || !_musicCtx) return;
  const ctx = _musicCtx;
  const gain = _musicGain;
  const now = ctx.currentTime;
  const noteIdx = MUSIC_MELODY[_musicBeat % MUSIC_MELODY.length];
  const octave = (_musicBeat % 16 < 8) ? 1 : 0.5;
  const freq = MUSIC_SCALE[noteIdx] * octave;

  // Melody note
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.connect(g); g.connect(gain);
  o.type = 'triangle';
  o.frequency.setValueAtTime(freq, now);
  g.gain.setValueAtTime(0, now);
  g.gain.linearRampToValueAtTime(0.6, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
  o.start(now); o.stop(now + 0.22);

  // Bass note every 4 beats
  if (_musicBeat % 4 === 0) {
    const ob = ctx.createOscillator();
    const gb = ctx.createGain();
    ob.connect(gb); gb.connect(gain);
    ob.type = 'sine';
    ob.frequency.setValueAtTime(freq * 0.25, now);
    gb.gain.setValueAtTime(0, now);
    gb.gain.linearRampToValueAtTime(0.4, now + 0.03);
    gb.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
    ob.start(now); ob.stop(now + 0.4);
  }
  _musicBeat++;
}

function startMusic() {
  try {
    const ctx = getMusicCtx();
    if (ctx.state === 'suspended') ctx.resume();
    _musicPlaying = true;
    _musicBeat = 0;
    clearInterval(_musicInterval);
    _musicInterval = setInterval(playMusicNote, 230);
    updateMusicBtn();
  } catch(e) {}
}

function stopMusic() {
  _musicPlaying = false;
  clearInterval(_musicInterval);
  _musicInterval = null;
  updateMusicBtn();
}

function toggleMusic() {
  if (_musicPlaying) stopMusic(); else startMusic();
}

function updateMusicBtn() {
  const btn = document.getElementById('music-btn');
  const icon = document.getElementById('music-icon');
  const label = document.getElementById('music-label');
  if (!btn) return;
  if (_musicPlaying) {
    btn.classList.add('playing');
    icon.className = 'fas fa-music';
    label.textContent = 'Music On';
  } else {
    btn.classList.remove('playing');
    icon.className = 'fas fa-volume-mute';
    label.textContent = 'Music Off';
  }
}

function setCmdSuggestion(text) {
  const inp = document.getElementById('command-card-inp');
  if (inp) { inp.value = text; inp.focus(); }
}

// ═══════════════════════════════════════════════════════════════
// AI DIFFICULTY
// ═══════════════════════════════════════════════════════════════
let selectedDifficulty = 'normal';
function selectDifficulty(btn, diff) {
  selectedDifficulty = diff;
  document.querySelectorAll('.diff-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  // Remap AI personalities based on difficulty
  if (diff === 'hard') {
    AI_NAMES.forEach(n => { if(AI_PERSONALITIES[n]) AI_PERSONALITIES[n].style = 'smart'; });
  } else if (diff === 'chaos') {
    AI_NAMES.forEach(n => { if(AI_PERSONALITIES[n]) AI_PERSONALITIES[n].style = 'troll'; });
  } else {
    // normal — restore defaults
    AI_PERSONALITIES.Blaze.style='aggressive'; AI_PERSONALITIES.Nova.style='smart';
    AI_PERSONALITIES.Chip.style='troll'; AI_PERSONALITIES.Orion.style='aggressive';
    AI_PERSONALITIES.Pixel.style='troll'; AI_PERSONALITIES.Echo.style='smart';
  }
}

// ═══════════════════════════════════════════════════════════════
// LIVE STATS SIMULATION
// ═══════════════════════════════════════════════════════════════
function updateLiveStats() {
  // Simulate live numbers with gentle jitter around realistic values
  const base = { players: 24, games: 6 };
  const pJitter = Math.floor(Math.random()*8)-3;
  const gJitter = Math.floor(Math.random()*4)-1;
  const players = Math.max(8, base.players + pJitter);
  const games   = Math.max(1, base.games + gJitter);
  const pEl = document.getElementById('stat-players');
  const gEl = document.getElementById('stat-games');
  if (pEl) pEl.textContent = `🔥 ${players} players online`;
  if (gEl) gEl.textContent = `🎮 ${games} active games`;
}

// ═══════════════════════════════════════════════════════════════
// ANIMATED CARD FLOATERS (launcher background)
// ═══════════════════════════════════════════════════════════════
const CARD_COLORS_FLOATERS = ['R','B','G','Y'];
const CARD_VALS_FLOATERS = ['1','3','5','7','9','S','R','A2'];
function spawnCardFloater() {
  const col = CARD_COLORS_FLOATERS[Math.floor(Math.random()*4)];
  const val = CARD_VALS_FLOATERS[Math.floor(Math.random()*CARD_VALS_FLOATERS.length)];
  const el = document.createElement('div');
  el.className = 'card-floater';
  const rotStart = (Math.random()*60-30)+'deg';
  const rotEnd = (Math.random()*60-30)+'deg';
  const dur = (8+Math.random()*10)+'s';
  const left = (Math.random()*95)+'%';
  el.style.cssText = `left:${left};bottom:-120px;width:42px;height:63px;--rot-start:${rotStart};--rot-end:${rotEnd};animation-duration:${dur};animation-delay:${Math.random()*8}s;`;
  // Card visual
  const colorMap2={R:'#e8302c',B:'#1a73e8',G:'#2db552',Y:'#f9c023'};
  el.style.background = `linear-gradient(145deg,${colorMap2[col]},${colorMap2[col]}bb)`;
  el.style.border = '2px solid rgba(255,255,255,.2)';
  el.style.borderRadius = '7px';
  el.style.display = 'flex';el.style.alignItems='center';el.style.justifyContent='center';
  el.style.fontFamily = 'Fredoka One,cursive';
  el.style.fontSize = '16px';el.style.color='rgba(255,255,255,.8)';
  el.textContent = val;
  document.body.appendChild(el);
  setTimeout(()=>el.remove(), parseFloat(dur)*1000+10000);
}
function startCardFloaters() {
  // Only show on launcher
  if (document.querySelector('.screen.active')?.id !== 'screen-launcher') return;
  spawnCardFloater();
  setTimeout(startCardFloaters, 1800+Math.random()*2000);
}

// ═══════════════════════════════════════════════════════════════
// DISCORD OAUTH + SUPABASE USER PERSISTENCE
// ═══════════════════════════════════════════════════════════════
const DC_AUTH_KEY   = 'nixai_dc_user_v1';
const DC_TOKEN_KEY  = 'nixai_dc_token_v1';

// The redirect URI must be registered in your Discord app OAuth2 settings.
// For local/Termux dev: use your Cloudflare tunnel URL + /oauth/callback
// For prod: your actual domain
function showAuthModal() {
  const user = getDiscordUser();
  const modal = document.getElementById('auth-modal');
  const btnArea = document.getElementById('auth-btn-area');
  const loading = document.getElementById('auth-loading');
  loading.classList.remove('show');
  btnArea.style.display = '';
  if (user) {
    // Show logged-in state with logout option
    btnArea.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;background:rgba(88,101,242,.1);border:1px solid rgba(88,101,242,.25);border-radius:14px;padding:12px 14px;margin-bottom:14px;">
        ${user.avatar_url
          ? `<img src="${user.avatar_url}" style="width:44px;height:44px;border-radius:50%;border:2px solid rgba(88,101,242,.5);object-fit:cover;" onerror="this.style.display='none';">`
          : `<div style="width:44px;height:44px;border-radius:50%;background:rgba(88,101,242,.3);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#fff;">${(user.username||'?').slice(0,1).toUpperCase()}</div>`
        }
        <div style="flex:1;text-align:left;">
          <div style="font-weight:900;font-size:14px;color:#fff;">${user.username}</div>
          <div style="font-size:11px;color:var(--muted);margin-top:1px;">Discord account linked ✓</div>
        </div>
      </div>
      <button class="btn btn-success" style="width:100%;margin-bottom:8px;" onclick="document.getElementById('auth-modal').classList.remove('show')">
        <i class="fas fa-check"></i> Continue Playing
      </button>
      <button class="btn btn-danger" style="width:100%;font-size:12px;" onclick="discordLogout()">
        <i class="fas fa-sign-out-alt"></i> Sign Out
      </button>`;
  }
  modal.classList.add('show');
}

function getDiscordUser() {
  try { return JSON.parse(localStorage.getItem(DC_AUTH_KEY) || 'null'); } catch(e) { return null; }
}
function saveDiscordUser(u) {
  try { localStorage.setItem(DC_AUTH_KEY, JSON.stringify(u)); } catch(e) {}
}

function startDiscordOAuth() {
  // ── Path 1: Running inside a Discord Activity ──
  // The SDK already authenticated at boot via tryInitDiscordSdk().
  // Just re-run it if the user explicitly hits "Sign in".
  if (discordSdk) {
    const existingUser = getDiscordUser();
    if (existingUser) {
      showToast(`Already signed in as ${existingUser.username} ✓`, 'fa-check-circle', 3000);
      document.getElementById('auth-modal')?.classList.remove('show');
    } else {
      showToast('Signing in via Discord…', 'fa-spinner', 2000);
      tryInitDiscordSdk().catch(() => showToast('Sign-in failed — try again', 'fa-times-circle'));
    }
    return;
  }

  // ── Path 2: Normal browser (outside Discord) — popup flow ──
  const state = Math.random().toString(36).slice(2, 10);
  sessionStorage.setItem('dc_oauth_state', state);
  const params = new URLSearchParams({
    client_id: CFG.DISCORD_CLIENT_ID,
    redirect_uri: window.location.origin + window.location.pathname,
    response_type: 'code',
    scope: 'identify',
    state,
  });
  const oauthUrl = `https://discord.com/api/oauth2/authorize?${params}`;

  const popup = window.open(oauthUrl, 'discord_oauth', 'width=500,height=700,menubar=no,toolbar=no');
  if (popup && !popup.closed) {
    const btnArea = document.getElementById('auth-btn-area');
    const loading = document.getElementById('auth-loading');
    btnArea.style.display = 'none';
    loading.classList.add('show');
    document.getElementById('auth-loading-text').textContent = 'Waiting for Discord login…';

    const poll = setInterval(async () => {
      try {
        if (popup.closed) {
          clearInterval(poll);
          loading.classList.remove('show');
          btnArea.style.display = '';
          return;
        }
        const popupUrl = popup.location.href;
        if (popupUrl && popupUrl.includes('code=')) {
          popup.close();
          clearInterval(poll);
          const code = new URLSearchParams(new URL(popupUrl).search).get('code');
          await _exchangeOAuthCode(code);
        }
      } catch(e) { /* cross-origin while on discord.com — expected */ }
    }, 500);

    setTimeout(() => {
      clearInterval(poll);
      if (!popup.closed) popup.close();
      document.getElementById('auth-loading')?.classList.remove('show');
      document.getElementById('auth-btn-area').style.display = '';
    }, 300000);
    return;
  }

  // ── Path 3: Same-tab redirect fallback ──
  window.location.href = oauthUrl;
}

async function _exchangeOAuthCode(code) {
  // Used only in browser (non-Activity) popup flow
  const btnArea = document.getElementById('auth-btn-area');
  const loading = document.getElementById('auth-loading');
  btnArea.style.display = 'none';
  loading.classList.add('show');
  document.getElementById('auth-loading-text').textContent = 'Verifying with Discord…';
  try {
    const res = await fetch(`${CFG.SUPABASE_URL}/functions/v1/discord-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ code, redirect_uri: window.location.origin + window.location.pathname }),
    });
    if (!res.ok) throw new Error('Edge function error: ' + await res.text());
    const { user } = await res.json();
    if (!user?.id) throw new Error('No user returned');
    document.getElementById('auth-loading-text').textContent = 'Syncing your profile…';
    const dcUser = {
      discord_id: user.id,
      username: user.username + (user.discriminator && user.discriminator !== '0' ? '#' + user.discriminator : ''),
      avatar_url: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=128` : null,
    };
    saveDiscordUser(dcUser);
    if (!MY_NAME) MY_NAME = dcUser.username.split('#')[0];
    await syncUserWithSupabase(dcUser);
    updateDiscordProfileUI(dcUser);
    showToast(`Welcome, ${dcUser.username}! 👋`, 'fa-check-circle', 3500);
    document.getElementById('auth-modal')?.classList.remove('show');
  } catch(e) {
    console.error('Discord OAuth error:', e);
    loading.classList.remove('show');
    btnArea.style.display = '';
    showToast('Sign-in failed — try again', 'fa-times-circle');
  }
}

async function handleOAuthCallback() {
  // Only runs in browser popup flow — not inside Discord Activity
  if (discordSdk) return false; // SDK handles auth at boot
  const params = new URLSearchParams(window.location.search);
  const code  = params.get('code');
  const state = params.get('state');
  if (!code) return false;
  const savedState = sessionStorage.getItem('dc_oauth_state');
  if (state && savedState && state !== savedState) {
    showToast('OAuth state mismatch — try again', 'fa-exclamation-triangle');
    return false;
  }
  window.history.replaceState({}, document.title, window.location.pathname);
  const btnArea = document.getElementById('auth-btn-area');
  const loading = document.getElementById('auth-loading');
  document.getElementById('auth-modal')?.classList.add('show');
  btnArea.style.display = 'none';
  loading.classList.add('show');
  document.getElementById('auth-loading-text').textContent = 'Verifying with Discord…';
  try {
    const res = await fetch(`${CFG.SUPABASE_URL}/functions/v1/discord-oauth`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CFG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ code, redirect_uri: window.location.origin + window.location.pathname }),
    });
    if (!res.ok) throw new Error(await res.text());
    const { user } = await res.json();
    if (!user?.id) throw new Error('No user returned');
    document.getElementById('auth-loading-text').textContent = 'Syncing your profile…';
    const dcUser = {
      discord_id: user.id,
      username: user.username + (user.discriminator && user.discriminator !== '0' ? '#' + user.discriminator : ''),
      avatar_url: user.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.webp?size=128` : null,
    };
    saveDiscordUser(dcUser);
    if (!MY_NAME) MY_NAME = dcUser.username.split('#')[0];
    await syncUserWithSupabase(dcUser);
    updateDiscordProfileUI(dcUser);
    showToast(`Welcome, ${dcUser.username}! 👋`, 'fa-check-circle', 3500);
    document.getElementById('auth-modal')?.classList.remove('show');
    return true;
  } catch(e) {
    console.error('Discord OAuth callback error:', e);
    loading.classList.remove('show');
    btnArea.style.display = '';
    showToast('Sign-in failed — try again', 'fa-times-circle');
    return false;
  }
}

async function syncUserWithSupabase(dcUser) {
  if (!SB) return;
  try {
    // Upsert profile
    await SB.from('profiles').upsert({
      discord_id: dcUser.discord_id,
      username: dcUser.username,
      avatar_url: dcUser.avatar_url,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'discord_id' });

    // Load shards from cloud — take higher of local/cloud
    const { data: shardRow } = await SB.from('user_shards')
      .select('amount')
      .eq('discord_id', dcUser.discord_id)
      .single();

    const localShards = getShards();
    const cloudShards = shardRow?.amount ?? 0;
    const merged = Math.max(localShards, cloudShards);
    saveShards(merged);
    updateShardHUD();

    // If local was higher, push it up
    if (localShards > cloudShards) {
      await SB.from('user_shards').upsert({
        discord_id: dcUser.discord_id,
        amount: merged,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'discord_id' });
    }

    // Load inventory from cloud and merge with local shop data
    const { data: invRows } = await SB.from('user_inventory')
      .select('item_id, item_type, equipped, quantity')
      .eq('discord_id', dcUser.discord_id);

    if (invRows && invRows.length > 0) {
      const shopData = getShopData();
      for (const row of invRows) {
        if (!shopData[row.item_id]) shopData[row.item_id] = row.quantity ?? true;
        if (row.equipped && row.item_type === 'cardBack') shopData.equippedCardBack = row.item_id;
      }
      saveShopData(shopData);
    }
  } catch(e) {
    console.warn('Supabase sync error:', e);
  }
}

async function pushShardsToCloud(amount) {
  const user = getDiscordUser();
  if (!SB || !user) return;
  try {
    await SB.from('user_shards').upsert({
      discord_id: user.discord_id,
      amount,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'discord_id' });
  } catch(e) {}
}

async function pushInventoryToCloud(itemId, itemType, equipped, quantity) {
  const user = getDiscordUser();
  if (!SB || !user) return;
  try {
    await SB.from('user_inventory').upsert({
      discord_id: user.discord_id,
      item_id: itemId,
      item_type: itemType,
      equipped: !!equipped,
      quantity: quantity ?? 1,
      purchased_at: new Date().toISOString(),
    }, { onConflict: 'discord_id,item_id' });
  } catch(e) {}
}

function discordLogout() {
  try {
    localStorage.removeItem(DC_AUTH_KEY);
    localStorage.removeItem(DC_TOKEN_KEY);
  } catch(e) {}
  updateDiscordProfileUI(null);
  document.getElementById('auth-modal').classList.remove('show');
  showToast('Signed out of Discord', 'fa-sign-out-alt');
}

function updateDiscordProfileUI(user) {
  const loginBtn  = document.getElementById('discord-login-btn');
  const chipEl    = document.getElementById('discord-profile-chip');
  const avatarWrap = document.getElementById('dc-avatar-wrap');
  const nameEl    = document.getElementById('dc-username');
  if (!loginBtn || !chipEl) return;
  if (user) {
    loginBtn.style.display = 'none';
    chipEl.classList.add('show');
    nameEl.textContent = user.username.split('#')[0];
    if (user.avatar_url) {
      const fallbackInitial = (user.username || '?').slice(0, 1).toUpperCase();
      const img = document.createElement('img');
      img.src = user.avatar_url;
      img.alt = user.username;
      img.style.cssText = 'width:28px;height:28px;border-radius:50%;display:block;object-fit:cover;';
      img.onerror = function() {
        avatarWrap.textContent = fallbackInitial;
        this.remove();
      };
      avatarWrap.innerHTML = '';
      avatarWrap.appendChild(img);
    } else {
      avatarWrap.textContent = (user.username||'?').slice(0,1).toUpperCase();
    }
  } else {
    loginBtn.style.display = '';
    chipEl.classList.remove('show');
  }
}

/* ─────────────────────────────────────────────────────────
   SUPABASE SQL SCHEMA  (run once in Supabase SQL editor)
   ─────────────────────────────────────────────────────────
create table if not exists profiles (
  discord_id  text primary key,
  username    text,
  avatar_url  text,
  updated_at  timestamptz default now()
);
create table if not exists user_shards (
  discord_id  text primary key references profiles(discord_id) on delete cascade,
  amount      int  default 0,
  updated_at  timestamptz default now()
);
create table if not exists user_inventory (
  id           uuid default gen_random_uuid() primary key,
  discord_id   text references profiles(discord_id) on delete cascade,
  item_id      text not null,
  item_type    text not null,
  equipped     boolean default false,
  quantity     int  default 1,
  purchased_at timestamptz default now(),
  unique(discord_id, item_id)
);
alter table profiles     enable row level security;
alter table user_shards  enable row level security;
alter table user_inventory enable row level security;
-- Allow edge function (service role) full access; anon read own rows:
create policy "service full access" on profiles     using (true) with check (true);
create policy "service full access" on user_shards  using (true) with check (true);
create policy "service full access" on user_inventory using (true) with check (true);

   EDGE FUNCTION  supabase/functions/discord-oauth/index.ts
   ─────────────────────────────────────────────────────────
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
const CORS = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  const { code, redirect_uri } = await req.json();
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("DISCORD_CLIENT_ID")!,
      client_secret: Deno.env.get("DISCORD_CLIENT_SECRET")!,
      grant_type: "authorization_code",
      code, redirect_uri,
    }),
  });
  if (!tokenRes.ok) return new Response(await tokenRes.text(), { status: 400, headers: CORS });
  const { access_token } = await tokenRes.json();
  const userRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${access_token}` },
  });
  const user = await userRes.json();
  return new Response(JSON.stringify({ user, access_token }), { headers: CORS });
});
// Deploy: supabase functions deploy discord-oauth --no-verify-jwt
// Set secrets: supabase secrets set DISCORD_CLIENT_ID=... DISCORD_CLIENT_SECRET=...
─────────────────────────────────────────────────────────── */

// ═══════════════════════════════════════════════════════════════
// GAME HISTORY — LOCAL + SUPABASE
// ═══════════════════════════════════════════════════════════════
const HISTORY_KEY   = 'nixai_history_v1';
const STREAK_KEY    = 'nixai_streak_v1';
const DAILY_KEY     = 'nixai_daily_v1';

function getLocalHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) { return []; }
}
function saveLocalHistory(arr) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(arr.slice(-100))); } catch(e) {} // keep last 100
}
function getWinStreak() {
  try { return parseInt(localStorage.getItem(STREAK_KEY) || '0', 10); } catch(e) { return 0; }
}
function saveWinStreak(n) { try { localStorage.setItem(STREAK_KEY, String(n)); } catch(e) {} }

async function recordGameResult(isWin, shardsEarned, durationSecs, winnerName, playerNames, aiGame) {
  const entry = {
    ts: Date.now(),
    result: isWin ? 'win' : 'loss',
    winner: winnerName,
    players: playerNames,
    shards: shardsEarned,
    duration: durationSecs,
    ai: !!aiGame,
  };
  // Local history
  const hist = getLocalHistory();
  hist.push(entry);
  saveLocalHistory(hist);
  // Streak
  if (isWin) saveWinStreak(getWinStreak() + 1);
  else saveWinStreak(0);
  // Supabase
  const dcUser = getDiscordUser();
  if (SB && dcUser) {
    try {
      await SB.from('game_history').insert({
        discord_id:   dcUser.discord_id,
        result:       entry.result,
        winner_name:  entry.winner,
        player_names: entry.players,
        shards_earned: entry.shards,
        duration_secs: entry.duration,
        ai_game:       entry.ai,
        played_at:     new Date().toISOString(),
      });
    } catch(e) { console.warn('history insert error', e); }
  }
}

// ═══════════════════════════════════════════════════════════════
// REMATCH
// ═══════════════════════════════════════════════════════════════
function doRematch() {
  document.getElementById('win-modal').classList.remove('show');
  if (!isHost || !isAiMode) return;
  // Re-use same lobby player setup, just restart
  const aiCount = parseInt(document.getElementById('ai-count-select')?.value || '2', 10);
  lobbyPlayers = {};
  lobbyPlayers[MY_ID] = { id: MY_ID, name: MY_NAME, isHost: true };
  for (let i = 0; i < aiCount; i++) {
    const aiId = AI_ID_PREFIX + i;
    lobbyPlayers[aiId] = { id: aiId, name: AI_NAMES[i] || `AI-${i+1}`, isHost: false, isAi: true };
  }
  _gameStartTime = Date.now();
  const playerIds = Object.keys(lobbyPlayers);
  initGameState(playerIds);
  document.getElementById('ai-mode-badge').style.display = '';
  initChatPanel();
  runDealAnimation(() => {
    renderGame();
    _afterTurnSetup();
  });
}

// ═══════════════════════════════════════════════════════════════
// STATS / LEADERBOARD / FRIENDS MODAL
// ═══════════════════════════════════════════════════════════════
let _currentStatsTab = 'stats';

function openStatsModal(tab = 'stats') {
  _currentStatsTab = tab;
  document.getElementById('stats-modal').classList.add('show');
  switchStatsTab(tab);
}

function switchStatsTab(tab) {
  _currentStatsTab = tab;
  ['stats','lb','friends'].forEach(t => {
    document.getElementById(`tab-${t}`)?.classList.toggle('active', t === tab);
  });
  if (tab === 'stats')   renderStatsPanel();
  if (tab === 'lb')      renderLeaderboard();
  if (tab === 'friends') renderFriendsPanel();
}

function renderStatsPanel() {
  const body = document.getElementById('stats-modal-body');
  const hist = getLocalHistory();
  const wins   = hist.filter(h => h.result === 'win').length;
  const losses = hist.filter(h => h.result === 'loss').length;
  const total  = wins + losses;
  const ratio  = total > 0 ? Math.round((wins / total) * 100) : 0;
  const streak = getWinStreak();
  const shards = getShards();
  const avgDur = hist.length > 0
    ? Math.round(hist.reduce((s,h) => s + (h.duration||0), 0) / hist.length)
    : 0;
  const fmtDur = avgDur > 60 ? `${Math.floor(avgDur/60)}m ${avgDur%60}s` : `${avgDur}s`;

  const dcUser = getDiscordUser();
  const avatarHtml = dcUser?.avatar_url
    ? `<img src="${dcUser.avatar_url}" style="width:52px;height:52px;border-radius:50%;border:3px solid rgba(88,101,242,.5);object-fit:cover;">`
    : `<div style="width:52px;height:52px;border-radius:50%;background:rgba(88,101,242,.3);display:flex;align-items:center;justify-content:center;font-size:22px;font-weight:900;color:#fff;">${(MY_NAME||'?').slice(0,1).toUpperCase()}</div>`;

  body.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:16px;">
      ${avatarHtml}
      <div style="flex:1;">
        <div style="font-weight:900;font-size:15px;color:#fff;">${dcUser?.username || MY_NAME || 'Guest'}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:2px;">${dcUser ? '✓ Discord linked' : 'Guest mode'}</div>
        <div style="font-size:11px;color:#a5b4fc;margin-top:2px;font-weight:800;">Lv.${getLevelFromXP(getTotalXP())} · ${getPlayerTitle(getLevelFromXP(getTotalXP()))}</div>
      </div>
      <button onclick="openProfileModal()" style="background:rgba(129,140,248,.15);border:1px solid rgba(129,140,248,.3);border-radius:10px;padding:6px 11px;font-size:11px;font-weight:800;color:#a5b4fc;cursor:pointer;white-space:nowrap;"><i class="fas fa-id-card"></i> Profile</button>
    </div>
    <div class="stats-grid">
      <div class="stat-card highlight">
        <div class="stat-card-val">${wins}</div>
        <div class="stat-card-lbl">Wins</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-val">${losses}</div>
        <div class="stat-card-lbl">Losses</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-val">${ratio}%</div>
        <div class="stat-card-lbl">Win Rate</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-val">${streak}🔥</div>
        <div class="stat-card-lbl">Streak</div>
      </div>
      <div class="stat-card highlight">
        <div class="stat-card-val">${shards.toLocaleString()}</div>
        <div class="stat-card-lbl">💎 Shards</div>
      </div>
      <div class="stat-card">
        <div class="stat-card-val">${fmtDur}</div>
        <div class="stat-card-lbl">Avg Game</div>
      </div>
    </div>
    <div style="font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;">Recent Games</div>
    <div class="history-list">
      ${hist.length === 0 ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;font-weight:700;">No games played yet</div>' :
        [...hist].reverse().slice(0,20).map(h => {
          const date = new Date(h.ts).toLocaleDateString(undefined,{month:'short',day:'numeric'});
          const dur = h.duration > 60 ? `${Math.floor(h.duration/60)}m` : `${h.duration}s`;
          return `
            <div class="history-row">
              <div class="history-result ${h.result}">${h.result === 'win' ? 'WIN' : 'LOSS'}</div>
              <div class="history-meta">
                <div style="color:#d1d5db;margin-bottom:1px;">${h.winner}</div>
                <div style="font-size:10px;">${h.ai ? '🤖 AI' : '👥 Multi'} · ${dur} · ${date}</div>
              </div>
              <div class="history-shards">+${h.shards} 💎</div>
            </div>`;
        }).join('')
      }
    </div>
  `;
}

async function renderLeaderboard() {
  const body = document.getElementById('stats-modal-body');
  body.innerHTML = '<div class="lb-loading"><div class="auth-spinner" style="margin:0 auto 10px;"></div>Loading leaderboard…</div>';

  try {
    let rows = [];
    if (SB) {
      // Top 10 by shards
      const { data: shardRows } = await SB
        .from('user_shards')
        .select('discord_id, amount, profiles(username, avatar_url)')
        .order('amount', { ascending: false })
        .limit(10);

      // Win counts per player
      const { data: winRows } = await SB
        .from('game_history')
        .select('discord_id')
        .eq('result', 'win');

      const winMap = {};
      (winRows || []).forEach(r => { winMap[r.discord_id] = (winMap[r.discord_id] || 0) + 1; });

      rows = (shardRows || []).map(r => ({
        discord_id: r.discord_id,
        username:   r.profiles?.username || 'Unknown',
        avatar_url: r.profiles?.avatar_url || null,
        shards:     r.amount || 0,
        wins:       winMap[r.discord_id] || 0,
      }));
    }

    // If no cloud data, fall back to local
    if (rows.length === 0) {
      const dcUser = getDiscordUser();
      if (dcUser) {
        rows = [{
          discord_id: dcUser.discord_id,
          username: dcUser.username,
          avatar_url: dcUser.avatar_url,
          shards: getShards(),
          wins: getLocalHistory().filter(h => h.result === 'win').length,
        }];
      }
    }

    const myId = getDiscordUser()?.discord_id;
    body.innerHTML = `
      <div style="font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;gap:10px;">
        <span style="flex:1;">Player</span><span>💎 Shards</span><span style="margin-left:8px;">🏆 Wins</span>
      </div>
      ${rows.length === 0
        ? '<div class="lb-loading">No data yet — play some games!</div>'
        : rows.map((r, i) => {
            const rankEmoji = i===0?'🥇':i===1?'🥈':i===2?'🥉':`${i+1}.`;
            const avatarHtml = r.avatar_url
              ? `<div class="lb-avatar"><img src="${r.avatar_url}" onerror="this.outerHTML='${(r.username||'?').slice(0,1).toUpperCase()}'"></div>`
              : `<div class="lb-avatar" style="background:rgba(88,101,242,.3);">${(r.username||'?').slice(0,1).toUpperCase()}</div>`;
            return `
              <div class="lb-row ${r.discord_id === myId ? 'is-me' : ''}">
                <div class="lb-rank">${rankEmoji}</div>
                ${avatarHtml}
                <div class="lb-name">${r.username}${r.discord_id === myId ? ' <span style="font-size:10px;color:var(--accent2);">(you)</span>' : ''}</div>
                <div class="lb-shards">${r.shards.toLocaleString()}</div>
                <div class="lb-wins">${r.wins}W</div>
              </div>
              ${i < rows.length - 1 ? '<div class="lb-divider"></div>' : ''}`;
          }).join('')
      }
    `;
  } catch(e) {
    body.innerHTML = '<div class="lb-loading">Could not load leaderboard.</div>';
  }
}

// ═══════════════════════════════════════════════════════════════
// FRIENDS SYSTEM
// ═══════════════════════════════════════════════════════════════
const FRIENDS_KEY = 'nixai_friends_v1';
let _pendingInvite = null; // { fromId, fromName, roomCode }

function getLocalFriends() {
  try { return JSON.parse(localStorage.getItem(FRIENDS_KEY) || '[]'); } catch(e) { return []; }
}
function saveLocalFriends(arr) { try { localStorage.setItem(FRIENDS_KEY, JSON.stringify(arr)); } catch(e) {} }

async function renderFriendsPanel() {
  const body = document.getElementById('stats-modal-body');
  const dcUser = getDiscordUser();

  if (!dcUser) {
    body.innerHTML = `
      <div style="text-align:center;padding:30px 10px;">
        <div style="font-size:36px;margin-bottom:10px;">👥</div>
        <div style="font-weight:800;color:#fff;margin-bottom:6px;">Sign in to use Friends</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Link your Discord account to add friends and send lobby invites.</div>
        <button class="discord-login-btn" style="margin:0 auto;" onclick="showAuthModal()">
          <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057c.002.022.015.043.032.053a19.9 19.9 0 0 0 5.993 3.03.077.077 0 0 0 .084-.028 13.978 13.978 0 0 0 1.226-1.994.075.075 0 0 0-.041-.104 13.175 13.175 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
          Sign in with Discord
        </button>
      </div>`;
    return;
  }

  body.innerHTML = '<div class="lb-loading"><div class="auth-spinner" style="margin:0 auto 10px;"></div>Loading friends…</div>';

  try {
    // Load friends from Supabase
    let friendRows = [];
    if (SB) {
      const { data } = await SB
        .from('friends')
        .select('friend_discord_id, status, profiles!friends_friend_discord_id_fkey(username, avatar_url)')
        .eq('discord_id', dcUser.discord_id)
        .eq('status', 'accepted');
      friendRows = data || [];
    }

    // Check online status via meta presence channel
    const onlineIds = new Set();
    if (META_CH) {
      const state = META_CH.presenceState();
      Object.values(state).forEach(presences => {
        presences.forEach(p => { if (p.discord_id) onlineIds.add(p.discord_id); });
      });
    }

    body.innerHTML = `
      <div class="friends-search-row">
        <input class="inp" id="friend-search-inp" placeholder="Discord ID to add friend…" style="flex:1;font-size:12px;padding:8px 11px;">
        <button class="btn btn-primary" style="padding:8px 13px;font-size:12px;" onclick="sendFriendRequest()">
          <i class="fas fa-user-plus"></i> Add
        </button>
      </div>
      <div class="friends-list" id="friends-list">
        ${friendRows.length === 0
          ? '<div style="text-align:center;padding:20px;color:var(--muted);font-size:13px;font-weight:700;">No friends yet — add someone!</div>'
          : friendRows.map(r => {
              const f = r.profiles;
              const isOnline = onlineIds.has(r.friend_discord_id);
              const avatarHtml = f?.avatar_url
                ? `<div class="friend-avatar"><img src="${f.avatar_url}" onerror="this.outerHTML='${(f?.username||'?').slice(0,1).toUpperCase()}'"></div>`
                : `<div class="friend-avatar" style="background:rgba(88,101,242,.3);">${(f?.username||'?').slice(0,1).toUpperCase()}</div>`;
              return `
                <div class="friend-row">
                  ${avatarHtml}
                  <div>
                    <div class="friend-name">${f?.username || 'Unknown'}</div>
                    <div class="friend-status ${isOnline?'online':'offline'}">
                      <div class="friend-status-dot ${isOnline?'online':'offline'}"></div>
                      ${isOnline ? 'Online' : 'Offline'}
                    </div>
                  </div>
                  ${roomCode && isOnline ? `<button class="friend-action-btn invite" onclick="sendLobbyInvite('${r.friend_discord_id}','${f?.username||''}')"><i class="fas fa-paper-plane"></i> Invite</button>` : ''}
                  <button class="friend-action-btn remove" onclick="removeFriend('${r.friend_discord_id}')"><i class="fas fa-times"></i></button>
                </div>`;
            }).join('')
        }
      </div>
    `;
  } catch(e) {
    body.innerHTML = '<div class="lb-loading">Could not load friends.</div>';
  }
}

async function sendFriendRequest() {
  const inp = document.getElementById('friend-search-inp');
  const targetId = inp?.value?.trim();
  if (!targetId) return;
  const dcUser = getDiscordUser();
  if (!dcUser || !SB) { showToast('Sign in first!', 'fa-exclamation-triangle'); return; }
  try {
    await SB.from('friends').upsert([
      { discord_id: dcUser.discord_id, friend_discord_id: targetId, status: 'pending' },
      { discord_id: targetId, friend_discord_id: dcUser.discord_id, status: 'pending' },
    ], { onConflict: 'discord_id,friend_discord_id' });
    inp.value = '';
    showToast('Friend request sent!', 'fa-check-circle');
    renderFriendsPanel();
  } catch(e) {
    showToast('Could not send request', 'fa-times-circle');
  }
}

async function removeFriend(friendId) {
  const dcUser = getDiscordUser();
  if (!dcUser || !SB) return;
  try {
    await SB.from('friends').delete()
      .or(`and(discord_id.eq.${dcUser.discord_id},friend_discord_id.eq.${friendId}),and(discord_id.eq.${friendId},friend_discord_id.eq.${dcUser.discord_id})`);
    showToast('Friend removed', 'fa-user-minus');
    renderFriendsPanel();
  } catch(e) {}
}

function sendLobbyInvite(friendDiscordId, friendName) {
  if (!roomCode) { showToast('Create a lobby first!', 'fa-exclamation-triangle'); return; }
  // Broadcast invite via meta channel
  if (META_CH) {
    META_CH.send({ type: 'broadcast', event: 'lobby_invite', payload: {
      fromId: getDiscordUser()?.discord_id,
      fromName: MY_NAME,
      toId: friendDiscordId,
      roomCode,
    }}).catch(()=>{});
  }
  showToast(`Invite sent to ${friendName}!`, 'fa-paper-plane');
}

function handleLobbyInvite(payload) {
  const myId = getDiscordUser()?.discord_id;
  if (!myId || payload.toId !== myId) return;
  _pendingInvite = payload;
  // Show invite banner
  const existing = document.getElementById('invite-banner');
  if (existing) existing.remove();
  const banner = document.createElement('div');
  banner.id = 'invite-banner';
  banner.className = 'friend-invite-banner';
  banner.style.cssText = 'position:fixed;top:70px;left:50%;transform:translateX(-50%);z-index:380;width:calc(100% - 32px);max-width:400px;';
  banner.innerHTML = `
    <div class="friend-invite-banner-text">
      <i class="fas fa-gamepad"></i> <strong>${payload.fromName}</strong> invited you to their lobby!
    </div>
    <div class="friend-invite-actions">
      <button class="friend-action-btn invite" onclick="acceptLobbyInvite()"><i class="fas fa-check"></i> Join</button>
      <button class="friend-action-btn remove" onclick="document.getElementById('invite-banner')?.remove()"><i class="fas fa-times"></i></button>
    </div>
  `;
  document.body.appendChild(banner);
  setTimeout(() => banner.remove(), 20000);
  playSound('uno');
}

function acceptLobbyInvite() {
  if (!_pendingInvite) return;
  const code = _pendingInvite.roomCode;
  document.getElementById('invite-banner')?.remove();
  _pendingInvite = null;
  // Navigate to lobby browser and join
  openLobbyBrowser('uno');
  setTimeout(() => {
    document.getElementById('browser-join-code-inp').value = code;
    document.getElementById('browser-join-code-btn').disabled = false;
    document.getElementById('browser-join-code-btn').click();
  }, 600);
}

// Wire invite listener onto META_CH whenever it's set up
function wireInviteListener() {
  if (!META_CH) return;
  META_CH.on('broadcast', { event: 'lobby_invite' }, ({ payload }) => handleLobbyInvite(payload));
}

// ═══════════════════════════════════════════════════════════════
// TOURNAMENT MODE
// ═══════════════════════════════════════════════════════════════
const TOURN_KEY = 'nixai_tournament_v1';
let _tournament = null;

function getStoredTournament() {
  try { return JSON.parse(localStorage.getItem(TOURN_KEY) || 'null'); } catch(e) { return null; }
}
function saveTournament(t) { try { localStorage.setItem(TOURN_KEY, JSON.stringify(t)); } catch(e) {} }

function openTournament() {
  _tournament = getStoredTournament();
  document.getElementById('tourn-modal').classList.add('show');
  renderTournamentUI();
}
function closeTournament() {
  document.getElementById('tourn-modal').classList.remove('show');
}

function renderTournamentUI() {
  const body = document.getElementById('tourn-body');
  if (!_tournament) {
    body.innerHTML = `
      <div style="text-align:center;margin-bottom:18px;">
        <div style="font-size:36px;margin-bottom:8px;">🏆</div>
        <div style="font-weight:800;font-size:14px;color:#fff;margin-bottom:6px;">Start a Tournament</div>
        <div style="font-size:12px;color:var(--muted);margin-bottom:16px;">Single-elimination bracket vs AI. Win all rounds to claim the prize!</div>
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px;">
        <div>
          <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:6px;">Players</div>
          <select class="inp" id="tourn-size" style="cursor:pointer;font-size:12px;padding:8px 10px;">
            <option value="4">4 Players</option>
            <option value="8" selected>8 Players</option>
          </select>
        </div>
        <div>
          <div style="font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);margin-bottom:6px;">Difficulty</div>
          <select class="inp" id="tourn-diff" style="cursor:pointer;font-size:12px;padding:8px 10px;">
            <option value="normal">Normal</option>
            <option value="hard">Hard</option>
            <option value="chaos">Chaos</option>
          </select>
        </div>
      </div>
      <div class="tourn-prize-row">
        <div class="tourn-prize-icon">💎</div>
        <div class="tourn-prize-text">Win the whole bracket to earn a massive shard prize!</div>
        <div class="tourn-prize-amount" id="tourn-prize-preview">200</div>
      </div>
      <button class="btn btn-primary btn-ripple" style="width:100%;margin-top:14px;font-size:14px;padding:12px;" onclick="startTournament()">
        <i class="fas fa-crown"></i> Start Tournament
      </button>
    `;
    document.getElementById('tourn-size')?.addEventListener('change', () => {
      const size = parseInt(document.getElementById('tourn-size').value, 10);
      document.getElementById('tourn-prize-preview').textContent = size === 8 ? '400' : '200';
    });
    return;
  }

  // Render bracket
  const t = _tournament;
  const prizeShards = t.size === 8 ? 400 : 200;
  let html = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
      <div>
        <div style="font-weight:900;color:#fff;font-size:14px;">${t.size}-Player Bracket</div>
        <div style="font-size:11px;color:var(--muted);">Round ${t.currentRound} of ${Math.log2(t.size)}</div>
      </div>
      <div class="tourn-status-badge ${t.complete ? 'done' : 'live'}">${t.complete ? '✓ Complete' : '⚡ Live'}</div>
    </div>`;

  t.rounds.forEach((round, ri) => {
    const roundNames = ['Quarter-Finals','Semi-Finals','Final','Champion'];
    const label = roundNames[ri] || `Round ${ri+1}`;
    html += `<div class="tourn-round-label">${label}</div><div class="tourn-bracket">`;
    round.matches.forEach(m => {
      html += `
        <div class="tourn-match">
          <div class="tourn-player ${m.winner === m.p1 ? 'winner' : m.winner ? 'eliminated' : ''}">
            <span>${m.p1}</span>
          </div>
          <div class="tourn-vs">vs</div>
          <div class="tourn-player ${m.winner === m.p2 ? 'winner' : m.winner ? 'eliminated' : ''}">
            <span>${m.p2 || 'TBD'}</span>
          </div>
          ${m.winner ? `<div class="tourn-result">✓ ${m.winner}</div>` : ''}
        </div>`;
    });
    html += '</div>';
  });

  if (t.complete) {
    html += `
      <div class="tourn-prize-row" style="margin-top:14px;">
        <div class="tourn-prize-icon">🏆</div>
        <div class="tourn-prize-text"><strong>${t.champion}</strong> wins the tournament!</div>
        <div class="tourn-prize-amount">+${prizeShards} 💎</div>
      </div>
      <button class="btn btn-secondary" style="width:100%;margin-top:10px;" onclick="resetTournament()">
        <i class="fas fa-redo"></i> New Tournament
      </button>`;
  } else {
    const nextMatch = t.rounds[t.currentRound - 1]?.matches.find(m => !m.winner);
    if (nextMatch) {
      html += `
        <div style="margin-top:14px;background:rgba(249,192,35,.08);border:1px solid rgba(249,192,35,.2);border-radius:12px;padding:12px 14px;">
          <div style="font-size:11px;font-weight:900;text-transform:uppercase;letter-spacing:.1em;color:var(--uno-yellow);margin-bottom:8px;">⚡ Next Match</div>
          <div style="font-size:13px;font-weight:800;color:#fff;margin-bottom:10px;">${nextMatch.p1} vs ${nextMatch.p2||'TBD'}</div>
          <button class="btn btn-primary btn-ripple" style="width:100%;" onclick="playTournamentMatch()">
            <i class="fas fa-play"></i> Play Now
          </button>
        </div>`;
    }
  }
  body.innerHTML = html;
}

function startTournament() {
  const size = parseInt(document.getElementById('tourn-size')?.value || '8', 10);
  const diff = document.getElementById('tourn-diff')?.value || 'normal';
  const aiNames = shuffle([...AI_NAMES]);
  const players = [MY_NAME || 'You', ...aiNames.slice(0, size - 1)];
  const shuffled = shuffle(players);

  // Build round 1 matches
  const matches = [];
  for (let i = 0; i < shuffled.length; i += 2) {
    matches.push({ p1: shuffled[i], p2: shuffled[i+1] || 'BYE', winner: null });
  }
  // Auto-win BYEs
  matches.forEach(m => { if (m.p2 === 'BYE') m.winner = m.p1; });

  _tournament = {
    size, diff,
    currentRound: 1,
    rounds: [{ matches }],
    complete: false,
    champion: null,
  };
  saveTournament(_tournament);
  closeTournament();
  // Kick off first non-BYE match
  const firstReal = matches.find(m => !m.winner);
  if (firstReal) {
    playTournamentMatch();
  } else {
    advanceTournamentRound();
  }
}

function playTournamentMatch() {
  closeTournament();
  if (!_tournament) return;
  const round = _tournament.rounds[_tournament.currentRound - 1];
  const match = round?.matches.find(m => !m.winner);
  if (!match) { advanceTournamentRound(); return; }

  // Set difficulty
  selectDifficulty({ classList: { add:()=>{}, remove:()=>{} } }, _tournament.diff);

  // Build AI lobby for this match — player vs one AI
  const isPlayerMatch = match.p1 === (MY_NAME || 'You') || match.p2 === (MY_NAME || 'You');
  if (!isPlayerMatch) {
    // Simulate AI vs AI — random winner
    match.winner = Math.random() < 0.5 ? match.p1 : match.p2;
    saveTournament(_tournament);
    const nextReal = round.matches.find(m => !m.winner);
    if (nextReal) playTournamentMatch();
    else advanceTournamentRound();
    return;
  }

  const opponentName = match.p1 === (MY_NAME || 'You') ? match.p2 : match.p1;
  isAiMode = true;
  isHost = true;
  isSpectator = false;
  roomCode = 'TOURN_' + genRoomCode();
  lobbyPlayers = {};
  lobbyPlayers[MY_ID] = { id: MY_ID, name: MY_NAME || 'You', isHost: true };
  const aiId = AI_ID_PREFIX + '0';
  // Try to pick personality matching opponent name
  const aiName = AI_NAMES.includes(opponentName) ? opponentName : AI_NAMES[0];
  lobbyPlayers[aiId] = { id: aiId, name: aiName, isHost: false, isAi: true };
  _gameStartTime = Date.now();
  const playerIds = Object.keys(lobbyPlayers);
  initGameState(playerIds);
  document.getElementById('ai-mode-badge').style.display = '';
  initChatPanel();
  // Tag game as tournament so win handler knows
  G._tournamentMatch = match;
  runDealAnimation(() => {
    renderGame();
    _afterTurnSetup();
    startMusic();
    showToast(`Tournament: You vs ${aiName}!`, 'fa-crown', 3000);
  });
}

// Call this after a tournament match win
function onTournamentMatchWin(isPlayerWin) {
  if (!_tournament || !G?._tournamentMatch) return;
  const match = G._tournamentMatch;
  match.winner = isPlayerWin ? (MY_NAME || 'You') : (match.p1 === (MY_NAME||'You') ? match.p2 : match.p1);
  saveTournament(_tournament);
  const round = _tournament.rounds[_tournament.currentRound - 1];
  const allDone = round.matches.every(m => m.winner);
  if (allDone) advanceTournamentRound();
}

function advanceTournamentRound() {
  if (!_tournament) return;
  const lastRound = _tournament.rounds[_tournament.currentRound - 1];
  const winners = lastRound.matches.map(m => m.winner).filter(Boolean);

  if (winners.length === 1) {
    // Tournament complete
    _tournament.complete = true;
    _tournament.champion = winners[0];
    saveTournament(_tournament);
    const prizeShards = _tournament.size === 8 ? 400 : 200;
    if (winners[0] === (MY_NAME || 'You')) {
      addShards(prizeShards, '🏆 Tournament!');
      showToast(`🏆 You won the tournament! +${prizeShards} 💎`, 'fa-crown', 5000);
    }
    openTournament();
    return;
  }

  // Build next round
  const nextMatches = [];
  for (let i = 0; i < winners.length; i += 2) {
    nextMatches.push({ p1: winners[i], p2: winners[i+1] || 'BYE', winner: null });
  }
  nextMatches.forEach(m => { if (m.p2 === 'BYE') m.winner = m.p1; });
  _tournament.currentRound++;
  _tournament.rounds.push({ matches: nextMatches });
  saveTournament(_tournament);

  const nextReal = nextMatches.find(m => !m.winner);
  if (nextReal) {
    setTimeout(playTournamentMatch, 800);
  } else {
    advanceTournamentRound();
  }
}

function resetTournament() {
  _tournament = null;
  try { localStorage.removeItem(TOURN_KEY); } catch(e) {}
  renderTournamentUI();
}

// Tournament win is now handled directly inside checkWin above

// ═══════════════════════════════════════════════════════════════
// DAILY LOGIN BONUS
// ═══════════════════════════════════════════════════════════════
function checkDailyBonus() {
  try {
    const last = parseInt(localStorage.getItem(DAILY_KEY) || '0', 10);
    const now  = Date.now();
    const dayMs = 86400000;
    if (now - last < dayMs) return; // already claimed today
    localStorage.setItem(DAILY_KEY, String(now));
    const bonus = 10;
    addShards(bonus, 'Daily Bonus!');
    // Show bonus pop
    const anchor = document.getElementById('daily-bonus-anchor');
    if (!anchor) return;
    const pop = document.createElement('div');
    pop.className = 'daily-bonus-pop';
    pop.innerHTML = `
      <div class="daily-bonus-icon">🎁</div>
      <div class="daily-bonus-text">
        <div class="daily-bonus-title">Daily Bonus! +${bonus} 💎</div>
        <div class="daily-bonus-sub">Come back tomorrow for another reward</div>
      </div>
      <button class="daily-bonus-close" onclick="this.parentElement.remove()"><i class="fas fa-times"></i></button>
    `;
    document.body.appendChild(pop);
    setTimeout(() => pop.remove(), 6000);
  } catch(e) {}
}

// ═══════════════════════════════════════════════════════════════
// SHOP AFFORDABILITY NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════
let _lastNotifiedItem = null;
function checkShopAffordability() {
  const shards = getShards();
  const data = getShopData();
  const allItems = [...SHOP_ITEMS.cardBacks, ...SHOP_ITEMS.perks];
  for (const item of allItems) {
    if (item.price === 0) continue;
    if (data[item.id] && !item.consumable) continue; // already owned
    if (shards >= item.price && _lastNotifiedItem !== item.id) {
      _lastNotifiedItem = item.id;
      setTimeout(() => {
        showToast(`💎 You can now afford "${item.name}" ${item.icon}`, 'fa-shopping-cart', 4000);
      }, 800);
      break; // only notify one at a time
    }
  }
}

// Also wire invite listener onto refreshLobbyBrowser
const _origRefreshLobbyBrowser = refreshLobbyBrowser;
async function refreshLobbyBrowser() {
  await _origRefreshLobbyBrowser();
  wireInviteListener();
}

// ═══════════════════════════════════════════════════════════════
// BOOT
// ═══════════════════════════════════════════════════════════════
(async function boot() {
  // ── Discord Activity: SDK auth runs first, gets user identity directly ──
  // ── Browser fallback: handles OAuth callback from popup if ?code= present ──
  tryInitDiscordSdk().catch(() => {});
  const hasSupa = initSupabase();
  if (!hasSupa) console.warn('Running without Supabase.');
  // Handle browser OAuth popup callback (non-Activity only)
  if (!discordSdk) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('code')) {
      await handleOAuthCallback();
    }
  }
  // Restore Discord profile chip if already logged in
  const existingUser = getDiscordUser();
  if (existingUser) {
    updateDiscordProfileUI(existingUser);
    if (!MY_NAME) MY_NAME = existingUser.username.split('#')[0];
    syncUserWithSupabase(existingUser).catch(()=>{});
  }
  // Daily bonus
  setTimeout(checkDailyBonus, 2000);
  // Init live stats
  updateLiveStats();
  setInterval(updateLiveStats, 12000);
  // Shard HUD
  updateShardHUD();
  // Check shop affordability on load
  setTimeout(checkShopAffordability, 3000);
  // Start card floaters
  setTimeout(startCardFloaters, 1500);
  // Progression + challenges + theme
  setTimeout(initProgression, 2000);
  setTimeout(checkAndRefreshChallenges, 2500);
  setTimeout(loadEquippedTheme, 100);
})();

// ═══════════════════════════════════════════════════════════════
// PLAYER PROGRESSION — XP · Levels · Titles · Badges
// ═══════════════════════════════════════════════════════════════
const XP_KEY   = 'nixai_xp_v1';
const PROG_KEY = 'nixai_prog_v1';
const XP_PER_LEVEL = [0,100,250,450,700,1000,1400,1900,2500,3200,4000,5000,6200,7600,9200,11000,13200,15600,18400,21600,25000];
const MAX_LEVEL = XP_PER_LEVEL.length - 1;
const TITLES_BY_LEVEL = {1:'Rookie',2:'Card Tosser',3:'Hand Watcher',4:'Stack Player',5:'Wild Caller',6:'Uno Crier',7:'Combo Starter',8:'Draw Dodger',9:'Reverse Master',10:'Skip Lord',11:'Chaos Agent',12:'Card Demon',13:'UNO Veteran',14:'Stack Wizard',15:'Shard Hunter',16:'Neon Shark',17:'Galaxy Brain',18:'Blaze Runner',19:'Echo Protocol',20:'UNO Master'};
const BADGES = [
  {id:'b_first_win', icon:'🏆',name:'First Blood',  desc:'Win your first game',    check:p=>p.wins>=1},
  {id:'b_streak3',   icon:'🔥',name:'On Fire',      desc:'3 win streak',           check:_=>getWinStreak()>=3},
  {id:'b_streak5',   icon:'💥',name:'Unstoppable',  desc:'5 win streak',           check:_=>getWinStreak()>=5},
  {id:'b_level5',    icon:'⭐',name:'Rising Star',  desc:'Reach Level 5',          check:p=>p.level>=5},
  {id:'b_level10',   icon:'🌟',name:'Veteran',      desc:'Reach Level 10',         check:p=>p.level>=10},
  {id:'b_level20',   icon:'👑',name:'Legend',       desc:'Reach Level 20',         check:p=>p.level>=20},
  {id:'b_shard1000', icon:'💎',name:'Shard Hoarder',desc:'Collect 1,000 shards',   check:_=>getShards()>=1000},
  {id:'b_shard5000', icon:'💠',name:'Shard Baron',  desc:'Collect 5,000 shards',   check:_=>getShards()>=5000},
  {id:'b_combo4',    icon:'⚡',name:'Quad Stack',   desc:'Play a 4-card combo',    check:p=>(p.maxCombo||0)>=4},
  {id:'b_win10',     icon:'🎯',name:'Marksman',     desc:'Win 10 games',           check:p=>p.wins>=10},
  {id:'b_win50',     icon:'🏅',name:'Hall of Fame', desc:'Win 50 games',           check:p=>p.wins>=50},
  {id:'b_ai_hard',   icon:'🤖',name:'AI Slayer',    desc:'Beat Hard AI',           check:p=>(p.beatenHardAi||0)>=1},
];

function getProgData(){try{return JSON.parse(localStorage.getItem(PROG_KEY)||'{}')}catch(e){return {}}}
function saveProgData(d){try{localStorage.setItem(PROG_KEY,JSON.stringify(d))}catch(e){}}
function getTotalXP(){try{return parseInt(localStorage.getItem(XP_KEY)||'0',10)}catch(e){return 0}}
function saveTotalXP(n){try{localStorage.setItem(XP_KEY,String(n))}catch(e){}}
function getLevelFromXP(xp){for(let i=MAX_LEVEL;i>=0;i--){if(xp>=XP_PER_LEVEL[i])return i;}return 0;}
function getXPForNextLevel(level){return level>=MAX_LEVEL?XP_PER_LEVEL[MAX_LEVEL]:XP_PER_LEVEL[level+1];}
function getPlayerTitle(level){return TITLES_BY_LEVEL[Math.min(level,MAX_LEVEL)]||'UNO Master';}

function awardXP(amount, reason) {
  const prev=getTotalXP(), prevLv=getLevelFromXP(prev), newXP=prev+amount;
  saveTotalXP(newXP);
  const newLv=getLevelFromXP(newXP);
  if(newLv>prevLv){const p=getProgData();p.level=newLv;saveProgData(p);showLevelUpModal(newLv);addShards(newLv*10,`Level ${newLv} bonus!`);}
  showXPPop(amount, reason);
  checkBadges();
  updateShardHUDWithLevel();
}

function showXPPop(xp, reason) {
  const pop=document.createElement('div');
  pop.style.cssText=`position:fixed;z-index:500;font-family:'Fredoka One',cursive;font-size:15px;color:#a5b4fc;text-shadow:0 0 12px rgba(165,180,252,.8);pointer-events:none;animation:rewardFloat 1.8s ease forwards;left:${20+Math.random()*30}%;top:38%;`;
  pop.textContent=`+${xp} XP  ${reason||''}`;
  document.body.appendChild(pop);
  setTimeout(()=>pop.remove(),2000);
}

function showLevelUpModal(level) {
  const title=getPlayerTitle(level);
  const mod=document.createElement('div');
  mod.style.cssText='position:fixed;inset:0;z-index:600;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,.78);backdrop-filter:blur(8px);';
  mod.innerHTML=`<div style="background:linear-gradient(135deg,#1e2040,#161829);border:2px solid rgba(165,180,252,.4);border-radius:24px;padding:30px 26px;text-align:center;max-width:290px;width:90%;animation:cardReveal .5s cubic-bezier(.34,1.56,.64,1) both;box-shadow:0 0 60px rgba(129,140,248,.3);">
    <div style="font-size:44px;margin-bottom:6px;">⬆️</div>
    <div style="font-family:'Fredoka One',cursive;font-size:11px;color:var(--accent2);letter-spacing:.14em;text-transform:uppercase;margin-bottom:3px;">Level Up!</div>
    <div style="font-family:'Fredoka One',cursive;font-size:36px;background:linear-gradient(135deg,#a5b4fc,#f9c023);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;margin-bottom:3px;">Level ${level}</div>
    <div style="font-family:'Fredoka One',cursive;font-size:17px;color:#fff;margin-bottom:8px;">${title}</div>
    <div style="font-size:12px;color:var(--muted);font-weight:700;margin-bottom:16px;">+${level*10} 💎 Bonus Shards!</div>
    <button onclick="this.closest('div[style*=fixed]').remove()" style="background:linear-gradient(135deg,#818cf8,#5865F2);border:none;border-radius:11px;padding:9px 24px;font-family:'Fredoka One',cursive;font-size:14px;color:#fff;cursor:pointer;">Let's Go! 🎮</button>
  </div>`;
  document.body.appendChild(mod);
  playSound('win');
  setTimeout(()=>{if(mod.parentNode)mod.remove();},8000);
}

function checkBadges() {
  const prog=getProgData();
  prog.badges=prog.badges||[];
  prog.level=getLevelFromXP(getTotalXP());
  prog.wins=getLocalHistory().filter(h=>h.result==='win').length;
  const newB=[];
  for(const b of BADGES){if(!prog.badges.includes(b.id)&&b.check(prog)){prog.badges.push(b.id);newB.push(b);}}
  saveProgData(prog);
  newB.forEach((b,i)=>setTimeout(()=>showToast(`${b.icon} Badge unlocked: ${b.name}!`,'fa-award',4000),i*1300));
}

function initProgression(){const p=getProgData();if(!p.level){p.level=getLevelFromXP(getTotalXP());saveProgData(p);}updateShardHUDWithLevel();}

function updateShardHUDWithLevel(){
  const el=document.getElementById('shard-hud');if(!el)return;
  el.querySelectorAll('.hud-level-badge').forEach(e=>e.remove());
  const b=document.createElement('span');b.className='hud-level-badge';
  b.style.cssText='font-size:10px;font-weight:900;color:#a5b4fc;background:rgba(88,101,242,.2);border-radius:6px;padding:1px 5px;margin-left:2px;';
  b.textContent=`Lv.${getLevelFromXP(getTotalXP())}`;el.appendChild(b);
}

// ═══════════════════════════════════════════════════════════════
// DAILY & WEEKLY CHALLENGES
// ═══════════════════════════════════════════════════════════════
const CHALLENGES_KEY='nixai_challenges_v1';
const DAILY_POOL=[
  {id:'dc_play3',   icon:'🃏',text:'Play 3 UNO matches',          goal:3,  key:'gamesPlayed',xp:80, shards:30},
  {id:'dc_win1',    icon:'🏆',text:'Win 1 UNO game',              goal:1,  key:'wins',       xp:120,shards:50},
  {id:'dc_special5',icon:'⚡',text:'Play 5 special cards',        goal:5,  key:'specials',   xp:60, shards:25},
  {id:'dc_combo3',  icon:'🔥',text:'Land a 3+ card combo',        goal:1,  key:'combos',     xp:100,shards:40},
  {id:'dc_nodraw',  icon:'🎯',text:'Win without drawing a card',  goal:1,  key:'noDrawWin',  xp:150,shards:70},
  {id:'dc_hardai',  icon:'🤖',text:'Beat the Hard AI',            goal:1,  key:'hardAiWin',  xp:200,shards:100},
  {id:'dc_shoutuno',icon:'📢',text:'Shout UNO 3 times',           goal:3,  key:'unoShouts',  xp:50, shards:20},
  {id:'dc_wild3',   icon:'🌀',text:'Play 3 Wild cards',           goal:3,  key:'wilds',      xp:70, shards:30},
];
const WEEKLY_POOL=[
  {id:'wc_win5',    icon:'🏅',text:'Win 5 games this week',       goal:5,  key:'wins',       xp:400,shards:150},
  {id:'wc_play10',  icon:'🎮',text:'Play 10 UNO matches',         goal:10, key:'gamesPlayed',xp:300,shards:100},
  {id:'wc_combos5', icon:'💥',text:'Land 5 combos',               goal:5,  key:'combos',     xp:350,shards:120},
  {id:'wc_shards500',icon:'💎',text:'Earn 500 shards from wins',  goal:500,key:'shardsWon',  xp:500,shards:200},
];

function getChallengeData(){try{return JSON.parse(localStorage.getItem(CHALLENGES_KEY)||'{}')}catch(e){return {}}}
function saveChallengeData(d){try{localStorage.setItem(CHALLENGES_KEY,JSON.stringify(d))}catch(e){}}

function checkAndRefreshChallenges(){
  let d=getChallengeData();const now=Date.now();
  if(!d.dailyExpiry||now>d.dailyExpiry){d.daily=[...DAILY_POOL].sort(()=>Math.random()-.5).slice(0,3).map(c=>({...c,completed:false}));d.dailyExpiry=now+86400000;d.dailyProgress={};}
  if(!d.weeklyExpiry||now>d.weeklyExpiry){d.weekly=[...WEEKLY_POOL].sort(()=>Math.random()-.5).slice(0,2).map(c=>({...c,completed:false}));d.weeklyExpiry=now+7*86400000;d.weeklyProgress={};}
  saveChallengeData(d);
}

function progressChallenge(key,amount){
  amount=amount||1;
  try{
    let d=getChallengeData();d.dailyProgress=d.dailyProgress||{};d.weeklyProgress=d.weeklyProgress||{};
    (d.daily||[]).forEach(c=>{if(c.completed||c.key!==key)return;d.dailyProgress[c.id]=(d.dailyProgress[c.id]||0)+amount;if(d.dailyProgress[c.id]>=c.goal){c.completed=true;awardXP(c.xp,`Daily: ${c.icon}`);addShards(c.shards,'Daily Challenge!');showToast(`✅ Daily: ${c.text}`,'fa-check-circle',4000);}});
    (d.weekly||[]).forEach(c=>{if(c.completed||c.key!==key)return;d.weeklyProgress[c.id]=(d.weeklyProgress[c.id]||0)+amount;if(d.weeklyProgress[c.id]>=c.goal){c.completed=true;awardXP(c.xp,`Weekly: ${c.icon}`);addShards(c.shards,'Weekly Challenge!');showToast(`🏅 Weekly: ${c.text}`,'fa-crown',4000);}});
    saveChallengeData(d);
  }catch(e){}
}

function openChallengesModal(){
  let mod=document.getElementById('challenges-modal');
  if(!mod){
    mod=document.createElement('div');mod.id='challenges-modal';
    mod.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:410;align-items:flex-start;justify-content:center;backdrop-filter:blur(10px);overflow-y:auto;padding:24px 12px 60px;';
    mod.innerHTML=`<div style="background:var(--surface);border:1px solid rgba(129,140,248,.3);border-radius:24px;padding:26px 20px;width:100%;max-width:440px;box-shadow:0 24px 80px rgba(0,0,0,.8);animation:cardReveal .35s cubic-bezier(.34,1.56,.64,1) both;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;">
        <div style="font-family:'Fredoka One',cursive;font-size:22px;color:#a5b4fc;"><i class="fas fa-tasks"></i> Challenges</div>
        <button onclick="document.getElementById('challenges-modal').style.display='none'" style="background:rgba(255,255,255,.08);border:none;color:#9ca3af;width:32px;height:32px;border-radius:8px;font-size:16px;cursor:pointer;"><i class="fas fa-times"></i></button>
      </div>
      <div id="challenges-body"></div>
    </div>`;
    mod.addEventListener('click',e=>{if(e.target===mod)mod.style.display='none';});
    document.body.appendChild(mod);
  }
  mod.style.display='flex';renderChallengesBody();
}

function renderChallengesBody(){
  checkAndRefreshChallenges();
  const d=getChallengeData(),body=document.getElementById('challenges-body');
  if(!body)return;
  const now=Date.now();
  function msToTime(ms){const h=Math.floor(ms/3600000),m=Math.floor((ms%3600000)/60000);return h>0?`${h}h ${m}m`:`${m}m`;}
  function renderList(list,prog,label,expiry){
    return `<div style="font-size:10px;font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:10px;display:flex;justify-content:space-between;"><span>${label}</span><span style="color:var(--timer-warn);"><i class="fas fa-clock" style="font-size:9px;"></i> ${msToTime(Math.max(0,expiry-now))}</span></div>
    ${(list||[]).map(c=>{const p=(prog||{})[c.id]||0,pct=Math.min(100,Math.round(p/c.goal*100));return `<div style="background:rgba(255,255,255,.04);border:1px solid ${c.completed?'rgba(34,197,94,.35)':'rgba(255,255,255,.08)'};border-radius:14px;padding:12px 14px;margin-bottom:10px;${c.completed?'opacity:.6':''}">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;"><span style="font-size:22px;">${c.icon}</span><div style="flex:1;"><div style="font-size:13px;font-weight:800;color:${c.completed?'#4ade80':'#fff'};">${c.completed?'✅ ':''}${c.text}</div><div style="font-size:10px;color:var(--muted);font-weight:700;">+${c.xp} XP · +${c.shards} 💎</div></div></div>
      <div style="background:rgba(255,255,255,.07);border-radius:20px;height:6px;overflow:hidden;"><div style="background:${c.completed?'#22c55e':'linear-gradient(90deg,#818cf8,#5865F2)'};height:100%;width:${pct}%;border-radius:20px;"></div></div>
      <div style="font-size:10px;color:var(--muted);font-weight:700;margin-top:4px;text-align:right;">${p}/${c.goal}</div>
    </div>`}).join('')}`;
  }
  body.innerHTML=renderList(d.daily,d.dailyProgress,'⚡ Daily',d.dailyExpiry||0)+'<div style="height:14px;"></div>'+renderList(d.weekly,d.weeklyProgress,'📅 Weekly',d.weeklyExpiry||0);
}

// ═══════════════════════════════════════════════════════════════
// TABLE THEMES
// ═══════════════════════════════════════════════════════════════
function shopThemeAction(id){
  const data=getShopData(),item=(SHOP_ITEMS.tableThemes||[]).find(x=>x.id===id);
  if(!item)return;
  if(item.price>0&&!data[id]){const s=getShards();if(s<item.price){showToast('Not enough Shards!','fa-times-circle');return;}saveShards(s-item.price);data[id]=true;showToast(`Bought "${item.name}" theme! 💎`,'fa-check-circle');}
  data.equippedTheme=id;saveShopData(data);applyTableTheme(id);updateShardHUD();renderShopItems();
  document.getElementById('shop-shard-count').textContent=getShards().toLocaleString();
}
function applyTableTheme(themeId){const item=(SHOP_ITEMS.tableThemes||[]).find(x=>x.id===(themeId||'tt_default'));if(item)document.body.style.background=item.bg||'#0d0e1c';}
function loadEquippedTheme(){const d=getShopData();applyTableTheme(d.equippedTheme||'tt_default');}

// ═══════════════════════════════════════════════════════════════
// PROFILE CARD
// ═══════════════════════════════════════════════════════════════
function openProfileModal(){
  let mod=document.getElementById('profile-modal');
  if(!mod){
    mod=document.createElement('div');mod.id='profile-modal';
    mod.style.cssText='display:none;position:fixed;inset:0;background:rgba(0,0,0,.82);z-index:410;align-items:flex-start;justify-content:center;backdrop-filter:blur(10px);overflow-y:auto;padding:24px 12px 60px;';
    mod.innerHTML=`<div style="background:var(--surface);border:1px solid rgba(129,140,248,.25);border-radius:24px;width:100%;max-width:400px;overflow:hidden;animation:cardReveal .35s cubic-bezier(.34,1.56,.64,1) both;box-shadow:0 24px 80px rgba(0,0,0,.8);"><div id="profile-card-inner"></div></div>`;
    mod.addEventListener('click',e=>{if(e.target===mod)mod.style.display='none';});
    document.body.appendChild(mod);
  }
  mod.style.display='flex';renderProfileCard();
}

function renderProfileCard(){
  const inner=document.getElementById('profile-card-inner');if(!inner)return;
  const dcUser=getDiscordUser(),xp=getTotalXP(),level=getLevelFromXP(xp),title=getPlayerTitle(level);
  const nextXP=getXPForNextLevel(level),prevXP=XP_PER_LEVEL[level]||0;
  const pct=level>=MAX_LEVEL?100:Math.round(((xp-prevXP)/(nextXP-prevXP))*100);
  const prog=getProgData(),hist=getLocalHistory(),wins=hist.filter(h=>h.result==='win').length;
  const skin=getEquippedSkin();
  const skinDiv=`<div style="width:36px;height:54px;border-radius:6px;background:linear-gradient(145deg,${skin.colors.join(',')});border:2px solid rgba(255,255,255,.15);display:inline-flex;align-items:center;justify-content:center;font-family:'Fredoka One',cursive;font-size:9px;color:rgba(255,255,255,.8);transform:rotate(-8deg);box-shadow:0 4px 12px rgba(0,0,0,.5);">UNO</div>`;
  const avatarHtml=dcUser?.avatar_url?`<img src="${dcUser.avatar_url}" style="width:64px;height:64px;border-radius:50%;border:3px solid rgba(129,140,248,.6);object-fit:cover;">`:`<div style="width:64px;height:64px;border-radius:50%;background:linear-gradient(135deg,#5865F2,#818cf8);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:900;color:#fff;border:3px solid rgba(129,140,248,.4);">${(MY_NAME||'?').slice(0,1).toUpperCase()}</div>`;
  inner.innerHTML=`
    <div style="height:72px;background:linear-gradient(135deg,#1a1a3e,#2d1b6e,#1a1a3e);position:relative;overflow:hidden;">
      <div style="position:absolute;inset:0;background:radial-gradient(ellipse at 60% 50%,rgba(129,140,248,.2),transparent 70%);"></div>
      <div style="position:absolute;top:10px;right:12px;font-size:10px;font-weight:900;color:#a78bfa;background:rgba(124,58,237,.25);border:1px solid rgba(124,58,237,.3);border-radius:10px;padding:2px 9px;"><i class="fas fa-star" style="font-size:8px;"></i> ${title}</div>
      <button onclick="document.getElementById('profile-modal').style.display='none'" style="position:absolute;top:8px;left:10px;background:rgba(0,0,0,.4);border:none;color:#9ca3af;width:26px;height:26px;border-radius:7px;cursor:pointer;font-size:12px;"><i class="fas fa-times"></i></button>
    </div>
    <div style="padding:0 18px 20px;margin-top:-32px;">
      <div style="display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:12px;">
        <div style="position:relative;">${avatarHtml}<div style="position:absolute;bottom:-2px;right:-2px;background:linear-gradient(135deg,#5865F2,#818cf8);border-radius:7px;padding:1px 5px;font-family:'Fredoka One',cursive;font-size:11px;color:#fff;border:2px solid #161829;">${level}</div></div>
        ${skinDiv}
      </div>
      <div style="font-family:'Fredoka One',cursive;font-size:20px;color:#fff;margin-bottom:2px;">${dcUser?.username?.split('#')[0]||MY_NAME||'Guest'}</div>
      <div style="font-size:11px;color:var(--muted);font-weight:700;margin-bottom:12px;">${dcUser?'Discord linked ✓':'Guest mode'}</div>
      <div style="margin-bottom:12px;">
        <div style="display:flex;justify-content:space-between;font-size:10px;font-weight:900;color:var(--muted);margin-bottom:4px;text-transform:uppercase;letter-spacing:.06em;"><span>Level ${level}</span><span>${level>=MAX_LEVEL?'MAX':xp.toLocaleString()+' / '+nextXP.toLocaleString()+' XP'}</span></div>
        <div style="background:rgba(255,255,255,.07);border-radius:20px;height:7px;overflow:hidden;"><div style="background:linear-gradient(90deg,#818cf8,#a5b4fc);height:100%;width:${pct}%;border-radius:20px;box-shadow:0 0 8px rgba(129,140,248,.5);"></div></div>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:7px;margin-bottom:14px;">
        ${[['🏆','Wins',wins],['🎮','Games',hist.length],['🔥','Streak',getWinStreak()],['💎','Shards',getShards().toLocaleString()]].map(([ic,lb,vl])=>`<div style="background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.08);border-radius:11px;padding:9px 5px;text-align:center;"><div style="font-size:16px;margin-bottom:2px;">${ic}</div><div style="font-family:'Fredoka One',cursive;font-size:14px;color:#fff;">${vl}</div><div style="font-size:8px;color:var(--muted);font-weight:800;letter-spacing:.05em;">${lb}</div></div>`).join('')}
      </div>
      <div style="font-size:10px;font-weight:900;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);margin-bottom:8px;"><i class="fas fa-award"></i> Badges (${(prog.badges||[]).length}/${BADGES.length})</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;">
        ${BADGES.map(b=>{const earned=(prog.badges||[]).includes(b.id);return `<div title="${b.name}: ${b.desc}" style="background:rgba(255,255,255,${earned?'.08':'.03'});border:1px solid rgba(255,255,255,${earned?'.14':'.05'});border-radius:9px;padding:5px 7px;text-align:center;min-width:42px;opacity:${earned?1:.3};"><div style="font-size:16px;">${b.icon}</div><div style="font-size:8px;font-weight:800;color:${earned?'#d1d5db':'var(--muted)'};max-width:48px;line-height:1.2;">${b.name}</div></div>`;}).join('')}
      </div>
      <button onclick="openChallengesModal()" style="width:100%;background:rgba(129,140,248,.12);border:1px solid rgba(129,140,248,.3);border-radius:11px;padding:9px;font-family:'Nunito',sans-serif;font-size:12px;font-weight:800;color:#a5b4fc;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:7px;"><i class="fas fa-tasks"></i> View Daily Challenges</button>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════
// LAUNCHER QUICK BUTTONS
// ═══════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded',()=>{
  setTimeout(()=>{
    const qRow=document.querySelector('#screen-launcher div[style*="gap:8px"][style*="justify-content:center"]');
    if(!qRow||qRow.querySelector('.nixai-ext-btn'))return;
    const mkBtn=(icon,label,fn)=>{const b=document.createElement('button');b.className='btn nixai-ext-btn';b.style.cssText='background:rgba(129,140,248,.12);border:1px solid rgba(129,140,248,.25);color:#a5b4fc;font-size:12px;padding:7px 14px;';b.innerHTML=`<i class="fas ${icon}"></i> ${label}`;b.onclick=fn;return b;};
    qRow.appendChild(mkBtn('fa-tasks','Challenges',openChallengesModal));
    qRow.appendChild(mkBtn('fa-user-circle','Profile',openProfileModal));
  },200);
});
