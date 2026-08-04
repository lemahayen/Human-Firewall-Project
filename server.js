const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Tiny file-based "database" ----------
// No native modules, no compiling, no Python required — just a JSON file
// on disk. Good enough for a class project; swap for a real SQL database
// later if you need one (the shape below maps directly to two tables:
// users(username) and scores(username, pre_score, post_score, time_seconds)).

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    return { users: [], scores: [] };
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  } catch (e) {
    return { users: [], scores: [] };
  }
}

function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- API ----------

// Log in (or silently register) a username. No password - this is an
// awareness-training tool, not an account system, so we just need a
// stable name to attach scores to.
app.post('/api/login', (req, res) => {
  const raw = (req.body && req.body.username) || '';
  const username = raw.trim().slice(0, 30);
  if (!username) return res.status(400).json({ error: 'username required' });

  const db = loadDB();
  if (!db.users.find(u => u.username === username)) {
    db.users.push({ username, created_at: new Date().toISOString() });
    saveDB(db);
  }
  res.json({ username });
});

// Save one completed attempt (pre score, post score, total time in seconds)
app.post('/api/submit', (req, res) => {
  const { username, preScore, postScore, timeSeconds } = req.body || {};
  if (!username || typeof preScore !== 'number' || typeof postScore !== 'number' || typeof timeSeconds !== 'number') {
    return res.status(400).json({ error: 'username, preScore, postScore, timeSeconds are required' });
  }
  const db = loadDB();
  db.scores.push({
    username,
    pre_score: preScore,
    post_score: postScore,
    time_seconds: timeSeconds,
    created_at: new Date().toISOString()
  });
  saveDB(db);
  res.json({ ok: true });
});

// Leaderboard: best attempt per user, ranked by post-test score (desc)
// then by fastest completion time (asc) as the tiebreaker.
app.get('/api/leaderboard', (req, res) => {
  const db = loadDB();

  const best = {};
  for (const r of db.scores) {
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

app.listen(PORT, () => {
  console.log(`Human Firewall server running at http://localhost:${PORT}`);
});
