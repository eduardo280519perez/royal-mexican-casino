// Motores de juego originales de Royal Mexican Casino (demo, fichas de prueba).
// Toda la lógica corre en el servidor; el cliente solo muestra el resultado.

// ------------------------------- SLOTS (5 temas) -------------------------------
// 5 rodillos x 3 filas, 20 líneas de pago, comodín, scatter (giros gratis x2),
// monedas que activan el Respin Dorado. Los pagos de línea son múltiplos de la
// apuesta POR LÍNEA (apuesta total / 20). Los premios de scatter y de monedas
// son múltiplos de la apuesta TOTAL. Cada tema tiene sus propios símbolos y
// pagos, pero la misma mecánica.

const SYM = {
  WILD: 'WILD', SCATTER: 'SCATTER', COIN: 'COIN',
  S1: 'S1', S2: 'S2', S3: 'S3', S4: 'S4', S5: 'S5',
  A: 'A', K: 'K', Q: 'Q', J: 'J',
};

// Pago por línea: [3 iguales, 4 iguales, 5 iguales] en múltiplos de apuesta por línea.
const LOW_PAY = { A: [20, 30, 45], K: [20, 24, 38], Q: [15, 20, 30], J: [15, 16, 22] };

const THEMES = {
  aguila: {
    id: 'aguila', name: 'Águila Dorada',
    tagline: 'Águila comodín · Templo scatter · Respin dorado · Jackpot',
    art: { WILD: 'aguila-wild.png', SCATTER: 'aguila-scatter.png', COIN: 'aguila-coin.png',
      S1: 'aguila-s1.png', S2: 'aguila-s2.png', S3: 'aguila-s3.png',
      S4: 'aguila-s4.png', S5: 'aguila-s5.png', extra: 'aguila-extra.png' },
    paytable: { WILD: [75, 240, 375], S1: [50, 120, 180], S2: [38, 80, 120],
      S3: [30, 60, 90], S4: [25, 50, 75], S5: [20, 40, 60], ...LOW_PAY },
  },
  fiesta: {
    id: 'fiesta', name: 'Fiesta Dorada',
    tagline: 'Duende comodín · Giros gratis ×2 · Respin Dorado',
    art: { WILD: 'sym-wild.png', SCATTER: 'sym-scatter.png', COIN: 'sym-coin.png',
      S1: 'sym-corona.png', S2: 'sym-guitarra.png', S3: 'sym-sombrero.png',
      S4: 'sym-tambor.png', S5: 'sym-pinata.png', extra: 'sym-pot.png' },
    paytable: { WILD: [60, 200, 300], S1: [50, 120, 180], S2: [38, 80, 120],
      S3: [30, 60, 90], S4: [25, 50, 75], S5: [20, 40, 60], ...LOW_PAY },
  },
  mar: {
    id: 'mar', name: 'Tesoros del Mar',
    tagline: 'Sirena comodín · Cofre scatter · Respin de perlas',
    art: { WILD: 'mar-wild.png', SCATTER: 'mar-scatter.png', COIN: 'mar-coin.png',
      S1: 'mar-s1.png', S2: 'mar-s2.png', S3: 'mar-s3.png',
      S4: 'mar-s4.png', S5: 'mar-s5.png', extra: 'mar-extra.png' },
    paytable: { WILD: [60, 200, 300], S1: [45, 100, 150], S2: [38, 80, 120],
      S3: [30, 60, 90], S4: [25, 50, 75], S5: [20, 40, 60], ...LOW_PAY },
  },
  azt: {
    id: 'azt', name: 'Fuego Azteca',
    tagline: 'Máscara dorada · Pirámide scatter · Respin de oro',
    art: { WILD: 'azt-wild.png', SCATTER: 'azt-scatter.png', COIN: 'azt-coin.png',
      S1: 'azt-s1.png', S2: 'azt-s2.png', S3: 'azt-s3.png',
      S4: 'azt-s4.png', S5: 'azt-s5.png', extra: 'azt-extra.png' },
    paytable: { WILD: [75, 240, 375], S1: [50, 120, 180], S2: [38, 80, 120],
      S3: [30, 60, 90], S4: [25, 50, 75], S5: [20, 40, 60], ...LOW_PAY },
  },
  neo: {
    id: 'neo', name: 'Frutas Neón',
    tagline: 'Siete de neón · Estrella scatter · Respin brillante',
    art: { WILD: 'neo-wild.png', SCATTER: 'neo-scatter.png', COIN: 'neo-coin.png',
      S1: 'neo-s1.png', S2: 'neo-s2.png', S3: 'neo-s3.png',
      S4: 'neo-s4.png', S5: 'neo-s5.png', extra: 'neo-extra.png' },
    paytable: { WILD: [60, 200, 300], S1: [50, 120, 180], S2: [38, 80, 120],
      S3: [30, 60, 90], S4: [25, 50, 75], S5: [20, 40, 60], ...LOW_PAY },
  },
  saf: {
    id: 'saf', name: 'Safari Dorado',
    tagline: 'León comodín · Atardecer scatter · Respin salvaje',
    art: { WILD: 'saf-wild.png', SCATTER: 'saf-scatter.png', COIN: 'saf-coin.png',
      S1: 'saf-s1.png', S2: 'saf-s2.png', S3: 'saf-s3.png',
      S4: 'saf-s4.png', S5: 'saf-s5.png', extra: 'saf-extra.png' },
    paytable: { WILD: [60, 200, 300], S1: [50, 120, 180], S2: [38, 80, 120],
      S3: [30, 60, 90], S4: [25, 50, 75], S5: [20, 40, 60], ...LOW_PAY },
  },
};

