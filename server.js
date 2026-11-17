// Royal Mexican Casino — servidor (demo con fichas de prueba, sin dinero real).
// Express + Postgres (pg, DATABASE_URL). Autenticación por token en cookie httpOnly.
// Toda la lógica de juego corre en el servidor para que el resultado no se
// pueda alterar desde el navegador.
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const bcrypt = require('bcryptjs');

const db = require('./lib/db');
const games = require('./lib/games');
const { vipStatus } = require('./lib/vip');

const app = express();
const PORT = process.env.PORT || 3000;
const START_BALANCE = 1000; // pesos de prueba para cada jugador nuevo

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Las rutas usan la base de datos (async): este envoltorio pasa cualquier
// error a Express en vez de dejar la petición colgada.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.use((err, req, res, next) => {
  console.error('Error del servidor:', err);
  if (!res.headersSent) res.status(500).json({ error: 'Error del servidor' });
});

// ------------------------------ Sesiones ------------------------------
function parseCookies(req) {
  const out = {};
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

async function authMiddleware(req, res, next) {
  try {
    const cookies = parseCookies(req);
    const token = cookies.session;
    if (!token) return res.status(401).json({ error: 'No has iniciado sesión' });
    const row = await db.findSession(token);
    if (!row || row.expires_at < Date.now()) {
      if (row) await db.deleteSession(token);
      return res.status(401).json({ error: 'Sesión vencida, inicia sesión de nuevo' });
    }
    const user = await db.findById(row.user_id);
    if (!user) return res.status(401).json({ error: 'Sesión inválida' });
    req.user = user;
    next();
  } catch (e) {
    next(e);
  }
}

function adminMiddleware(req, res, next) {
  if (req.user.is_admin !== 1) {
    return res.status(403).json({ error: 'Solo el administrador puede hacer esto' });
  }
  next();
}

async function startSession(res, userId) {
  await db.cleanupSessions();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 7 * 24 * 3600 * 1000; // 7 días
  await db.createSession(token, userId, expiresAt);
  res.cookie('session', token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    maxAge: 7 * 24 * 3600 * 1000,
  });
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function vipOf(user) {
  return vipStatus(user.total_wagered_cents / 100);
}

// ------------------------------ Auth ------------------------------
app.post('/api/register', ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');
  if (!/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: 'Escribe un número de teléfono válido de 10 dígitos' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });
  }
  if (await db.findByPhone(phone)) {
    return res.status(400).json({ error: 'Ese teléfono ya está registrado, inicia sesión' });
  }
  const hash = bcrypt.hashSync(password, 10);
  const user = await db.createUser(phone, hash);
  await startSession(res, user.id);
  res.status(201).json({ user });
}));

app.post('/api/login', ah(async (req, res) => {
  const phone = normalizePhone(req.body.phone);
  const password = String(req.body.password || '');
  const row = await db.findByPhone(phone);
  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: 'Teléfono o contraseña incorrectos' });
  }
  const user = await db.publicUser(row);
  await startSession(res, user.id);
  res.json({ user });
}));

app.post('/api/logout', authMiddleware, ah(async (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.session) await db.deleteSession(cookies.session);
  res.clearCookie('session', { path: '/' });
  res.json({ ok: true });
}));

app.get('/api/me', authMiddleware, ah(async (req, res) => {
  const user = await db.publicUser(req.user);
  res.json({ user: { ...user, vip: vipOf(req.user) } });
}));

app.get('/api/config', ah(async (req, res) => {
  res.json({ publicUrl: process.env.PUBLIC_URL || null });
}));

// Catálogo de tragamonedas (id, nombre, descripción y arte) para el lobby.
app.get('/api/slots', ah(async (req, res) => {
  const list = Object.values(games.THEMES).map((t) => ({
    id: t.id, name: t.name, tagline: t.tagline, art: t.art,
  }));
  res.json({ slots: list });
}));

// ------------------------------ VIP e historial ------------------------------
app.get('/api/vip', authMiddleware, ah(async (req, res) => {
  res.json(vipOf(req.user));
}));

app.get('/api/history', authMiddleware, ah(async (req, res) => {
  res.json({ history: await db.history(req.user.id, 50) });
}));

// ------------------------------ Slot "Fiesta Dorada" ------------------------------
function validBet(bet) {
  const n = Number(bet);
  return Number.isFinite(n) && n >= 1 && n <= 1000 ? n : null;
}

