// Base de datos Postgres (pg) con la variable de entorno DATABASE_URL.
// La persistencia vive en una base Postgres externa (p. ej. Supabase gratis),
// por lo que los datos sobreviven a reinicios y redespliegues en Render.
// Sin DATABASE_URL el servidor no arranca: falla rápido con un mensaje claro.
//
// Mismo esquema y mismas funciones que la versión SQLite anterior:
// cuentas, saldos, VIP, historial, sesiones, estado de juego y admin.
// Diferencias obligadas por Postgres:
// - Parámetros $1, $2... en vez de ?
// - is_admin sigue siendo INTEGER 0/1 (para no tocar la lógica que lo compara)
// - COUNT(*) y SUM() se castean a int porque pg devuelve bigint como texto
// - created_at es TIMESTAMPTZ (pg lo devuelve como Date; en JSON sale ISO)
// - Las transacciones usan un cliente del pool (BEGIN/COMMIT/ROLLBACK)
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    'Falta la variable de entorno DATABASE_URL (URL de la base Postgres, p. ej. la de Supabase).'
  );
}

// Supabase (y otros Postgres gestionados) exigen SSL. pg rechaza su
// certificado sin CA propia, así que se desactiva esa verificación solo
// cuando la URL pide SSL o apunta a Supabase.
const needsSsl = /sslmode=require/i.test(DATABASE_URL) || /supabase\.co/i.test(DATABASE_URL);

const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
  ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});

pool.on('error', (err) => {
  console.error('Error del pool de Postgres:', err.message);
});

// Esquema idéntico al de SQLite. Se crea al arrancar si no existe.
const ready = (async () => {
  await pool.query(`
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  balance_cents INTEGER NOT NULL DEFAULT 100000,
  total_wagered_cents INTEGER NOT NULL DEFAULT 0,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS plays (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  bet_cents INTEGER NOT NULL,
  win_cents INTEGER NOT NULL,
  detail TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Estado de juego en curso por jugador (mano de blackjack, giros gratis,
-- respin dorado). Una fila por usuario, JSON.
CREATE TABLE IF NOT EXISTS game_states (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`);
})();

// Transacción con un cliente del pool.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    try { await client.query('ROLLBACK'); } catch (_) { /* ya sin transacción */ }
    throw e;
  } finally {
    client.release();
  }
}

// --- Usuarios ---
const qPublicUser = (u) => ({
  id: u.id,
  phone: u.phone,
  balance: u.balance_cents / 100,
  totalWagered: u.total_wagered_cents / 100,
  isAdmin: u.is_admin === 1,
  createdAt: u.created_at,
});

async function findByPhone(phone) {
  const { rows } = await pool.query('SELECT * FROM users WHERE phone = $1', [phone]);
  return rows[0] || null;
}

async function findById(id) {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] || null;
}

async function countUsers() {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM users');
  return rows[0].n;
}

async function listUsers() {
  const { rows } = await pool.query(
    'SELECT id, phone, balance_cents, total_wagered_cents, is_admin, created_at FROM users ORDER BY id ASC'
  );
  return rows.map((u) => ({
    id: u.id, phone: u.phone, balance: u.balance_cents / 100,
    totalWagered: u.total_wagered_cents / 100, isAdmin: u.is_admin === 1, createdAt: u.created_at,
  }));
}

async function totalWageredAll() {
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(total_wagered_cents), 0)::int AS total FROM users'
  );
  return rows[0].total / 100;
}

async function createUser(phone, hash) {
  const isFirst = (await countUsers()) === 0;
  const { rows } = await pool.query(
    `INSERT INTO users (phone, password_hash, is_admin)
     VALUES ($1, $2, $3)
     RETURNING id, phone, balance_cents, total_wagered_cents, is_admin, created_at`,
    [phone, hash, isFirst ? 1 : 0]
  );
  return { ...qPublicUser(rows[0]), isAdmin: isFirst };
}

async function resetBalance(userId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) throw new Error('Usuario no encontrado');
    await client.query('UPDATE users SET balance_cents = 100000 WHERE id = $1', [userId]);
    // El total jugado NO se reinicia: el VIP se conserva.
    return { balance: 1000, totalWagered: user.total_wagered_cents / 100 };
  });
}