// Peso de aparición por celda (mayor peso = sale más). Suma 93.
const WEIGHTS = [
  [SYM.WILD, 3], [SYM.SCATTER, 3], [SYM.COIN, 8],
  [SYM.S1, 4], [SYM.S2, 5], [SYM.S3, 6], [SYM.S4, 8], [SYM.S5, 9],
  [SYM.A, 12], [SYM.K, 12], [SYM.Q, 12], [SYM.J, 12],
];
const WEIGHT_TOTAL = WEIGHTS.reduce((a, [, w]) => a + w, 0);

function pickSymbol() {
  let r = Math.random() * WEIGHT_TOTAL;
  for (const [s, w] of WEIGHTS) { r -= w; if (r < 0) return s; }
  return SYM.J;
}

// 20 líneas de pago clásicas (fila 0=arriba, 1=centro, 2=abajo, por rodillo).
const PAYLINES = [
  [1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1],
  [1, 0, 1, 0, 1], [1, 2, 1, 2, 1], [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2], [1, 1, 0, 1, 1], [1, 1, 2, 1, 1],
  [0, 1, 0, 1, 0], [2, 1, 2, 1, 2], [1, 0, 2, 0, 1],
  [1, 2, 0, 2, 1], [0, 0, 2, 0, 0],
];

const FS_AWARDS = { 3: 10, 4: 15, 5: 20 }; // scatters -> giros gratis
const SCATTER_PAY = { 3: 2, 4: 10, 5: 50 }; // múltiplos de apuesta total

function genGrid() {
  const grid = [];
  for (let reel = 0; reel < 5; reel++) {
    const col = [];
    for (let row = 0; row < 3; row++) col.push(pickSymbol());
    grid.push(col);
  }
  return grid; // grid[rodillo][fila]
}

function countSymbol(grid, sym) {
  const cells = [];
  let n = 0;
  for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) {
    if (grid[r][row] === sym) { n++; cells.push({ reel: r, row }); }
  }
  return { n, cells };
}