app.post('/api/slot/spin', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const state = await db.getState(user.id);
  if (state && state.kind === 'respin') {
    return res.status(400).json({ error: 'Termina primero el Respin Dorado' });
  }
  if (state && state.kind === 'blackjack') {
    return res.status(400).json({ error: 'Termina primero tu mano de blackjack' });
  }
  if (state && state.kind === 'videopoker') {
    return res.status(400).json({ error: 'Termina primero tu mano de video póker' });
  }

  const freeSpin = state && state.kind === 'slot' && state.fsRemaining > 0;
  const slotId = freeSpin ? state.slotId : (req.body.slotId || 'fiesta');
  const theme = games.THEMES[slotId];
  if (!theme) return res.status(400).json({ error: 'Tragamonedas no encontrada' });
  const bet = freeSpin ? state.fsBet : validBet(req.body.bet);
  if (!bet) return res.status(400).json({ error: 'La apuesta debe ser de $1 a $1,000' });
  const betCents = Math.round(bet * 100);

  const result = games.slotSpin(bet, freeSpin, theme);
  const winCents = Math.round(result.totalWinMult * betCents);

  let applied;
  if (freeSpin) {
    applied = await db.applyWin(user.id, winCents, 'slot', { freeSpin: true, fsAwarded: result.fsAwarded });
  } else {
    try {
      applied = await db.applyBet(user.id, betCents, winCents, 'slot', {
        fsAwarded: result.fsAwarded, respin: !!result.respin,
      });
    } catch (e) {
      return res.status(400).json({ error: e.message });
    }
  }

  // Estado siguiente: respin (con giros gratis en cola si también salieron),
  // giros gratis, Nudge (giro pagado sin premio: un empujón gratis de un rodillo),
  // o nada.
  let fsRemaining = freeSpin ? state.fsRemaining - 1 : 0;
  fsRemaining += result.fsAwarded;
  let canNudge = false;
  if (result.respin) {
    await db.setState(user.id, {
      kind: 'respin', slotId, bet, coins: result.respin.coins, respinsLeft: 3,
      pendingFs: fsRemaining, fsBet: bet,
    });
  } else if (fsRemaining > 0) {
    await db.setState(user.id, { kind: 'slot', slotId, fsRemaining, fsBet: bet });
  } else if (!freeSpin && result.totalWinMult === 0) {
    await db.setState(user.id, { kind: 'nudge', slotId, bet, grid: result.grid });
    canNudge = true;
  } else {
    await db.clearState(user.id);
  }

  res.json({
    slotId: theme.id,
    grid: result.grid,
    lineWins: result.lineWins,
    lineWinTotal: result.lineWinTotal,
    scatterWin: result.scatterWin,
    scatterCells: result.scatterCells,
    fsAwarded: result.fsAwarded,
    fsRemaining,
    freeSpin,
    respin: result.respin ? {
      coins: result.respin.coins, respinsLeft: 3, bet,
    } : null,
    win: winCents / 100,
    balance: applied.balance,
    totalWagered: applied.totalWagered,
    vip: vipStatus(applied.totalWagered),
    canNudge,
  });
}));

// Nudge: un empujón gratis de un rodillo tras un giro pagado sin premio.
app.post('/api/slot/nudge', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const state = await db.getState(user.id);
  if (!state || state.kind !== 'nudge') {
    return res.status(400).json({ error: 'No hay un Nudge disponible' });
  }
  const reel = Number(req.body.reel);
  const dir = req.body.dir;
  if (!Number.isInteger(reel) || reel < 0 || reel > 4 || !['up', 'down'].includes(dir)) {
    return res.status(400).json({ error: 'Nudge inválido' });
  }
  const theme = games.THEMES[state.slotId];
  if (!theme) return res.status(400).json({ error: 'Tragamonedas no encontrada' });
  const result = games.nudgeGrid(state.grid, theme, reel, dir, state.bet);
  const winCents = Math.round(result.totalWinMult * state.bet * 100);
  const applied = await db.applyWin(user.id, winCents, 'slot-nudge', { reel, dir });
  if (result.respin) {
    await db.setState(user.id, {
      kind: 'respin', slotId: state.slotId, bet: state.bet,
      coins: result.respin.coins, respinsLeft: 3,
      pendingFs: result.fsAwarded, fsBet: state.bet,
    });
  } else if (result.fsAwarded > 0) {
    await db.setState(user.id, { kind: 'slot', slotId: state.slotId, fsRemaining: result.fsAwarded, fsBet: state.bet });
  } else {
    await db.clearState(user.id);
  }
  res.json({
    grid: result.grid,
    lineWins: result.lineWins,
    scatterWin: result.scatterWin,
    fsAwarded: result.fsAwarded,
    fsRemaining: result.fsAwarded,
    respin: result.respin ? { coins: result.respin.coins, respinsLeft: 3, bet: state.bet } : null,
    win: winCents / 100,
    balance: applied.balance,
    totalWagered: applied.totalWagered,
    vip: vipStatus(applied.totalWagered),
  });
}));