// --- Sesiones ---
async function createSession(token, userId, expiresAt) {
  await pool.query(
    'INSERT INTO sessions (token, user_id, expires_at) VALUES ($1, $2, $3)',
    [token, userId, expiresAt]
  );
}

async function findSession(token) {
  const { rows } = await pool.query(
    `SELECT s.*, u.id AS uid FROM sessions s
     JOIN users u ON u.id = s.user_id WHERE s.token = $1`,
    [token]
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, expires_at: Number(row.expires_at) };
}

async function deleteSession(token) {
  await pool.query('DELETE FROM sessions WHERE token = $1', [token]);
}

async function cleanupSessions() {
  await pool.query('DELETE FROM sessions WHERE expires_at < $1', [Date.now()]);
}

// --- Jugadas ---
async function history(userId, limit) {
  const { rows } = await pool.query(
    `SELECT id, game, bet_cents, win_cents, detail, created_at FROM plays
     WHERE user_id = $1 ORDER BY id DESC LIMIT $2`,
    [userId, limit || 50]
  );
  return rows.map((p) => ({
    id: p.id, game: p.game, bet: p.bet_cents / 100, win: p.win_cents / 100,
    detail: p.detail ? JSON.parse(p.detail) : {}, createdAt: p.created_at,
  }));
}

// --- Estado de juego ---
async function getState(userId) {
  const { rows } = await pool.query('SELECT state FROM game_states WHERE user_id = $1', [userId]);
  return rows[0] ? JSON.parse(rows[0].state) : null;
}

async function setState(userId, state) {
  await pool.query(
    `INSERT INTO game_states (user_id, state, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (user_id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
    [userId, JSON.stringify(state)]
  );
}

async function clearState(userId) {
  await pool.query('DELETE FROM game_states WHERE user_id = $1', [userId]);
}

// Transacción: aplicar el resultado de una apuesta (descontar apuesta, sumar
// premio, acumular lo jugado, registrar la jugada) en una sola operación.
async function applyBet(userId, betCents, winCents, game, detail) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) throw new Error('Usuario no encontrado');
    if (user.balance_cents < betCents) throw new Error('Saldo insuficiente');
    const newBalance = user.balance_cents - betCents + winCents;
    await client.query('UPDATE users SET balance_cents = $1 WHERE id = $2', [newBalance, userId]);
    await client.query(
      'UPDATE users SET total_wagered_cents = total_wagered_cents + $1 WHERE id = $2',
      [betCents, userId]
    );
    await client.query(
      'INSERT INTO plays (user_id, game, bet_cents, win_cents, detail) VALUES ($1, $2, $3, $4, $5)',
      [userId, game, betCents, winCents, JSON.stringify(detail || {})]
    );
    return { balance: newBalance / 100, totalWagered: (user.total_wagered_cents + betCents) / 100 };
  });
}

// Crédito sin apuesta (premio de giros gratis o de respin ya descontado antes).
async function applyWin(userId, winCents, game, detail) {
  return withTransaction(async (client) => {
    const { rows } = await client.query('SELECT * FROM users WHERE id = $1', [userId]);
    const user = rows[0];
    if (!user) throw new Error('Usuario no encontrado');
    const newBalance = user.balance_cents + winCents;
    await client.query('UPDATE users SET balance_cents = $1 WHERE id = $2', [newBalance, userId]);
    await client.query(
      'INSERT INTO plays (user_id, game, bet_cents, win_cents, detail) VALUES ($1, $2, $3, $4, $5)',
      [userId, game, 0, winCents, JSON.stringify(detail || {})]
    );
    return { balance: newBalance / 100, totalWagered: user.total_wagered_cents / 100 };
  });
}

module.exports = {
  pool,
  db: pool,
  ready,
  createUser,
  findByPhone,
  findById,
  publicUser: qPublicUser,
  listUsers,
  countUsers,
  totalWageredAll,
  resetBalance,
  createSession,
  findSession,
  deleteSession,
  cleanupSessions,
  history,
  getState,
  setState,
  clearState,
  applyBet,
  applyWin,
};