// Evalúa las 20 líneas. lineMult: multiplicador de giros gratis (1 o 2).
// Devuelve { lineWins, lineWinTotal } en múltiplos de apuesta TOTAL.
function evalLines(grid, lineMult, paytable) {
  const lineWins = [];
  let lineWinTotal = 0;
  PAYLINES.forEach((line, li) => {
    const seq = line.map((row, reel) => grid[reel][row]);
    let sym = null;
    for (const s of seq) {
      if (s === SYM.WILD) continue;
      if (s === SYM.SCATTER || s === SYM.COIN) { sym = null; break; }
      sym = s; break;
    }
    if (sym === null) {
      if (seq.every((s) => s === SYM.WILD)) sym = SYM.WILD;
      else return;
    }
    let count = 0;
    for (const s of seq) {
      if (s === sym || s === SYM.WILD) count++;
      else break;
    }
    if (count >= 3) {
      const mult = paytable[sym][count - 3] * lineMult;
      lineWinTotal += mult / 20;
      const cells = [];
      for (let reel = 0; reel < count; reel++) cells.push({ reel, row: line[reel] });
      lineWins.push({ line: li + 1, symbol: sym, count, mult, cells });
    }
  });
  return { lineWins, lineWinTotal };
}

function coinValue() {
  // Valores de 1x a 25x la apuesta, con mucho peso en los bajos (media ~2.5x).
  const r = Math.random();
  if (r < 0.6) return 1;
  if (r < 0.8) return 2;
  if (r < 0.9) return 3 + Math.floor(Math.random() * 3);       // 3-5
  if (r < 0.96) return 6 + Math.floor(Math.random() * 5);      // 6-10
  if (r < 0.99) return 11 + Math.floor(Math.random() * 5);     // 11-15
  return 16 + Math.floor(Math.random() * 10);                  // 16-25
}

// Evalúa una rejilla ya generada: líneas, scatter, monedas. fsActive: premios x2.
function evaluateGrid(grid, theme, bet, fsActive) {
  const lineMult = fsActive ? 2 : 1;
  const { lineWins, lineWinTotal } = evalLines(grid, lineMult, theme.paytable);
  const sc = countSymbol(grid, SYM.SCATTER);
  const coins = countSymbol(grid, SYM.COIN);
  let scatterWin = 0;
  let fsAwarded = 0;
  if (sc.n >= 3) {
    scatterWin = SCATTER_PAY[Math.min(sc.n, 5)];
    fsAwarded = FS_AWARDS[Math.min(sc.n, 5)];
  }
  let respin = null;
  if (coins.n >= 5) {
    const coinCells = coins.cells.map((c) => ({ ...c, value: coinValue() }));
    respin = { bet, coins: coinCells, respinsLeft: 3, done: false, totalWinMult: 0 };
  }
  const totalWinMult = lineWinTotal + scatterWin;
  return { grid, lineWins, lineWinTotal, scatterWin, scatterCells: sc.cells, fsAwarded, respin, totalWinMult };
}

// Un giro del slot. theme: tema de THEMES. fsActive: giro gratis (premios x2).
function slotSpin(bet, fsActive, theme) {
  theme = theme || THEMES.fiesta;
  return evaluateGrid(genGrid(), theme, bet, fsActive);
}

// Nudge: mueve un rodillo una posición ('up' o 'down') y re-evalúa la rejilla.
// El símbolo nuevo entra por un extremo (sorteo ponderado) y el del otro extremo sale.
function nudgeGrid(grid, theme, reel, dir, bet) {
  const col = grid[reel].slice();
  const fresh = pickSymbol();
  const newCol = dir === 'down' ? [fresh, col[0], col[1]] : [col[1], col[2], fresh];
  const newGrid = grid.map((c, i) => (i === reel ? newCol : c.slice()));
  return evaluateGrid(newGrid, theme, bet, false);
}

