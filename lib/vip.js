// Escalera VIP — 16 niveles. Cada paso exige $10,000 jugados más que el
// anterior (monto acumulado de lo jugado). Total para llegar a REAL: $1,200,000.
const LEVELS = [
  { name: 'Bronce 1',   req: 0 },
  { name: 'Bronce 2',   req: 10000 },
  { name: 'Bronce 3',   req: 30000 },
  { name: 'Plata 1',    req: 60000 },
  { name: 'Plata 2',    req: 100000 },
  { name: 'Plata 3',    req: 150000 },
  { name: 'Oro 1',      req: 210000 },
  { name: 'Oro 2',      req: 280000 },
  { name: 'Oro 3',      req: 360000 },
  { name: 'Platino 1',  req: 450000 },
  { name: 'Platino 2',  req: 550000 },
  { name: 'Platino 3',  req: 660000 },
  { name: 'Diamante 1', req: 780000 },
  { name: 'Diamante 2', req: 910000 },
  { name: 'Diamante 3', req: 1050000 },
  { name: 'REAL',       req: 1200000 },
];

// totalWageredPesos: monto acumulado jugado, en pesos (número, puede tener decimales).
// Devuelve { levelIndex, level, next, wageredToNext, progress, totalForNext }.
function vipStatus(totalWageredPesos) {
  let idx = 0;
  for (let i = 0; i < LEVELS.length; i++) {
    if (totalWageredPesos >= LEVELS[i].req) idx = i;
    else break;
  }
  const level = LEVELS[idx];
  const next = LEVELS[idx + 1] || null;
  let progress = 1;
  let wageredToNext = 0;
  if (next) {
    const span = next.req - level.req;
    const done = totalWageredPesos - level.req;
    progress = Math.max(0, Math.min(1, done / span));
    wageredToNext = next.req - totalWageredPesos;
  }
  return {
    levelIndex: idx,
    level: level.name,
    next: next ? next.name : null,
    nextReq: next ? next.req : null,
    wageredToNext,
    progress,
    wagered: totalWageredPesos,
    ladder: LEVELS.map((l) => ({ name: l.name, req: l.req })),
  };
}

module.exports = { LEVELS, vipStatus };