app.post('/api/slot/respin', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const state = await db.getState(user.id);
  if (!state || state.kind !== 'respin') {
    return res.status(400).json({ error: 'No hay un Respin Dorado activo' });
  }
  const result = games.slotRespin(state);
  const betCents = Math.round(state.bet * 100);
  let balance = await db.publicUser(await db.findById(user.id)).balance;
  let totalWagered = user.total_wagered_cents / 100;
  let win = 0;
  if (result.done) {
    win = (result.totalWinMult * state.bet);
    const winCents = Math.round(result.totalWinMult * betCents);
    const applied = await db.applyWin(user.id, winCents, 'slot-respin', {
      coins: result.coins.length, fullGridBonus: result.fullGridBonus,
    });
    balance = applied.balance;
    totalWagered = applied.totalWagered;
    if (state.pendingFs > 0) {
      await db.setState(user.id, { kind: 'slot', slotId: state.slotId, fsRemaining: state.pendingFs, fsBet: state.fsBet });
    } else {
      await db.clearState(user.id);
    }
  } else {
    await db.setState(user.id, { ...state, coins: result.coins, respinsLeft: result.respinsLeft });
  }
  res.json({
    coins: result.coins,
    newCoins: result.newCoins,
    respinsLeft: result.respinsLeft,
    done: result.done,
    fullGridBonus: result.fullGridBonus,
    totalWinMult: result.totalWinMult,
    win,
    balance,
    totalWagered,
    vip: vipStatus(totalWagered),
    fsRemaining: result.done ? (state.pendingFs || 0) : 0,
  });
}));

// ------------------------------ Ruleta europea ------------------------------
const ROULETTE_TYPES = ['straight', 'red', 'black', 'even', 'odd', 'low', 'high'];

app.post('/api/roulette/bet', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const betType = req.body.betType;
  const value = req.body.value;
  const bet = validBet(req.body.amount);
  if (!ROULETTE_TYPES.includes(betType)) {
    return res.status(400).json({ error: 'Tipo de apuesta inválido' });
  }
  if (betType === 'straight') {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0 || n > 36) {
      return res.status(400).json({ error: 'Elige un número del 0 al 36' });
    }
  }
  if (!bet) return res.status(400).json({ error: 'La apuesta debe ser de $1 a $1,000' });
  const betCents = Math.round(bet * 100);
  const result = games.rouletteSpin(betType, Number(value));
  const winCents = Math.round(result.winMult * betCents);
  let applied;
  try {
    applied = await db.applyBet(user.id, betCents, winCents, 'roulette', {
      betType, value: betType === 'straight' ? Number(value) : undefined,
      number: result.number, color: result.color,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({
    number: result.number, color: result.color, win: result.win,
    winAmount: winCents / 100, balance: applied.balance,
    totalWagered: applied.totalWagered, vip: vipStatus(applied.totalWagered),
  });
}));

// ------------------------------ Blackjack ------------------------------
function publicHand(state, hideDealerHole) {
  return {
    player: state.player,
    playerValue: games.handValue(state.player),
    dealer: hideDealerHole
      ? [state.dealer[0], { r: '?', s: '' }]
      : state.dealer,
    dealerValue: hideDealerHole ? games.handValue([state.dealer[0]]) : games.handValue(state.dealer),
    bet: state.bet,
    doubled: !!state.doubled,
  };
}

async function settleBj(req, res, state) {
  const user = req.user;
  const dealerCards = games.playDealer(state.deck, state.dealer);
  const outcome = games.settleBlackjack(state.player, dealerCards, state.bet);
  const winCents = Math.round(outcome.winMult * Math.round(state.bet * 100));
  const applied = await db.applyWin(user.id, winCents, 'blackjack', {
    result: outcome.result, playerValue: games.handValue(state.player),
    dealerValue: games.handValue(dealerCards),
  });
  await db.clearState(user.id);
  res.json({
    done: true,
    player: state.player, playerValue: games.handValue(state.player),
    dealer: dealerCards, dealerValue: games.handValue(dealerCards),
    result: outcome.result, win: winCents / 100,
    balance: applied.balance, totalWagered: applied.totalWagered,
    vip: vipStatus(applied.totalWagered),
  });
}