// Una ronda del Respin Dorado: gira solo las celdas vacías.
function slotRespin(state) {
  const occupied = new Set(state.coins.map((c) => `${c.reel},${c.row}`));
  const newCoins = [];
  for (let reel = 0; reel < 5; reel++) {
    for (let row = 0; row < 3; row++) {
      if (occupied.has(`${reel},${row}`)) continue;
      if (Math.random() < 0.10) { // probabilidad de moneda por celda vacía
        newCoins.push({ reel, row, value: coinValue() });
      }
    }
  }
  const coins = state.coins.concat(newCoins);
  const respinsLeft = newCoins.length > 0 ? 3 : state.respinsLeft - 1;
  const done = respinsLeft <= 0 || coins.length >= 15;
  let totalWinMult = 0;
  let fullGridBonus = 0;
  if (done) {
    totalWinMult = coins.reduce((a, c) => a + c.value, 0);
    if (coins.length >= 15) { fullGridBonus = 50; totalWinMult += 50; }
  }
  return { bet: state.bet, coins, newCoins, respinsLeft, done, totalWinMult, fullGridBonus };
}

// ------------------------------- RULETA EUROPEA -------------------------------
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);

function rouletteColor(n) {
  if (n === 0) return 'verde';
  return RED_NUMBERS.has(n) ? 'rojo' : 'negro';
}

function rouletteSpin(betType, value) {
  const number = Math.floor(Math.random() * 37);
  const color = rouletteColor(number);
  let won = false;
  if (betType === 'straight') won = number === value;
  else if (betType === 'red') won = color === 'rojo';
  else if (betType === 'black') won = color === 'negro';
  else if (betType === 'even') won = number !== 0 && number % 2 === 0;
  else if (betType === 'odd') won = number % 2 === 1;
  else if (betType === 'low') won = number >= 1 && number <= 18;
  else if (betType === 'high') won = number >= 19 && number <= 36;
  const winMult = won ? (betType === 'straight' ? 36 : 2) : 0;
  return { number, color, win: won, winMult };
}

// ------------------------------- CARTAS (mazo común) -------------------------------
const SUITS = ['♠', '♥', '♦', '♣'];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

function newDeck(decks) {
  const n = decks || 6;
  const deck = [];
  for (let d = 0; d < n; d++) {
    for (const s of SUITS) for (const r of RANKS) deck.push({ r, s });
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function handValue(cards) {
  let total = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.r === 'A') { total += 11; aces++; }
    else if (['K', 'Q', 'J'].includes(c.r)) total += 10;
    else total += parseInt(c.r, 10);
  }
  while (total > 21 && aces > 0) { total -= 10; aces--; }
  return total;
}

function isBlackjack(cards) {
  return cards.length === 2 && handValue(cards) === 21;
}

function playDealer(deck, dealerCards) {
  const cards = dealerCards.slice();
  while (handValue(cards) < 17) cards.push(deck.pop());
  return cards;
}

function settleBlackjack(playerCards, dealerCards) {
  const pv = handValue(playerCards);
  const dv = handValue(dealerCards);
  if (isBlackjack(playerCards) && !isBlackjack(dealerCards)) return { result: 'blackjack', winMult: 2.5 };
  if (isBlackjack(dealerCards) && !isBlackjack(playerCards)) return { result: 'lose', winMult: 0 };
  if (isBlackjack(playerCards) && isBlackjack(dealerCards)) return { result: 'push', winMult: 1 };
  if (pv > 21) return { result: 'lose', winMult: 0 };
  if (dv > 21) return { result: 'win', winMult: 2 };
  if (pv > dv) return { result: 'win', winMult: 2 };
  if (pv < dv) return { result: 'lose', winMult: 0 };
  return { result: 'push', winMult: 1 };
}

// ------------------------------- BACARÁ (Punto Banco) -------------------------------
// Valor de la mano: suma módulo 10. Reglas de tercera carta estándar.
function baccaratValue(cards) {
  let t = 0;
  for (const c of cards) {
    if (c.r === 'A') t += 1;
    else if (['K', 'Q', 'J', '10'].includes(c.r)) t += 0;
    else t += parseInt(c.r, 10);
  }
  return t % 10;
}

