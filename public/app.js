// Royal Mexican Casino — cliente (demo con fichas de prueba).
'use strict';

const $ = (s, el) => (el || document).querySelector(s);
const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
const fmt = (n) => '$' + Number(n).toLocaleString('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: 2 });

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...(opts || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Error de conexión');
  return data;
}

// ------------------------------ Sonido (WebAudio) ------------------------------
let soundOn = localStorage.getItem('rmc-sound') !== 'off';
let audioCtx = null;
function beep(freq, dur, type, vol, when) {
  if (!soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'sine';
    o.frequency.value = freq;
    g.gain.value = vol || 0.08;
    o.connect(g); g.connect(audioCtx.destination);
    const t = audioCtx.currentTime + (when || 0);
    o.start(t); o.stop(t + dur);
  } catch (e) { /* sin audio */ }
}
const sndClick = () => beep(600, 0.06, 'square', 0.05);
const sndSpin = () => { for (let i = 0; i < 5; i++) beep(300 + i * 120, 0.07, 'triangle', 0.06, i * 0.09); };
const sndWin = () => { [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.18, 'sine', 0.09, i * 0.1)); };
const sndCoin = () => { beep(1200, 0.08, 'sine', 0.08); beep(1600, 0.12, 'sine', 0.08, 0.08); };

// ------------------------------ Estado ------------------------------
let me = null;
let slots = [];
let currentSlot = null;
let slotBusy = false;
let autoLeft = 0;
let roulettePick = null; // {type, value}
let vpHeld = new Set();
let vpActive = false;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.add('hidden'), 3200);
}

function setBalances(balance, vip) {
  $$('.js-balance').forEach((el) => { el.textContent = fmt(balance); });
  const b = $('#balance');
  if (b) b.textContent = fmt(balance);
  if (vip && $('#vip-badge')) $('#vip-badge').textContent = vip.level;
}

function showView(id) {
  $$('.view').forEach((v) => v.classList.add('hidden'));
  $('#' + id).classList.remove('hidden');
  $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.nav === id.replace('view-', '')));
  window.scrollTo(0, 0);
}

function openOverlay(id) { $('#' + id).classList.remove('hidden'); }
function closeOverlays() { $$('.overlay').forEach((o) => o.classList.add('hidden')); }

// ------------------------------ Auth ------------------------------
let authMode = 'login';
function setAuthMode(mode) {
  authMode = mode;
  $('#tab-login').classList.toggle('active', mode === 'login');
  $('#tab-register').classList.toggle('active', mode === 'register');
  $('#auth-submit').textContent = mode === 'login' ? 'Entrar' : 'Crear mi cuenta';
  $('#auth-error').classList.add('hidden');
}
$('#tab-login').addEventListener('click', () => setAuthMode('login'));
$('#tab-register').addEventListener('click', () => setAuthMode('register'));

$('#auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const phone = $('#auth-phone').value.trim();
  const password = $('#auth-password').value;
  $('#auth-error').classList.add('hidden');
  try {
    const data = await api(authMode === 'login' ? '/api/login' : '/api/register', {
      method: 'POST', body: JSON.stringify({ phone, password }),
    });
    me = data.user;
    sndWin();
    toast(authMode === 'login' ? '¡Bienvenido de nuevo! 👑' : '¡Cuenta creada! Tienes $1,000 en fichas de prueba 🎉');
    await enterLobby();
  } catch (err) {
    const el = $('#auth-error');
    el.textContent = err.message;
    el.classList.remove('hidden');
  }
});

$('#btn-logout').addEventListener('click', async () => {
  try { await api('/api/logout', { method: 'POST' }); } catch (e) {}
  me = null;
  showView('view-auth');
});

// ------------------------------ Lobby ------------------------------
async function enterLobby() {
  const data = await api('/api/me');
  me = data.user;
  setBalances(me.balance, me.vip);
  $('#nav-admin').classList.toggle('hidden', !me.isAdmin);
  await loadSlots();
  loadInviteUrl();
  showView('view-lobby');
}