app.post('/api/blackjack/deal', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const existing = await db.getState(user.id);
  if (existing) {
    return res.status(400).json({ error: 'Termina primero tu juego en curso' });
  }
  const bet = validBet(req.body.bet);
  if (!bet) return res.status(400).json({ error: 'La apuesta debe ser de $1 a $1,000' });
  const betCents = Math.round(bet * 100);
  let applied;
  try {
    applied = await db.applyBet(user.id, betCents, 0, 'blackjack', { action: 'deal' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const deck = games.newDeck();
  const state = {
    kind: 'blackjack', deck,
    player: [deck.pop(), deck.pop()],
    dealer: [deck.pop(), deck.pop()],
    bet, doubled: false,
  };
  const playerBJ = games.isBlackjack(state.player);
  const dealerBJ = games.isBlackjack(state.dealer);
  if (playerBJ || dealerBJ) {
    // Se resuelve de inmediato (blackjack paga 3 a 2).
    const outcome = games.settleBlackjack(state.player, state.dealer, bet);
    const winCents = Math.round(outcome.winMult * betCents);
    const settled = await db.applyWin(user.id, winCents, 'blackjack', { result: outcome.result });
    return res.json({
      done: true,
      player: state.player, playerValue: games.handValue(state.player),
      dealer: state.dealer, dealerValue: games.handValue(state.dealer),
      result: outcome.result, win: winCents / 100,
      balance: settled.balance, totalWagered: settled.totalWagered,
      vip: vipStatus(settled.totalWagered),
    });
  }
  await db.setState(user.id, state);
  res.json({
    done: false,
    ...publicHand(state, true),
    balance: applied.balance, totalWagered: applied.totalWagered,
    vip: vipStatus(applied.totalWagered),
  });
}));

app.post('/api/blackjack/hit', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const state = await db.getState(user.id);
  if (!state || state.kind !== 'blackjack') {
    return res.status(400).json({ error: 'No hay una mano de blackjack en curso' });
  }
  state.player.push(state.deck.pop());
  const pv = games.handValue(state.player);
  if (pv > 21) {
    // Te pasaste: se resuelve como derrota sin jugar el dealer.
    const applied = await db.applyWin(user.id, 0, 'blackjack', { result: 'lose', playerValue: pv });
    await db.clearState(user.id);
    return res.json({
      done: true,
      player: state.player, playerValue: pv,
      dealer: state.dealer, dealerValue: games.handValue(state.dealer),
      result: 'lose', win: 0,
      balance: applied.balance, totalWagered: applied.totalWagered,
      vip: vipStatus(applied.totalWagered),
    });
  }
  if (pv === 21) return await settleBj(req, res, state);
  await db.setState(user.id, state);
  res.json({ done: false, ...publicHand(state, true) });
}));

app.post('/api/blackjack/stand', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const state = await db.getState(user.id);
  if (!state || state.kind !== 'blackjack') {
    return res.status(400).json({ error: 'No hay una mano de blackjack en curso' });
  }
  return await settleBj(req, res, state);
}));

app.post('/api/blackjack/double', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const state = await db.getState(user.id);
  if (!state || state.kind !== 'blackjack') {
    return res.status(400).json({ error: 'No hay una mano de blackjack en curso' });
  }
  if (state.doubled || state.player.length !== 2) {
    return res.status(400).json({ error: 'Solo puedes doblar con las dos primeras cartas' });
  }
  const extraCents = Math.round(state.bet * 100);
  try {
    await db.applyBet(user.id, extraCents, 0, 'blackjack', { action: 'double' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  state.bet = state.bet * 2;
  state.doubled = true;
  state.player.push(state.deck.pop());
  const pv = games.handValue(state.player);
  if (pv > 21) {
    const applied = await db.applyWin(user.id, 0, 'blackjack', { result: 'lose', playerValue: pv });
    await db.clearState(user.id);
    return res.json({
      done: true,
      player: state.player, playerValue: pv,
      dealer: state.dealer, dealerValue: games.handValue(state.dealer),
      result: 'lose', win: 0,
      balance: applied.balance, totalWagered: applied.totalWagered,
      vip: vipStatus(applied.totalWagered),
    });
  }
  return await settleBj(req, res, state);
}));

// ------------------------------ Bacará (Punto Banco) ------------------------------
app.post('/api/baccarat/bet', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const betOn = req.body.betOn;
  if (!['player', 'banker', 'tie'].includes(betOn)) {
    return res.status(400).json({ error: 'Apuesta a Jugador, Banca o Empate' });
  }
  const bet = validBet(req.body.amount);
  if (!bet) return res.status(400).json({ error: 'La apuesta debe ser de $1 a $1,000' });
  const betCents = Math.round(bet * 100);
  const round = games.baccaratRound(betOn);
  const winCents = Math.round(round.winMult * betCents);
  let applied;
  try {
    applied = await db.applyBet(user.id, betCents, winCents, 'baccarat', {
      betOn, winner: round.winner, result: round.result,
      playerValue: round.playerValue, bankerValue: round.bankerValue,
    });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  res.json({
    player: round.player, banker: round.banker,
    playerValue: round.playerValue, bankerValue: round.bankerValue,
    winner: round.winner, result: round.result,
    win: winCents / 100, balance: applied.balance,
    totalWagered: applied.totalWagered, vip: vipStatus(applied.totalWagered),
  });
}));

