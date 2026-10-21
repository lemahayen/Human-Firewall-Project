
const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('public'));

// ---------- Neon PostgreSQL database ----------
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing from environment variables.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(30) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS scores (
      id SERIAL PRIMARY KEY,
      username VARCHAR(30) NOT NULL,
      pre_score INTEGER NOT NULL,
      post_score INTEGER NOT NULL,
      time_seconds INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log('Neon PostgreSQL database connected and tables checked.');
}

// ---------- API ----------

app.post('/api/login', async (req, res) => {
  try {
    const raw = (req.body && req.body.username) || '';
    const username = raw.trim().slice(0, 30);

    if (!username) {
      return res.status(400).json({ error: 'username required' });
    }

    await pool.query(
      'INSERT INTO users (username) VALUES ($1) ON CONFLICT (username) DO NOTHING',
      [username]
    );

    res.json({ username });
  } catch (err) {
    console.error('Login database error:', err);
    res.status(500).json({ error: 'Unable to process login' });
  }
});

app.post('/api/submit', async (req, res) => {
  try {
    const { username, preScore, postScore, timeSeconds } = req.body || {};

    if (
      typeof username !== 'string' ||
      !username.trim() ||
      username.trim().length > 30 ||
      !Number.isInteger(preScore) ||
      !Number.isInteger(postScore) ||
      !Number.isInteger(timeSeconds) ||
      preScore < 0 ||
      postScore < 0 ||
      timeSeconds < 0
    ) {
      return res.status(400).json({
        error: 'A valid username, preScore, postScore and timeSeconds are required'
      });
    }

    const cleanUsername = username.trim();

    const user = await pool.query(
      'SELECT username FROM users WHERE username = $1',
      [cleanUsername]
    );

    if (user.rowCount === 0) {
      return res.status(400).json({ error: 'Please log in before submitting a score' });
    }

    await pool.query(
      `INSERT INTO scores (username, pre_score, post_score, time_seconds)
       VALUES ($1, $2, $3, $4)`,
      [cleanUsername, preScore, postScore, timeSeconds]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('Score submission error:', err);
    res.status(500).json({ error: 'Unable to save score' });
  }
});

// Clear leaderboard using a secret stored in Render Environment.
// Set RESET_KEY in Render before using this endpoint.
app.get('/api/reset-leaderboard', async (req, res) => {
  const resetKey = process.env.RESET_KEY;

  if (!resetKey || req.query.key !== resetKey) {
    return res.status(403).send('Wrong or missing key.');
  }

  try {
    await pool.query('DELETE FROM scores');
    res.send('Leaderboard cleared.');
  } catch (err) {
    console.error('Leaderboard reset error:', err);
    res.status(500).send('Unable to clear leaderboard.');
  }
});

app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT username, post_score, time_seconds
      FROM (
        SELECT
          username,
          post_score,
          time_seconds,
          ROW_NUMBER() OVER (
            PARTITION BY username
            ORDER BY post_score DESC, time_seconds ASC, created_at ASC
          ) AS position
        FROM scores
      ) ranked
      WHERE position = 1
      ORDER BY post_score DESC, time_seconds ASC
      LIMIT 50
    `);

    res.json(result.rows);
  } catch (err) {
    console.error('Leaderboard database error:', err);
    res.status(500).json({ error: 'Unable to load leaderboard' });
  }
});

// Health check for verifying deployment and database connectivity.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected' });
  } catch (err) {
    console.error('Database health check failed:', err);
    res.status(503).json({ ok: false, database: 'disconnected' });
  }
});

async function startServer() {
  try {
    await initDB();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Human Firewall server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Failed to initialize Neon database:', err);
    process.exit(1);
  }
}

startServer();
