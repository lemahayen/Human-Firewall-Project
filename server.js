const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.sqlite');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Real SQL database (SQLite via sql.js) ----------
let db;

function persist() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

function run(sql, params = []) {
  db.run(sql, params);
  persist();
}

function all(sql, params = []) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}

async function initDB() {
  const SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      pre_score INTEGER NOT NULL,
      post_score INTEGER NOT NULL,
      time_seconds INTEGER NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  persist();
}

// ---------- API ----------

app.post('/api/login', (req, res) => {
  const raw = (req.body && req.body.username) || '';
  const username = raw.trim().slice(0, 30);
  if (!username) return res.status(400).json({ error: 'username required' });

  const existing = all('SELECT username FROM users WHERE username = ?', [username]);
  if (existing.length === 0) {
    run('INSERT INTO users (username) VALUES (?)', [username]);
  }
  res.json({ username });
});

app.post('/api/submit', (req, res) => {
  const { username, preScore, postScore, timeSeconds } = req.body || {};
  if (!username || typeof preScore !== 'number' || typeof postScore !== 'number' || typeof timeSeconds !== 'number') {
    return res.status(400).json({ error: 'username, preScore, postScore, timeSeconds are required' });
  }
  run(
    'INSERT INTO scores (username, pre_score, post_score, time_seconds) VALUES (?, ?, ?, ?)',
    [username, preScore, postScore, timeSeconds]
  );
  res.json({ ok: true });
});

// Clear the leaderboard (deletes all score records, keeps registered usernames).
// Protected by a simple key so randoms can't wipe it by guessing the URL.
const RESET_KEY = 'Aditya';
app.get('/api/reset-leaderboard', (req, res) => {
  if (req.query.key !== RESET_KEY) {
    return res.status(403).send('Wrong or missing key. Use ?key=YOUR_KEY in the URL.');
  }
  run('DELETE FROM scores', []);
  res.send('Leaderboard cleared.');
});

app.get('/api/leaderboard', (req, res) => {
  const rows = all('SELECT username, post_score, time_seconds FROM scores');

  const best = {};
  for (const r of rows) {
    const cur = best[r.username];
    const better =
      !cur ||
      r.post_score > cur.post_score ||
      (r.post_score === cur.post_score && r.time_seconds < cur.time_seconds);
    if (better) best[r.username] = r;
  }

  const leaderboard = Object.values(best).sort(
    (a, b) => b.post_score - a.post_score || a.time_seconds - b.time_seconds
  );

  res.json(leaderboard.slice(0, 50));
});

initDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Human Firewall server running at http://localhost:${PORT}`);
    });
  })
  .catch(err => {
    console.error('Failed to initialize the database:', err);
    process.exit(1);
  });