// ------------------------------ Video póker (Jacks or Better) ------------------------------
app.post('/api/videopoker/deal', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  if (await db.getState(user.id)) {
    return res.status(400).json({ error: 'Termina primero tu juego en curso' });
  }
  const bet = validBet(req.body.bet);
  if (!bet) return res.status(400).json({ error: 'La apuesta debe ser de $1 a $1,000' });
  const betCents = Math.round(bet * 100);
  try {
    await db.applyBet(user.id, betCents, 0, 'videopoker', { action: 'deal' });
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  const deck = games.newDeck(1);
  const hand = [deck.pop(), deck.pop(), deck.pop(), deck.pop(), deck.pop()];
  await db.setState(user.id, { kind: 'videopoker', deck, hand, bet });
  res.json({ cards: hand, balance: await db.publicUser(await db.findById(user.id)).balance });
}));

app.post('/api/videopoker/draw', authMiddleware, ah(async (req, res) => {
  const user = req.user;
  const state = await db.getState(user.id);
  if (!state || state.kind !== 'videopoker') {
    return res.status(400).json({ error: 'No hay una mano de video póker en curso' });
  }
  const hold = Array.isArray(req.body.hold) ? req.body.hold : [];
  const hand = state.hand.map((card, i) => (hold.includes(i) ? card : state.deck.pop()));
  const ev = games.evaluatePokerHand(hand);
  const winCents = ev.profitMult > 0
    ? Math.round((1 + ev.profitMult) * Math.round(state.bet * 100))
    : 0;
  const applied = await db.applyWin(user.id, winCents, 'videopoker', {
    result: ev.name, profitMult: ev.profitMult,
  });
  await db.clearState(user.id);
  res.json({
    cards: hand, result: ev.name, profitMult: ev.profitMult,
    win: winCents / 100, balance: applied.balance,
    totalWagered: applied.totalWagered, vip: vipStatus(applied.totalWagered),
  });
}));

// ------------------------------ Admin ------------------------------
app.get('/api/admin/players', authMiddleware, adminMiddleware, ah(async (req, res) => {
  const players = (await db.listUsers()).map((p) => ({ ...p, vip: vipStatus(p.totalWagered).level }));
  res.json({ players });
}));

app.get('/api/admin/stats', authMiddleware, adminMiddleware, ah(async (req, res) => {
  res.json({
    totalPlayers: await db.countUsers(),
    totalWagered: await db.totalWageredAll(),
  });
}));

// Solo el admin puede restablecer un saldo. El total jugado NO se reinicia.
app.post('/api/admin/reset-balance', authMiddleware, adminMiddleware, ah(async (req, res) => {
  const userId = Number(req.body.userId);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ error: 'Jugador inválido' });
  }
  try {
    const result = await db.resetBalance(userId);
    res.json({ ok: true, ...result });
  } catch (e) {
    res.status(404).json({ error: e.message });
  }
}));

// ------------------------------ Arranque ------------------------------
// No se atiende ninguna petición hasta que la base de datos esté lista
// (tablas creadas). Si no hay conexión a Postgres, se falla rápido.
db.ready.then(() => {
  app.listen(PORT, () => {
    console.log(`Royal Mexican Casino escuchando en http://localhost:${PORT}`);
    console.log('Demo con fichas de prueba, sin dinero real.');
  });
}).catch((err) => {
  console.error('No se pudo conectar a la base de datos (DATABASE_URL):', err.message);
  process.exit(1);
});