async function loadSlots() {
  const data = await api('/api/slots');
  slots = data.slots;
  const grid = $('#slot-grid');
  grid.innerHTML = '';
  for (const s of slots) {
    const card = document.createElement('article');
    card.className = 'game-card';
    card.dataset.cat = 'slot';
    card.dataset.name = s.name;
    card.innerHTML = `
      <div class="game-art slot-art"><img src="/assets/${s.art.WILD}" alt="${s.name}"><span class="game-tag">SLOT</span></div>
      <h3>${s.name}</h3>
      <p>${s.tagline}</p>
      <button class="btn-gold play-btn" data-open="slot" data-slot="${s.id}">JUGAR AHORA</button>`;
    grid.appendChild(card);
  }
  applyFilter();
}

async function loadInviteUrl() {
  try {
    const data = await api('/api/config');
    $('#invite-url').value = data.publicUrl || window.location.origin;
  } catch (e) {
    $('#invite-url').value = window.location.origin;
  }
}
$('#btn-copy-invite').addEventListener('click', async () => {
  const url = $('#invite-url').value;
  try { await navigator.clipboard.writeText(url); } catch (e) {
    $('#invite-url').select();
    document.execCommand('copy');
  }
  $('#invite-copied').classList.remove('hidden');
  setTimeout(() => $('#invite-copied').classList.add('hidden'), 2500);
});

let currentCat = 'todos';
function applyFilter() {
  const q = ($('#search').value || '').toLowerCase();
  $$('.game-card').forEach((c) => {
    const okCat = currentCat === 'todos' || c.dataset.cat === currentCat;
    const okQ = !q || (c.dataset.name || '').toLowerCase().includes(q);
    c.style.display = okCat && okQ ? '' : 'none';
  });
}
$('#search').addEventListener('input', applyFilter);
$$('.cat').forEach((b) => b.addEventListener('click', () => {
  currentCat = b.dataset.cat;
  $$('.cat').forEach((x) => x.classList.toggle('active', x === b));
  applyFilter();
}));

$('#btn-sound').addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('rmc-sound', soundOn ? 'on' : 'off');
  $('#btn-sound').textContent = soundOn ? '🔊' : '🔇';
  if (soundOn) sndClick();
});
$('#btn-sound').textContent = soundOn ? '🔊' : '🔇';

// Navegación inferior y botones de volver
$$('.nav-btn').forEach((b) => b.addEventListener('click', () => {
  const v = b.dataset.nav;
  if (v === 'lobby') showView('view-lobby');
  else if (v === 'vip') { loadVip(); showView('view-vip'); }
  else if (v === 'history') { loadHistory(); showView('view-history'); }
  else if (v === 'rules') showView('view-rules');
  else if (v === 'admin') { loadAdmin(); showView('view-admin'); }
}));
$$('[data-back]').forEach((b) => b.addEventListener('click', () => showView('view-lobby')));
$$('[data-close]').forEach((b) => b.addEventListener('click', () => { closeOverlays(); autoLeft = 0; }));

// Abrir juegos (delegación, incluye tarjetas generadas dinámicamente)
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-open]');
  if (!btn) return;
  sndClick();
  const game = btn.dataset.open;
  if (game === 'slot') openSlot(btn.dataset.slot || 'fiesta');
  else if (game === 'roulette') openOverlay('overlay-roulette');
  else if (game === 'blackjack') openOverlay('overlay-blackjack');
  else if (game === 'baccarat') openOverlay('overlay-baccarat');
  else if (game === 'videopoker') openOverlay('overlay-videopoker');
});

// ------------------------------ VIP ------------------------------
async function loadVip() {
  try {
    const v = await api('/api/vip');
    $('#vip-level').textContent = v.level;
    $('#vip-progress').style.width = Math.round(v.progress * 100) + '%';
    $('#vip-next').textContent = v.next
      ? `Te faltan ${fmt(v.wageredToNext)} jugados para ${v.next}`
      : '¡Llegaste al nivel máximo REAL! 👑';
    $('#vip-wagered').textContent = fmt(v.wagered);
    const ladder = $('#vip-ladder');
    ladder.innerHTML = '';
    v.ladder.forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'vip-row' + (i === v.levelIndex ? ' current' : i < v.levelIndex ? ' done' : '');
      row.innerHTML = `<span>${i < v.levelIndex ? '✅ ' : i === v.levelIndex ? '👉 ' : ''}${l.name}</span><span class="req">${l.req === 0 ? 'Nivel inicial' : 'desde ' + fmt(l.req) + ' jugados'}</span>`;
      ladder.appendChild(row);
    });
  } catch (err) { toast(err.message); }
}

