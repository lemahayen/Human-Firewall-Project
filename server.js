// Human Firewall Project (CyT-AL3)
// Backend for the pre-test, training, post-test and final quiz.
// Uses Express and Neon PostgreSQL.

const express = require('express');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '20kb' }));
app.use(express.static('public'));

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is missing from environment variables.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// Determine the user's rank from the final quiz score out of 10.
function getRankTitle(finalScore) {
  if (finalScore < 5) return 'Rookie Under Review';
  if (finalScore < 6) return 'Cyber Recruit';
  if (finalScore < 7) return 'Threat Hunter';
  if (finalScore < 8) return 'Cyber Sentinel';
  if (finalScore < 9) return 'Cyber Guardian';
  return 'Cyber Overlord';
}

// Create missing tables and add the new score columns if necessary.
// Existing database records are not deleted.
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

  await pool.query(`
    ALTER TABLE scores
      ADD COLUMN IF NOT EXISTS final_score INTEGER;

    ALTER TABLE scores
      ADD COLUMN IF NOT EXISTS rank_title VARCHAR(40);
  `);

  // Add score-range constraints without validating historical records.
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'scores_pre_score_range_check'
          AND conrelid = 'scores'::regclass
      ) THEN
        ALTER TABLE scores
          ADD CONSTRAINT scores_pre_score_range_check
          CHECK (pre_score BETWEEN 0 AND 6) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'scores_post_score_range_check'
          AND conrelid = 'scores'::regclass
      ) THEN
        ALTER TABLE scores
          ADD CONSTRAINT scores_post_score_range_check
          CHECK (post_score BETWEEN 0 AND 6) NOT VALID;
      END IF;

      IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'scores_final_score_range_check'
          AND conrelid = 'scores'::regclass
      ) THEN
        ALTER TABLE scores
          ADD CONSTRAINT scores_final_score_range_check
          CHECK (
            final_score IS NULL OR final_score BETWEEN 0 AND 10
          ) NOT VALID;
      END IF;
    END $$;
  `);

  console.log(
    'Neon PostgreSQL connected; score schema checked and updated.'
  );
}

// Register a participant using their name.
app.post('/api/login', async (req, res) => {
  try {
    const raw = (req.body && req.body.username) || '';
    const username =
      typeof raw === 'string' ? raw.trim().slice(0, 30) : '';

    if (!username) {
      return res.status(400).json({
        error: 'username required'
      });
    }

    await pool.query(
      `INSERT INTO users (username)
       VALUES ($1)
       ON CONFLICT (username) DO NOTHING`,
      [username]
    );

    return res.json({ username });
  } catch (err) {
    console.error('Login database error:', err);

    return res.status(500).json({
      error: 'Unable to process login'
    });
  }
});

// Save the pre-test, post-test and final quiz scores.
app.post('/api/submit', async (req, res) => {
  try {
    const body = req.body || {};

    const {
      username,
      preScore,
      postScore,
      finalScore,
      timeSeconds
    } = body;

    const cleanUsername =
      typeof username === 'string' ? username.trim() : '';

    const valid =
      cleanUsername.length >= 1 &&
      cleanUsername.length <= 30 &&
      Number.isInteger(preScore) &&
      preScore >= 0 &&
      preScore <= 6 &&
      Number.isInteger(postScore) &&
      postScore >= 0 &&
      postScore <= 6 &&
      Number.isInteger(finalScore) &&
      finalScore >= 0 &&
      finalScore <= 10 &&
      Number.isInteger(timeSeconds) &&
      timeSeconds >= 0 &&
      timeSeconds <= 86400;

    if (!valid) {
      return res.status(400).json({
        error:
          'A valid username, preScore (0-6), postScore (0-6), ' +
          'finalScore (0-10), and timeSeconds are required.'
      });
    }

    // Confirm that the participant has registered.
    const user = await pool.query(
      'SELECT username FROM users WHERE username = $1',
      [cleanUsername]
    );

    if (user.rowCount === 0) {
      return res.status(400).json({
        error: 'Please register before submitting a score.'
      });
    }

    // Calculate the rank on the server.
    const rankTitle = getRankTitle(finalScore);

    const saved = await pool.query(
      `INSERT INTO scores (
        username,
        pre_score,
        post_score,
        final_score,
        rank_title,
        time_seconds
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        username,
        pre_score,
        post_score,
        final_score,
        rank_title,
        time_seconds,
        created_at`,
      [
        cleanUsername,
        preScore,
        postScore,
        finalScore,
        rankTitle,
        timeSeconds
      ]
    );

    return res.json({
      ok: true,
      score: saved.rows[0]
    });
  } catch (err) {
    console.error('Score submission error:', err);

    return res.status(500).json({
      error: 'Unable to save score'
    });
  }
});

// Protected endpoint for clearing the leaderboard.
// RESET_KEY must be configured in Render.
app.get('/api/reset-leaderboard', async (req, res) => {
  const resetKey = process.env.RESET_KEY;

  if (!resetKey || req.query.key !== resetKey) {
    return res.status(403).send('Wrong or missing key.');
  }

  try {
    await pool.query('DELETE FROM scores');

    return res.send('Leaderboard cleared.');
  } catch (err) {
    console.error('Leaderboard reset error:', err);

    return res.status(500).send(
      'Unable to clear leaderboard.'
    );
  }
});

// Return the best final quiz result for each participant.
app.get('/api/leaderboard', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        username,
        final_score,
        rank_title,
        time_seconds
      FROM (
        SELECT
          username,
          final_score,
          rank_title,
          time_seconds,
          ROW_NUMBER() OVER (
            PARTITION BY username
            ORDER BY
              final_score DESC,
              time_seconds ASC,
              created_at ASC,
              id ASC
          ) AS position
        FROM scores
        WHERE final_score IS NOT NULL
      ) ranked
      WHERE position = 1
      ORDER BY
        final_score DESC,
        time_seconds ASC,
        username ASC
      LIMIT 50
    `);

    return res.json(result.rows);
  } catch (err) {
    console.error('Leaderboard database error:', err);

    return res.status(500).json({
      error: 'Unable to load leaderboard'
    });
  }
});

// Health check for Render and Neon.
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    return res.json({
      ok: true,
      database: 'connected'
    });
  } catch (err) {
    console.error('Database health check failed:', err);

    return res.status(503).json({
      ok: false,
      database: 'disconnected'
    });
  }
});

// Start the server after the database has been initialized.
async function startServer() {
  try {
    await initDB();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `Human Firewall server running on port ${PORT}`
      );
    });
  } catch (err) {
    console.error(
      'Failed to initialize Neon database:',
      err
    );

    process.exit(1);
  }
}

startServer();