// Reparte una ronda completa. Devuelve manos y resultado.
// winMult: retorno total incluyendo la apuesta (jugador 2x, banca 1.95x,
// empate 9x en apuesta a empate; las apuestas a jugador/banca empatan y se devuelven).
function baccaratRound(betOn) {
  const deck = newDeck(6);
  const player = [deck.pop(), deck.pop()];
  const banker = [deck.pop(), deck.pop()];
  let pv = baccaratValue(player);
  let bv = baccaratValue(banker);
  let playerThird = null;
  if (pv <= 5) {
    playerThird = deck.pop();
    player.push(playerThird);
    pv = baccaratValue(player);
  }
  const bankerDraws = (() => {
    if (bv <= 2) return true;
    if (playerThird === null) return bv <= 5;
    const t = playerThird.r === 'A' ? 1 : (['K', 'Q', 'J', '10'].includes(playerThird.r) ? 0 : parseInt(playerThird.r, 10));
    if (bv === 3) return t !== 8;
    if (bv === 4) return t >= 2 && t <= 7;
    if (bv === 5) return t >= 4 && t <= 7;
    if (bv === 6) return t === 6 || t === 7;
    return false;
  })();
  if (bankerDraws) {
    banker.push(deck.pop());
    bv = baccaratValue(banker);
  }
  let winner = 'tie';
  if (pv > bv) winner = 'player';
  else if (bv > pv) winner = 'banker';
  let result, winMult;
  if (winner === 'tie') {
    if (betOn === 'tie') { result = 'tie-win'; winMult = 9; }
    else { result = 'push'; winMult = 1; }
  } else if (winner === betOn) {
    result = 'win';
    winMult = betOn === 'banker' ? 1.95 : 2;
  } else {
    result = 'lose';
    winMult = 0;
  }
  return { player, banker, playerValue: pv, bankerValue: bv, winner, result, winMult };
}

// ------------------------------- VIDEO PÓKER (Jacks or Better) -------------------------------
// profitMult: ganancia en múltiplos de la apuesta (retorno total = 1 + profitMult).
function evaluatePokerHand(cards) {
  const ranks = cards.map((c) => c.r);
  const suits = cards.map((c) => c.s);
  const order = { J: 11, Q: 12, K: 13, A: 14 };
  const vals = ranks.map((r) => order[r] || parseInt(r, 10)).sort((a, b) => a - b);
  const counts = {};
  for (const v of vals) counts[v] = (counts[v] || 0) + 1;
  const groups = Object.values(counts).sort((a, b) => b - a);
  const flush = suits.every((s) => s === suits[0]);
  const straight = vals[4] - vals[0] === 4 && new Set(vals).size === 5 ||
    (vals.join(',') === '2,3,4,5,14'); // A-2-3-4-5
  const isRoyal = flush && vals[0] === 10 && vals[4] === 14;
  if (isRoyal) return { name: 'Escalera Real', profitMult: 250 };
  if (flush && straight) return { name: 'Escalera de Color', profitMult: 50 };
  if (groups[0] === 4) return { name: 'Póker', profitMult: 25 };
  if (groups[0] === 3 && groups[1] === 2) return { name: 'Full House', profitMult: 9 };
  if (flush) return { name: 'Color', profitMult: 6 };
  if (straight) return { name: 'Escalera', profitMult: 4 };
  if (groups[0] === 3) return { name: 'Tercia', profitMult: 3 };
  if (groups[0] === 2 && groups[1] === 2) return { name: 'Dos Pares', profitMult: 2 };
  if (groups[0] === 2) {
    const pairVal = Number(Object.keys(counts).find((k) => counts[k] === 2));
    if (pairVal >= 11) return { name: 'Par de Jotas o mejor', profitMult: 1 };
  }
  return { name: 'Sin premio', profitMult: 0 };
}

module.exports = {
  SYM, THEMES, PAYLINES, slotSpin, slotRespin, nudgeGrid, rouletteSpin, rouletteColor,
  newDeck, handValue, isBlackjack, playDealer, settleBlackjack,
  baccaratRound, baccaratValue, evaluatePokerHand,
};