// ------------------------------ Historial ------------------------------
const GAME_NAMES = { slot: '🎰 Tragamonedas', 'slot-respin': '🪙 Respin Dorado', roulette: '🎡 Ruleta', blackjack: '🃏 Blackjack', baccarat: '🎴 Bacará', videopoker: '🃏 Video Póker' };
async function loadHistory() {
  try {
    const data = await api('/api/history');
    const list = $('#history-list');
    if (!data.history.length) { list.innerHTML = '<p class="muted">Aún no tienes jugadas. ¡Gira algo!</p>'; return; }
    list.innerHTML = '';
    for (const h of data.history) {
      const row = document.createElement('div');
      row.className = 'history-row';
      const net = h.win - h.bet;
      row.innerHTML = `<span>${GAME_NAMES[h.game] || h.game}<br><small class="muted">${new Date(h.createdAt + 'Z').toLocaleString('es-MX')}</small></span>
        <span>Apuesta ${fmt(h.bet)}</span>
        <span class="${net >= 0 ? 'win' : 'lose'}">${net >= 0 ? '+' : ''}${fmt(net)}</span>`;
      list.appendChild(row);
    }
  } catch (err) { toast(err.message); }
}

// ------------------------------ Admin ------------------------------
async function loadAdmin() {
  try {
    const stats = await api('/api/admin/stats');
    $('#admin-stats').innerHTML = `
      <div class="stat-box"><b>${stats.totalPlayers}</b><span>Jugadores</span></div>
      <div class="stat-box"><b>${fmt(stats.totalWagered)}</b><span>Total jugado</span></div>`;
    const data = await api('/api/admin/players');
    const list = $('#admin-list');
    list.innerHTML = '';
    for (const p of data.players) {
      const row = document.createElement('div');
      row.className = 'admin-row';
      row.innerHTML = `
        <div class="who"><b>${p.isAdmin ? '👑 ' : ''}${p.phone}</b><span>VIP ${p.vip} · desde ${new Date(p.createdAt + 'Z').toLocaleDateString('es-MX')}</span></div>
        <div class="bal"><b>${fmt(p.balance)}</b><span>jugado: ${fmt(p.totalWagered)}</span><br>
        <button class="btn-dark btn-reset" data-reset="${p.id}">Restablecer saldo</button></div>`;
      list.appendChild(row);
    }
    $$('[data-reset]', list).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('¿Restablecer el saldo de este jugador a $1,000? Su nivel VIP no cambia.')) return;
      try {
        await api('/api/admin/reset-balance', { method: 'POST', body: JSON.stringify({ userId: Number(b.dataset.reset) }) });
        toast('Saldo restablecido a $1,000 ✅');
        loadAdmin();
      } catch (err) { toast(err.message); }
    }));
  } catch (err) { toast(err.message); }
}

// ------------------------------ Tragamonedas ------------------------------
const LOW_SYMS = ['A', 'K', 'Q', 'J'];
const PAYTABLE_TEXT = {
  aguila: [['WILD', 'Águila (comodín)', '75×', '240×', '375×'], ['S1', 'Gema roja', '50×', '120×', '180×'], ['S2', 'Gema azul', '38×', '80×', '120×'], ['S3', 'Gema verde', '30×', '60×', '90×'], ['S4', 'Corona', '25×', '50×', '75×'], ['S5', 'Cáliz', '20×', '40×', '60×']],
  fiesta: [['WILD', 'Duende (comodín)', '60×', '200×', '300×'], ['S1', 'Corona', '50×', '120×', '180×'], ['S2', 'Guitarra', '38×', '80×', '120×'], ['S3', 'Sombrero', '30×', '60×', '90×'], ['S4', 'Tambor', '25×', '50×', '75×'], ['S5', 'Piñata', '20×', '40×', '60×']],
  mar: [['WILD', 'Sirena (comodín)', '60×', '200×', '300×'], ['S1', 'Ancla', '45×', '100×', '150×'], ['S2', 'Tortuga', '38×', '80×', '120×'], ['S3', 'Estrella de mar', '30×', '60×', '90×'], ['S4', 'Concha', '25×', '50×', '75×'], ['S5', 'Delfín', '20×', '40×', '60×']],
  azt: [['WILD', 'Máscara (comodín)', '75×', '240×', '375×'], ['S1', 'Jaguar', '50×', '120×', '180×'], ['S2', 'Piedra del sol', '38×', '80×', '120×'], ['S3', 'Penacho', '30×', '60×', '90×'], ['S4', 'Ídolo', '25×', '50×', '75×'], ['S5', 'Tambor', '20×', '40×', '60×']],
  neo: [['WILD', 'Siete (comodín)', '60×', '200×', '300×'], ['S1', 'Cerezas', '50×', '120×', '180×'], ['S2', 'Limón', '38×', '80×', '120×'], ['S3', 'Naranja', '30×', '60×', '90×'], ['S4', 'Campana', '25×', '50×', '75×'], ['S5', 'Diamante', '20×', '40×', '60×']],
  saf: [['WILD', 'León (comodín)', '60×', '200×', '300×'], ['S1', 'Elefante', '50×', '120×', '180×'], ['S2', 'Cebra', '38×', '80×', '120×'], ['S3', 'Jirafa', '30×', '60×', '90×'], ['S4', 'Rinoceronte', '25×', '50×', '75×'], ['S5', 'Baobab', '20×', '40×', '60×']],
};

function themeArt(sym) {
  if (!currentSlot) return '';
  return currentSlot.art[sym] || '';
}

function cellHtml(sym, coinValue) {
  if (LOW_SYMS.includes(sym)) return `<span class="low-sym">${sym}</span>`;
  const file = themeArt(sym);
  const val = coinValue != null ? `<span class="coin-val">${coinValue}×</span>` : '';
  return `<img src="/assets/${file}" alt="${sym}">${val}`;
}

function renderGrid(grid, winCells) {
  const el = $('#slot-grid');
  el.innerHTML = '';
  const winSet = new Set((winCells || []).map((c) => `${c.reel},${c.row}`));
  for (let row = 0; row < 3; row++) {
    for (let reel = 0; reel < 5; reel++) {
      const cell = document.createElement('div');
      cell.className = 'slot-cell' + (winSet.has(`${reel},${row}`) ? ' win' : '');
      cell.innerHTML = cellHtml(grid[reel][row]);
      el.appendChild(cell);
    }
  }
}

function renderRespinGrid(coins) {
  const el = $('#slot-grid');
  el.innerHTML = '';
  const map = {};
  for (const c of coins) map[`${c.reel},${c.row}`] = c.value;
  for (let row = 0; row < 3; row++) {
    for (let reel = 0; reel < 5; reel++) {
      const cell = document.createElement('div');
      cell.className = 'slot-cell';
      if (map[`${reel},${row}`] != null) {
        cell.innerHTML = `<img src="/assets/${themeArt('COIN')}" alt="Moneda"><span class="coin-val">${map[`${reel},${row}`]}×</span>`;
      }
      el.appendChild(cell);
    }
  }
}

function openSlot(slotId) {
  currentSlot = slots.find((s) => s.id === slotId) || slots[0];
  if (!currentSlot) return;
  $('#slot-title').textContent = '🎰 ' + currentSlot.name;
  $('#slot-hero-img').src = '/assets/' + (currentSlot.id === 'aguila' ? 'aguila-hero.jpg' : currentSlot.art.WILD);
  $('#slot-hero-img').alt = currentSlot.name;
  $('#respin-art').src = '/assets/' + (currentSlot.art.extra || currentSlot.art.COIN);
  $('#fs-banner').classList.add('hidden');
  $('#respin-banner').classList.add('hidden');
  $('#slot-message').textContent = currentSlot.tagline;
  const grid = Array.from({ length: 5 }, () => ['WILD', 'SCATTER', 'COIN']);
  renderGrid(grid, []);
  buildPaytable();
  openOverlay('overlay-slot');
}

function buildPaytable() {
  const rows = PAYTABLE_TEXT[currentSlot.id] || PAYTABLE_TEXT.fiesta;
  let html = `<h3>Tabla de pagos — ${currentSlot.name}</h3><p>Apuesta por línea: apuesta total ÷ 20. El comodín sustituye a todos menos scatter y moneda.</p>`;
  for (const r of rows) html += `<p><img src="/assets/${themeArt(r[0])}" alt="${r[1]}"> ${r[1]}: 3× ${r[2]} · 4× ${r[3]} · 5× ${r[4]}</p>`;
  html += `<p><img src="/assets/${themeArt('SCATTER')}" alt="Scatter"> Scatter: 3 = 10 giros gratis · 4 = 15 · 5 = 20 (premios de línea ×2).<br><img src="/assets/${themeArt('COIN')}" alt="Moneda"> 5+ monedas: Respin Dorado, monedas de 1× a 25×, rejilla llena = tesoro 50×.</p>`;
  $('#paytable').innerHTML = html;
}
$('#btn-paytable').addEventListener('click', () => $('#paytable').classList.toggle('hidden'));

function spinAnimation(finalGrid, done) {
  const cells = $$('#slot-grid .slot-cell');
  const artKeys = Object.keys(currentSlot.art).filter((k) => k !== 'extra');
  let ticks = 0;
  const iv = setInterval(() => {
    ticks++;
    cells.forEach((cell) => {
      const k = artKeys[Math.floor(Math.random() * artKeys.length)];
      cell.classList.add('spinning');
      cell.innerHTML = cellHtml(k);
    });
    if (ticks >= 6) {
      clearInterval(iv);
      cells.forEach((c) => c.classList.remove('spinning'));
      done();
    }
  }, 90);
}

async function doSpin() {
  if (slotBusy || !currentSlot) return;
  slotBusy = true;
  $('#btn-spin').disabled = true;
  sndSpin();
  const bet = Number($('#slot-bet').value);
  try {
    const data = await api('/api/slot/spin', { method: 'POST', body: JSON.stringify({ slotId: currentSlot.id, bet }) });
    spinAnimation(data.grid, () => {
      const winCells = [];
      for (const w of data.lineWins || []) winCells.push(...w.cells);
      renderGrid(data.grid, winCells);
      $('#slot-last-win').textContent = fmt(data.win);
      setBalances(data.balance, data.vip);
      let msg;
      if (data.freeSpin) msg = `Giro gratis · premio ${fmt(data.win)}`;
      else if (data.win > 0) msg = `¡Premio de ${fmt(data.win)}! 🎉`;
      else msg = 'Sin premio esta vez... ¡otra vez!';
      if (data.fsAwarded > 0) msg += ` 🌈 ¡${data.fsAwarded} giros gratis!`;
      $('#slot-message').textContent = msg;
      if (data.win > 0) { sndWin(); if (data.win >= bet * 20) coinRain(); } else sndCoin();
      // Giros gratis
      if (data.fsRemaining > 0) {
        $('#fs-banner').classList.remove('hidden');
        $('#fs-count').textContent = data.fsRemaining;
        $('#btn-spin').textContent = '🎰 GIRO GRATIS';
      } else {
        $('#fs-banner').classList.add('hidden');
        $('#btn-spin').textContent = '🎰 GIRAR';
      }
      // Respin
      if (data.respin) {
        $('#respin-banner').classList.remove('hidden');
        $('#respin-count').textContent = data.respin.respinsLeft;
        renderRespinGrid(data.respin.coins);
      }
      slotBusy = false;
      $('#btn-spin').disabled = false;
      if (autoLeft > 0 && !data.respin && data.fsRemaining === 0) {
        autoLeft--;
        if (autoLeft > 0) setTimeout(doSpin, 900);
        else $('#btn-auto').textContent = 'Auto ×10';
      } else if (autoLeft > 0) {
        autoLeft = 0;
        $('#btn-auto').textContent = 'Auto ×10';
        toast('Auto detenido: ¡hay giros gratis o respin!');
      }
    });
  } catch (err) {
    toast(err.message);
    slotBusy = false;
    $('#btn-spin').disabled = false;
  }
}
$('#btn-spin').addEventListener('click', doSpin);
$('#btn-auto').addEventListener('click', () => {
  if (autoLeft > 0) { autoLeft = 0; $('#btn-auto').textContent = 'Auto ×10'; return; }
  autoLeft = 10;
  $('#btn-auto').textContent = 'Auto... (toca para parar)';
  doSpin();
});

$('#btn-respin').addEventListener('click', async () => {
  const btn = $('#btn-respin');
  btn.disabled = true;
  sndSpin();
  try {
    const data = await api('/api/slot/respin', { method: 'POST' });
    renderRespinGrid(data.coins);
    $('#respin-count').textContent = data.respinsLeft;
    setBalances(data.balance, data.vip);
    if (data.done) {
      $('#respin-banner').classList.add('hidden');
      $('#slot-message').textContent = `Respin terminado · premio ${fmt(data.win)} 🪙`;
      $('#slot-last-win').textContent = fmt(data.win);
      if (data.win > 0) { sndWin(); coinRain(); }
      if (data.fsRemaining > 0) {
        $('#fs-banner').classList.remove('hidden');
        $('#fs-count').textContent = data.fsRemaining;
        $('#btn-spin').textContent = '🎰 GIRO GRATIS';
      }
    } else {
      $('#slot-message').textContent = `¡Moneda nueva! Quedan ${data.respinsLeft} respins`;
      sndCoin();
    }
  } catch (err) { toast(err.message); }
  btn.disabled = false;
});

function coinRain() {
  const layer = $('#coin-rain');
  layer.innerHTML = '';
  layer.classList.remove('hidden');
  const art = currentSlot ? themeArt('COIN') : 'sym-coin.png';
  for (let i = 0; i < 24; i++) {
    const img = document.createElement('img');
    img.src = '/assets/' + art;
    img.style.left = Math.random() * 100 + 'vw';
    img.style.animationDuration = (1.6 + Math.random() * 1.4) + 's';
    img.style.animationDelay = (Math.random() * 0.7) + 's';
    layer.appendChild(img);
  }
  setTimeout(() => layer.classList.add('hidden'), 3500);
}

// ------------------------------ Ruleta ------------------------------
const RED_NUMS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
(function buildBoard() {
  const board = $('#roulette-board');
  for (let n = 0; n <= 36; n++) {
    const b = document.createElement('button');
    b.className = 'num-btn ' + (n === 0 ? 'green' : RED_NUMS.has(n) ? 'red' : 'black');
    b.textContent = n;
    b.addEventListener('click', () => {
      roulettePick = { type: 'straight', value: n };
      $$('.num-btn').forEach((x) => x.classList.toggle('sel', x === b));
      $$('.chip-bet').forEach((x) => x.classList.remove('sel'));
      $('#roulette-pick').textContent = 'Número ' + n + ' · paga 36×';
      $('#btn-roulette-spin').disabled = false;
      sndClick();
    });
    board.appendChild(b);
  }
})();
$$('.chip-bet').forEach((b) => b.addEventListener('click', () => {
  roulettePick = { type: b.dataset.type, value: null };
  $$('.chip-bet').forEach((x) => x.classList.toggle('sel', x === b));
  $$('.num-btn').forEach((x) => x.classList.remove('sel'));
  $('#roulette-pick').textContent = b.textContent + ' · paga 2×';
  $('#btn-roulette-spin').disabled = false;
  sndClick();
}));
$('#btn-roulette-spin').addEventListener('click', async () => {
  if (!roulettePick) return;
  const btn = $('#btn-roulette-spin');
  btn.disabled = true;
  const wheel = $('#wheel');
  wheel.classList.remove('spinning');
  void wheel.offsetWidth;
  wheel.classList.add('spinning');
  sndSpin();
  $('#roulette-result').textContent = 'Girando... 🎡';
  try {
    const data = await api('/api/roulette/bet', {
      method: 'POST',
      body: JSON.stringify({ betType: roulettePick.type, value: roulettePick.value, amount: Number($('#roulette-bet').value) }),
    });
    setTimeout(() => {
      $('#wheel-num').textContent = data.number;
      const msg = data.win
        ? `¡Salió el ${data.number} (${data.color})! Ganaste ${fmt(data.winAmount)} 🎉`
        : `Salió el ${data.number} (${data.color}). Sin premio esta vez.`;
      $('#roulette-result').textContent = msg;
      setBalances(data.balance, data.vip);
      if (data.win) { sndWin(); if (data.winAmount >= 100) coinRain(); }
      btn.disabled = false;
    }, 2600);
  } catch (err) {
    toast(err.message);
    wheel.classList.remove('spinning');
    btn.disabled = false;
  }
});

// ------------------------------ Cartas ------------------------------
function cardEl(card, hidden) {
  const d = document.createElement('div');
  if (hidden) { d.className = 'card back'; return d; }
  const red = card.s === '♥' || card.s === '♦';
  d.className = 'card ' + (red ? 'red' : 'black');
  d.innerHTML = `<span class="rank">${card.r}</span><span class="suit">${card.s}</span>`;
  return d;
}
function renderCards(el, cards, hiddenSecond) {
  el.innerHTML = '';
  cards.forEach((c, i) => el.appendChild(cardEl(c, hiddenSecond && i === 1)));
}

// ------------------------------ Blackjack ------------------------------
async function bjAction(path) {
  try {
    const data = await api(path, { method: 'POST' });
    if (data.done) {
      renderCards($('#bj-dealer'), data.dealer, false);
      renderCards($('#bj-player'), data.player, false);
      $('#bj-dealer-value').textContent = data.dealerValue;
      $('#bj-player-value').textContent = data.playerValue;
      const msgs = { win: `¡Ganaste ${fmt(data.win)}! 🎉`, blackjack: `¡BLACKJACK! Ganaste ${fmt(data.win)} 👑`, lose: 'Perdiste esta mano.', push: 'Empate, se devuelve la apuesta.' };
      $('#bj-message').textContent = msgs[data.result] || '';
      setBalances(data.balance, data.vip);
      if (data.win > 0) sndWin();
      $('#btn-bj-hit').disabled = true; $('#btn-bj-stand').disabled = true; $('#btn-bj-double').disabled = true;
      $('#btn-bj-deal').disabled = false;
    } else {
      renderCards($('#bj-dealer'), data.dealer, true);
      renderCards($('#bj-player'), data.player, false);
      $('#bj-dealer-value').textContent = data.dealerValue;
      $('#bj-player-value').textContent = data.playerValue;
      setBalances(data.balance, data.vip);
      $('#btn-bj-hit').disabled = false; $('#btn-bj-stand').disabled = false;
      $('#btn-bj-double').disabled = data.doubled;
      $('#bj-message').textContent = '¿Pides o te plantas?';
      sndCoin();
    }
  } catch (err) { toast(err.message); }
}
$('#btn-bj-deal').addEventListener('click', async () => {
  $('#btn-bj-deal').disabled = true;
  sndSpin();
  try {
    const data = await api('/api/blackjack/deal', { method: 'POST', body: JSON.stringify({ bet: Number($('#bj-bet').value) }) });
    if (data.done) {
      renderCards($('#bj-dealer'), data.dealer, false);
      renderCards($('#bj-player'), data.player, false);
      $('#bj-dealer-value').textContent = data.dealerValue;
      $('#bj-player-value').textContent = data.playerValue;
      const msgs = { win: `¡Ganaste ${fmt(data.win)}! 🎉`, blackjack: `¡BLACKJACK! Ganaste ${fmt(data.win)} 👑`, lose: 'El dealer ganó.', push: 'Empate, se devuelve la apuesta.' };
      $('#bj-message').textContent = msgs[data.result] || '';
      setBalances(data.balance, data.vip);
      if (data.win > 0) sndWin();
      $('#btn-bj-deal').disabled = false;
    } else {
      renderCards($('#bj-dealer'), data.dealer, true);
      renderCards($('#bj-player'), data.player, false);
      $('#bj-dealer-value').textContent = data.dealerValue;
      $('#bj-player-value').textContent = data.playerValue;
      setBalances(data.balance, data.vip);
      $('#btn-bj-hit').disabled = false; $('#btn-bj-stand').disabled = false; $('#btn-bj-double').disabled = false;
      $('#bj-message').textContent = '¿Pides o te plantas?';
    }
  } catch (err) { toast(err.message); $('#btn-bj-deal').disabled = false; }
});
$('#btn-bj-hit').addEventListener('click', () => bjAction('/api/blackjack/hit'));
$('#btn-bj-stand').addEventListener('click', () => bjAction('/api/blackjack/stand'));
$('#btn-bj-double').addEventListener('click', () => bjAction('/api/blackjack/double'));

// ------------------------------ Bacará ------------------------------
$$('.bac-btn').forEach((b) => b.addEventListener('click', async () => {
  sndSpin();
  $('#bac-message').textContent = 'Repartiendo...';
  try {
    const data = await api('/api/baccarat/bet', {
      method: 'POST',
      body: JSON.stringify({ betOn: b.dataset.bet, amount: Number($('#bac-bet').value) }),
    });
    renderCards($('#bac-player'), data.player, false);
    renderCards($('#bac-banker'), data.banker, false);
    $('#bac-player-value').textContent = data.playerValue;
    $('#bac-banker-value').textContent = data.bankerValue;
    const wname = data.winner === 'player' ? 'Jugador' : data.winner === 'banker' ? 'Banca' : 'Empate';
    let msg = `Jugador ${data.playerValue} — Banca ${data.bankerValue}. Gana: ${wname}. `;
    if (data.result === 'win') msg += `¡Ganaste ${fmt(data.win)}! 🎉`;
    else if (data.result === 'tie-win') msg += `¡Empate! Ganaste ${fmt(data.win)}! 🎉`;
    else if (data.result === 'push') msg += 'Empate, se devuelve la apuesta.';
    else msg += 'Perdiste esta mano.';
    $('#bac-message').textContent = msg;
    setBalances(data.balance, data.vip);
    if (data.win > 0) { sndWin(); if (data.win >= 100) coinRain(); }
  } catch (err) { toast(err.message); }
}));

// ------------------------------ Video póker ------------------------------
$('#btn-vp-deal').addEventListener('click', async () => {
  sndSpin();
  try {
    const data = await api('/api/videopoker/deal', { method: 'POST', body: JSON.stringify({ bet: Number($('#vp-bet').value) }) });
    vpHeld = new Set();
    vpActive = true;
    renderVpCards(data.cards);
    setBalances(data.balance);
    $('#vp-message').textContent = 'Toca las cartas que quieres guardar y pulsa CAMBIAR CARTAS';
    $('#btn-vp-deal').classList.add('hidden');
    $('#btn-vp-draw').classList.remove('hidden');
  } catch (err) { toast(err.message); }
});
function renderVpCards(cards) {
  const el = $('#vp-cards');
  el.innerHTML = '';
  cards.forEach((c, i) => {
    const d = cardEl(c, false);
    if (vpHeld.has(i)) d.classList.add('held');
    d.addEventListener('click', () => {
      if (!vpActive) return;
      if (vpHeld.has(i)) vpHeld.delete(i); else vpHeld.add(i);
      d.classList.toggle('held');
      sndClick();
    });
    el.appendChild(d);
  });
}
$('#btn-vp-draw').addEventListener('click', async () => {
  if (!vpActive) return;
  vpActive = false;
  sndSpin();
  try {
    const data = await api('/api/videopoker/draw', { method: 'POST', body: JSON.stringify({ hold: Array.from(vpHeld) }) });
    renderVpCards(data.cards);
    setBalances(data.balance, data.vip);
    $('#vp-message').textContent = data.profitMult > 0
      ? `${data.result} · ¡Ganaste ${fmt(data.win)}! 🎉`
      : `${data.result}. Sin premio esta vez.`;
    if (data.win > 0) { sndWin(); if (data.win >= 100) coinRain(); }
    $('#btn-vp-draw').classList.add('hidden');
    $('#btn-vp-deal').classList.remove('hidden');
  } catch (err) { toast(err.message); vpActive = true; }
});

// ------------------------------ Arranque ------------------------------
(async function init() {
  try {
    const data = await api('/api/me');
    me = data.user;
    await enterLobby();
  } catch (e) {
    showView('view-auth');
  }
})();
