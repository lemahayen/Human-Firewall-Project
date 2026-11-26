// Human Firewall Project (CyT-AL3)
// Development backend for supervisor improvements.
// IMPORTANT: This version uses new hf_* tables and does not delete or alter
// the legacy users/scores tables. It is intended for the development branch.

'use strict';

const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is missing. Set it to the Neon DEVELOPMENT branch connection string.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.disable('x-powered-by');
app.use(express.json({ limit: '30kb' }));
app.use(express.static('public'));

const SESSION_HOURS = 8;
const CONSENT_VERSION = '1.0';
const PASS_MARK = 50;

const questionBank = [
  // Baseline assessment: six questions
  {
    id: 'PRE-01', type: 'pre', topic: 'password_security', difficulty: 2,
    prompt: 'You need to create an account for a new work application. Which approach offers the strongest protection?',
    options: [
      { id: 'A', text: 'Reuse your usual password so it is easy to remember.' },
      { id: 'B', text: 'Use a unique password stored in an approved password manager, with MFA enabled.' },
      { id: 'C', text: 'Use your company name followed by the current year.' },
      { id: 'D', text: 'Share a strong password with your team so access is not interrupted.' }
    ],
    correct: 'B',
    explanation: 'A unique password prevents a breach on one service from exposing other accounts. MFA adds another layer of protection.'
  },
  {
    id: 'PRE-02', type: 'pre', topic: 'phishing', difficulty: 2,
    prompt: 'An email from a senior manager asks you to open an attachment urgently. You were not expecting it. What should you do first?',
    options: [
      { id: 'A', text: 'Open it because the sender is senior.' },
      { id: 'B', text: 'Reply to the email asking whether it is genuine.' },
      { id: 'C', text: 'Verify the request through a separate trusted channel and report it if suspicious.' },
      { id: 'D', text: 'Forward it to colleagues to ask whether they received it.' }
    ],
    correct: 'C',
    explanation: 'Verify unexpected requests using a known contact method, not the contact details or links in the suspicious message.'
  },
  {
    id: 'PRE-03', type: 'pre', topic: 'phishing', difficulty: 2,
    prompt: 'A link in a work email displays the text “Company Portal”, but its destination preview shows an unfamiliar domain. What is the safest action?',
    options: [
      { id: 'A', text: 'Do not open it; navigate to the portal using a known bookmark or official address.' },
      { id: 'B', text: 'Open it because the displayed link text looks correct.' },
      { id: 'C', text: 'Open it in a private browser window.' },
      { id: 'D', text: 'Click it once to see whether the company logo appears.' }
    ],
    correct: 'A',
    explanation: 'Displayed link text can conceal a different destination. Use a trusted bookmark or type the official address yourself.'
  },
  {
    id: 'PRE-04', type: 'pre', topic: 'data_handling', difficulty: 2,
    prompt: 'You notice that a spreadsheet containing employee salary information was sent to the wrong internal recipient. What should you do?',
    options: [
      { id: 'A', text: 'Ask the recipient to delete it and take no further action.' },
      { id: 'B', text: 'Report the incident immediately through the approved process and follow instructions.' },
      { id: 'C', text: 'Delete the sent email from your mailbox.' },
      { id: 'D', text: 'Wait to see whether the recipient opens the file.' }
    ],
    correct: 'B',
    explanation: 'A misdirected sensitive file is a potential data incident. Report it promptly so the organisation can contain and assess it.'
  },
  {
    id: 'PRE-05', type: 'pre', topic: 'data_handling', difficulty: 2,
    prompt: 'A visitor says they have forgotten their access badge and asks you to hold the secure office door open. What is the appropriate response?',
    options: [
      { id: 'A', text: 'Allow them in if they appear familiar with the office.' },
      { id: 'B', text: 'Ask another employee to let them through.' },
      { id: 'C', text: 'Politely direct them to reception or the approved visitor process.' },
      { id: 'D', text: 'Allow them in if they promise to sign in later.' }
    ],
    correct: 'C',
    explanation: 'Do not bypass physical access controls. Visitors must follow the organisation’s approved entry process.'
  },
  {
    id: 'PRE-06', type: 'pre', topic: 'password_security', difficulty: 3,
    prompt: 'You entered your work password into a page that now appears suspicious. What is the best immediate response?',
    options: [
      { id: 'A', text: 'Close the browser and wait to see whether anything happens.' },
      { id: 'B', text: 'Change the password using the genuine service, report the incident and follow the security team’s guidance.' },
      { id: 'C', text: 'Send the password to IT so they can test it.' },
      { id: 'D', text: 'Keep using the account but monitor your inbox.' }
    ],
    correct: 'B',
    explanation: 'Treat the password as compromised. Change it through the genuine service and report the incident promptly.'
  },

  // Post-training assessment: equivalent topics and difficulty, different items
  {
    id: 'POST-01', type: 'post', topic: 'password_security', difficulty: 2,
    prompt: 'A colleague asks to use your account briefly because their account is locked. What should you do?',
    options: [
      { id: 'A', text: 'Give them your password but ask them not to save it.' },
      { id: 'B', text: 'Approve their access using your MFA prompt.' },
      { id: 'C', text: 'Decline to share your account and direct them to the approved account-recovery process.' },
      { id: 'D', text: 'Create a temporary password and send it through chat.' }
    ],
    correct: 'C',
    explanation: 'Accounts are assigned to individuals. Sharing credentials or approving another person’s MFA request undermines accountability.'
  },
  {
    id: 'POST-02', type: 'post', topic: 'phishing', difficulty: 2,
    prompt: 'You receive an unexpected message claiming your mailbox will be disabled unless you sign in within 15 minutes. What is the safest response?',
    options: [
      { id: 'A', text: 'Use the link quickly to avoid losing access.' },
      { id: 'B', text: 'Open the company portal from a trusted bookmark and report the message through the approved channel.' },
      { id: 'C', text: 'Reply with your employee number to confirm your identity.' },
      { id: 'D', text: 'Forward the message to your personal email for later inspection.' }
    ],
    correct: 'B',
    explanation: 'Urgency and threats are common phishing tactics. Check the account through a trusted route and report the message.'
  },
  {
    id: 'POST-03', type: 'post', topic: 'phishing', difficulty: 2,
    prompt: 'A supplier emails new bank details and asks you to update a payment record. The email looks genuine. What should happen before any change?',
    options: [
      { id: 'A', text: 'Verify the change using a previously known telephone number or established supplier process.' },
      { id: 'B', text: 'Accept the change because the email came from the supplier’s usual address.' },
      { id: 'C', text: 'Reply asking the sender to confirm the new account number.' },
      { id: 'D', text: 'Make a small test payment to the new account.' }
    ],
    correct: 'A',
    explanation: 'Payment-detail changes require independent verification because supplier accounts and email threads can be compromised.'
  },
  {
    id: 'POST-04', type: 'post', topic: 'data_handling', difficulty: 2,
    prompt: 'You need to send a confidential report to an external auditor. Which method should you use?',
    options: [
      { id: 'A', text: 'Send it to the auditor’s personal email address.' },
      { id: 'B', text: 'Upload it to any free file-sharing website.' },
      { id: 'C', text: 'Use the organisation-approved secure sharing method and verify the recipient’s access.' },
      { id: 'D', text: 'Send it to a large distribution list so the auditor can find it.' }
    ],
    correct: 'C',
    explanation: 'Use approved secure sharing controls and grant access only to the intended, verified recipient.'
  },
  {
    id: 'POST-05', type: 'post', topic: 'data_handling', difficulty: 2,
    prompt: 'Someone you do not recognise follows you through a controlled office entrance without presenting a badge. What should you do?',
    options: [
      { id: 'A', text: 'Ignore it because challenging someone may be uncomfortable.' },
      { id: 'B', text: 'Allow it if they are carrying a laptop.' },
      { id: 'C', text: 'Politely challenge them in line with workplace procedure or alert security/reception.' },
      { id: 'D', text: 'Hold the door because they may be late for a meeting.' }
    ],
    correct: 'C',
    explanation: 'Tailgating bypasses physical access controls. Follow the organisation’s procedure to challenge or report it safely.'
  },
  {
    id: 'POST-06', type: 'post', topic: 'password_security', difficulty: 3,
    prompt: 'You approved an MFA notification that you did not initiate. What should you do next?',
    options: [
      { id: 'A', text: 'Ignore it if you can still access your account.' },
      { id: 'B', text: 'Report the unexpected approval immediately and follow instructions to secure the account.' },
      { id: 'C', text: 'Approve any further notifications to stop them appearing.' },
      { id: 'D', text: 'Disable MFA permanently.' }
    ],
    correct: 'B',
    explanation: 'An unrequested MFA approval may indicate an account compromise. Report it immediately and secure the account.'
  },

  // Final assessment: ten application-focused questions
  {
    id: 'FINAL-01', type: 'final', topic: 'password_security', difficulty: 3,
    prompt: 'Your password manager reports that a password used for a work account appeared in a known data breach. The account still works. What is the best action?',
    options: [
      { id: 'A', text: 'Keep it because the account has not shown suspicious activity.' },
      { id: 'B', text: 'Change it to a unique password through the genuine service and review MFA and account activity.' },
      { id: 'C', text: 'Change one character and reuse it.' },
      { id: 'D', text: 'Wait until the service forces a password reset.' }
    ],
    correct: 'B',
    explanation: 'A breached password should be treated as exposed. Replace it with a unique password and review account protection.'
  },
  {
    id: 'FINAL-02', type: 'final', topic: 'phishing', difficulty: 3,
    prompt: 'A known colleague sends a document-sharing link, but their writing style is unusual and the message asks you to sign in again. What should you do?',
    options: [
      { id: 'A', text: 'Sign in because the sender is a colleague.' },
      { id: 'B', text: 'Ask the sender to resend the link.' },
      { id: 'C', text: 'Verify with the colleague using a separate trusted channel and report the message if suspicious.' },
      { id: 'D', text: 'Open it on your phone instead of your computer.' }
    ],
    correct: 'C',
    explanation: 'A colleague’s account may be compromised. Verify unusual requests independently before opening links or entering credentials.'
  },
  {
    id: 'FINAL-03', type: 'final', topic: 'data_handling', difficulty: 3,
    prompt: 'A team member requests a full customer export, although their task only requires a small subset of records. What should you provide?',
    options: [
      { id: 'A', text: 'The full export to avoid delaying the task.' },
      { id: 'B', text: 'Only the minimum authorised data needed for the task, using an approved transfer method.' },
      { id: 'C', text: 'The full export after removing the column headings.' },
      { id: 'D', text: 'A copy on a personal USB drive.' }
    ],
    correct: 'B',
    explanation: 'Apply data minimisation and least privilege: provide only authorised information needed for the task.'
  },
  {
    id: 'FINAL-04', type: 'final', topic: 'phishing', difficulty: 3,
    prompt: 'A QR code on a printed notice in the office asks employees to sign in to view a new HR policy. The notice has no clear owner. What should you do?',
    options: [
      { id: 'A', text: 'Scan it because it is displayed inside the office.' },
      { id: 'B', text: 'Ask a colleague whether they have scanned it.' },
      { id: 'C', text: 'Find the policy through the known HR portal or verify the notice with HR before scanning.' },
      { id: 'D', text: 'Scan it using a personal device.' }
    ],
    correct: 'C',
    explanation: 'QR codes can conceal malicious destinations. Verify the source and use the known HR portal.'
  },
  {
    id: 'FINAL-05', type: 'final', topic: 'password_security', difficulty: 3,
    prompt: 'You receive an MFA prompt while you are not attempting to sign in. A caller claiming to be IT asks you to approve it to stop an alert. What should you do?',
    options: [
      { id: 'A', text: 'Approve it because IT is helping.' },
      { id: 'B', text: 'Read the caller the MFA code.' },
      { id: 'C', text: 'Reject the prompt, end the call and contact IT through a known official channel.' },
      { id: 'D', text: 'Approve it once and change the password later.' }
    ],
    correct: 'C',
    explanation: 'Never approve an authentication request you did not initiate or disclose MFA codes. Verify the caller independently.'
  },
  {
    id: 'FINAL-06', type: 'final', topic: 'data_handling', difficulty: 3,
    prompt: 'You find a USB drive in a meeting room labelled “Payroll”. What is the safest action?',
    options: [
      { id: 'A', text: 'Connect it to your work computer to identify its owner.' },
      { id: 'B', text: 'Give it to an authorised IT/security contact without plugging it in.' },
      { id: 'C', text: 'Take it home and inspect it.' },
      { id: 'D', text: 'Ask a colleague to test it.' }
    ],
    correct: 'B',
    explanation: 'Unknown removable media can contain malware. Do not connect it; hand it to the appropriate security or IT team.'
  },
  {
    id: 'FINAL-07', type: 'final', topic: 'phishing', difficulty: 3,
    prompt: 'A message from a business partner asks you to bypass the normal approval process because a payment is “time critical”. What is the correct response?',
    options: [
      { id: 'A', text: 'Follow the request because the partner accepts responsibility.' },
      { id: 'B', text: 'Use the normal approval and independent verification process, regardless of the urgency.' },
      { id: 'C', text: 'Ask the sender to put the request in capital letters.' },
      { id: 'D', text: 'Process it if the email signature is correct.' }
    ],
    correct: 'B',
    explanation: 'Urgency must not override financial controls. Follow established approval and verification procedures.'
  },
  {
    id: 'FINAL-08', type: 'final', topic: 'data_handling', difficulty: 3,
    prompt: 'You accidentally attach a confidential document to an email addressed to the wrong external contact. What should you do first?',
    options: [
      { id: 'A', text: 'Delete the email from your Sent folder.' },
      { id: 'B', text: 'Report the incident immediately through the organisation’s incident process and follow containment instructions.' },
      { id: 'C', text: 'Wait for the recipient to reply.' },
      { id: 'D', text: 'Send another email asking them to ignore the first one, then close the issue.' }
    ],
    correct: 'B',
    explanation: 'Prompt reporting allows the organisation to assess exposure and take appropriate containment action.'
  },
  {
    id: 'FINAL-09', type: 'final', topic: 'password_security', difficulty: 3,
    prompt: 'A browser on a shared workstation offers to save your work password. What should you do?',
    options: [
      { id: 'A', text: 'Save it so the next shift can work faster.' },
      { id: 'B', text: 'Save it only if the browser is in private mode.' },
      { id: 'C', text: 'Do not save credentials on the shared workstation; sign out and follow the approved credential-storage policy.' },
      { id: 'D', text: 'Write it on a note and leave it beside the workstation.' }
    ],
    correct: 'C',
    explanation: 'Shared devices increase the risk of credential exposure. Do not store personal work credentials on them.'
  },
  {
    id: 'FINAL-10', type: 'final', topic: 'data_handling', difficulty: 3,
    prompt: 'You are working in a public place and need to discuss a confidential customer case. What is the safest approach?',
    options: [
      { id: 'A', text: 'Discuss it quietly because the information is important.' },
      { id: 'B', text: 'Use a public Wi-Fi network and share the details as usual.' },
      { id: 'C', text: 'Move to a private setting and use approved secure systems and communication methods.' },
      { id: 'D', text: 'Use customer names only, without account numbers.' }
    ],
    correct: 'C',
    explanation: 'Protect confidential information from being overheard or exposed. Use a private setting and approved systems.'
  },

  // Two mandatory checkpoint questions for each training module
  {
    id: 'CP-PASS-01', type: 'checkpoint', module: 'password_security', topic: 'password_security', difficulty: 2,
    prompt: 'A password is unique but short and predictable. What is the best improvement?',
    options: [
      { id: 'A', text: 'Keep it because it is unique.' },
      { id: 'B', text: 'Use a long, unique password or passphrase generated and stored by an approved password manager.' },
      { id: 'C', text: 'Add the company name.' },
      { id: 'D', text: 'Share it with a trusted colleague.' }
    ],
    correct: 'B',
    explanation: 'Use long, unique passwords and an approved password manager. Enable MFA where available.'
  },
  {
    id: 'CP-PASS-02', type: 'checkpoint', module: 'password_security', topic: 'password_security', difficulty: 2,
    prompt: 'You receive an MFA approval request that you did not initiate. What should you do?',
    options: [
      { id: 'A', text: 'Approve it to clear the notification.' },
      { id: 'B', text: 'Reject it and report the unexpected request through the approved channel.' },
      { id: 'C', text: 'Send the code to the help desk caller.' },
      { id: 'D', text: 'Disable MFA.' }
    ],
    correct: 'B',
    explanation: 'Reject unexpected MFA prompts and report them. Never share an MFA code or approve a sign-in you did not start.'
  },
  {
    id: 'CP-PHISH-01', type: 'checkpoint', module: 'phishing', topic: 'phishing', difficulty: 2,
    prompt: 'An email link appears to lead to a familiar service, but the actual domain is misspelled. What should you do?',
    options: [
      { id: 'A', text: 'Open it because the logo is familiar.' },
      { id: 'B', text: 'Do not open it; use the official address or bookmark and report the suspicious message.' },
      { id: 'C', text: 'Forward it to your personal account.' },
      { id: 'D', text: 'Open it on a mobile device.' }
    ],
    correct: 'B',
    explanation: 'A misspelled or unfamiliar domain is a warning sign. Avoid the link and report it.'
  },
  {
    id: 'CP-PHISH-02', type: 'checkpoint', module: 'phishing', topic: 'phishing', difficulty: 2,
    prompt: 'A caller asks you to reveal a one-time sign-in code to verify your identity. What should you do?',
    options: [
      { id: 'A', text: 'Provide it if the caller knows your name.' },
      { id: 'B', text: 'Provide only the first half.' },
      { id: 'C', text: 'Do not disclose it; end the call and verify the request using an official contact route.' },
      { id: 'D', text: 'Send it by email instead.' }
    ],
    correct: 'C',
    explanation: 'One-time codes must not be disclosed. Verify unexpected support requests independently.'
  },
  {
    id: 'CP-DATA-01', type: 'checkpoint', module: 'data_handling', topic: 'data_handling', difficulty: 2,
    prompt: 'A colleague requests access to a folder containing information beyond their job requirements. What should you do?',
    options: [
      { id: 'A', text: 'Grant access because they work in the same organisation.' },
      { id: 'B', text: 'Grant temporary access and review it next month.' },
      { id: 'C', text: 'Provide only the access and information they are authorised to need for their task.' },
      { id: 'D', text: 'Email them a copy of the whole folder.' }
    ],
    correct: 'C',
    explanation: 'Apply least privilege and data minimisation. Access should match an authorised business need.'
  },
  {
    id: 'CP-DATA-02', type: 'checkpoint', module: 'data_handling', topic: 'data_handling', difficulty: 2,
    prompt: 'You discover printed customer records left unattended in a shared area. What should you do?',
    options: [
      { id: 'A', text: 'Leave them because you are not the owner.' },
      { id: 'B', text: 'Secure them according to workplace procedure and notify the responsible team or owner.' },
      { id: 'C', text: 'Photograph them to identify the owner.' },
      { id: 'D', text: 'Put them in an ordinary recycling bin.' }
    ],
    correct: 'B',
    explanation: 'Prevent unauthorised viewing or loss. Secure the records using approved procedures and report the exposure.'
  }
];

const validAssessmentTypes = new Set(['pre', 'post', 'final']);
const validModules = new Set(['password_security', 'phishing', 'data_handling']);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function rankTitle(percentage) {
  if (percentage < 50) return 'Rookie Under Review';
  if (percentage < 60) return 'Cyber Recruit';
  if (percentage < 70) return 'Threat Hunter';
  if (percentage < 80) return 'Cyber Sentinel';
  if (percentage < 90) return 'Cyber Guardian';
  return 'Cyber Overlord';
}

function publicQuestion(row) {
  return {
    questionId: row.question_id,
    topic: row.topic,
    difficulty: row.difficulty,
    prompt: row.prompt,
    options: row.options
  };
}

async function withTransaction(callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS hf_participants (
      participant_id UUID PRIMARY KEY,
      participant_code VARCHAR(24) UNIQUE NOT NULL,
      consent_version VARCHAR(20) NOT NULL,
      consented_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hf_sessions (
      session_id UUID PRIMARY KEY,
      participant_id UUID NOT NULL REFERENCES hf_participants(participant_id),
      token_hash CHAR(64) UNIQUE NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('active', 'completed', 'expired', 'revoked')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ NOT NULL,
      completed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS hf_question_bank (
      question_id VARCHAR(40) PRIMARY KEY,
      assessment_type VARCHAR(20) NOT NULL
        CHECK (assessment_type IN ('pre', 'post', 'final', 'checkpoint')),
      module_id VARCHAR(40),
      topic VARCHAR(40) NOT NULL,
      difficulty SMALLINT NOT NULL CHECK (difficulty BETWEEN 1 AND 5),
      prompt TEXT NOT NULL,
      options JSONB NOT NULL,
      correct_option VARCHAR(4) NOT NULL,
      explanation TEXT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hf_assessment_attempts (
      attempt_id UUID PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES hf_sessions(session_id),
      assessment_type VARCHAR(20) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
        CHECK (status IN ('in_progress', 'completed', 'abandoned')),
      question_count INTEGER NOT NULL,
      score INTEGER,
      percentage NUMERIC(5,2),
      rank_title VARCHAR(40),
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      submitted_at TIMESTAMPTZ,
      time_seconds INTEGER
    );

    CREATE UNIQUE INDEX IF NOT EXISTS hf_one_completed_or_active_assessment
      ON hf_assessment_attempts(session_id, assessment_type)
      WHERE status IN ('in_progress', 'completed');

    CREATE TABLE IF NOT EXISTS hf_assessment_responses (
      response_id BIGSERIAL PRIMARY KEY,
      attempt_id UUID NOT NULL REFERENCES hf_assessment_attempts(attempt_id),
      question_id VARCHAR(40) NOT NULL REFERENCES hf_question_bank(question_id),
      selected_option VARCHAR(4) NOT NULL,
      is_correct BOOLEAN NOT NULL,
      answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (attempt_id, question_id)
    );

    CREATE TABLE IF NOT EXISTS hf_module_progress (
      session_id UUID NOT NULL REFERENCES hf_sessions(session_id),
      module_id VARCHAR(40) NOT NULL,
      video_completed BOOLEAN NOT NULL DEFAULT FALSE,
      checkpoint_completed BOOLEAN NOT NULL DEFAULT FALSE,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      PRIMARY KEY (session_id, module_id)
    );

    CREATE TABLE IF NOT EXISTS hf_checkpoint_responses (
      checkpoint_response_id BIGSERIAL PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES hf_sessions(session_id),
      question_id VARCHAR(40) NOT NULL REFERENCES hf_question_bank(question_id),
      selected_option VARCHAR(4) NOT NULL,
      is_correct BOOLEAN NOT NULL,
      attempt_number INTEGER NOT NULL,
      answered_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS hf_mission_attempts (
      mission_attempt_id BIGSERIAL PRIMARY KEY,
      session_id UUID NOT NULL REFERENCES hf_sessions(session_id),
      mission_id VARCHAR(40) NOT NULL,
      decisions JSONB NOT NULL DEFAULT '[]'::jsonb,
      score INTEGER NOT NULL DEFAULT 0,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // Seed questions once. Existing question records are never overwritten here.
  for (const q of questionBank) {
    await pool.query(
      `INSERT INTO hf_question_bank
        (question_id, assessment_type, module_id, topic, difficulty, prompt, options, correct_option, explanation)
       VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9)
       ON CONFLICT (question_id) DO NOTHING`,
      [
        q.id, q.type, q.module || null, q.topic, q.difficulty,
        q.prompt, JSON.stringify(q.options), q.correct, q.explanation
      ]
    );
  }

  console.log('Development database ready; hf_* tables checked and question bank seeded.');
}

async function requireSession(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token || token.length < 32) {
      return res.status(401).json({ error: 'A valid session token is required.' });
    }

    const result = await pool.query(
      `SELECT s.session_id, s.participant_id, p.participant_code, s.status, s.expires_at
       FROM hf_sessions s
       JOIN hf_participants p ON p.participant_id = s.participant_id
       WHERE s.token_hash = $1`,
      [sha256(token)]
    );

    if (result.rowCount !== 1) {
      return res.status(401).json({ error: 'Invalid session.' });
    }

    const session = result.rows[0];
    if (session.status !== 'active' || new Date(session.expires_at) <= new Date()) {
      return res.status(401).json({ error: 'Session is expired or inactive. Register again to start a new session.' });
    }

    req.session = session;
    next();
  } catch (error) {
    next(error);
  }
}

function handleError(error, req, res, next) {
  console.error('API error:', error);
  if (res.headersSent) return next(error);
  res.status(500).json({ error: 'An unexpected server error occurred.' });
}

// Health check retained for Render monitoring.
app.get('/api/health', async (req, res, next) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, database: 'connected', environment: 'development-backend' });
  } catch (error) {
    next(error);
  }
});

// Create a pseudonymous participant and a protected session.
// Consent must be obtained by the frontend before this request is made.
app.post('/api/v2/register', async (req, res, next) => {
  try {
    if (req.body?.consentAccepted !== true) {
      return res.status(400).json({ error: 'Participant consent is required before registration.' });
    }

    const participantId = crypto.randomUUID();
    const sessionId = crypto.randomUUID();
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha256(rawToken);
    const participantCode = `AGENT-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

    await withTransaction(async (client) => {
      await client.query(
        `INSERT INTO hf_participants
          (participant_id, participant_code, consent_version, consented_at)
         VALUES ($1,$2,$3,NOW())`,
        [participantId, participantCode, CONSENT_VERSION]
      );

      await client.query(
        `INSERT INTO hf_sessions
          (session_id, participant_id, token_hash, expires_at)
         VALUES ($1,$2,$3,NOW() + INTERVAL '${SESSION_HOURS} hours')`,
        [sessionId, participantId, tokenHash]
      );
    });

    res.status(201).json({
      participantCode,
      sessionId,
      sessionToken: rawToken,
      expiresInHours: SESSION_HOURS,
      consentVersion: CONSENT_VERSION
    });
  } catch (error) {
    next(error);
  }
});

// Return the current pseudonymous session details.
app.get('/api/v2/session', requireSession, (req, res) => {
  res.json({
    sessionId: req.session.session_id,
    participantCode: req.session.participant_code,
    status: req.session.status,
    expiresAt: req.session.expires_at
  });
});

// Start an assessment and return questions without answer keys or explanations.
app.post('/api/v2/assessments/:type/start', requireSession, async (req, res, next) => {
  try {
    const type = req.params.type;
    if (!validAssessmentTypes.has(type)) {
      return res.status(400).json({ error: 'Assessment type must be pre, post or final.' });
    }

    const existing = await pool.query(
      `SELECT attempt_id, status
       FROM hf_assessment_attempts
       WHERE session_id = $1 AND assessment_type = $2
       ORDER BY started_at DESC LIMIT 1`,
      [req.session.session_id, type]
    );

    if (existing.rowCount && existing.rows[0].status === 'completed') {
      return res.status(409).json({ error: 'This assessment has already been completed in this session.' });
    }

    if (existing.rowCount && existing.rows[0].status === 'in_progress') {
      const questions = await pool.query(
        `SELECT question_id, topic, difficulty, prompt, options
         FROM hf_question_bank WHERE assessment_type = $1 AND active = TRUE
         ORDER BY question_id`,
        [type]
      );
      return res.json({
        attemptId: existing.rows[0].attempt_id,
        assessmentType: type,
        questions: questions.rows.map(publicQuestion)
      });
    }

    const questions = await pool.query(
      `SELECT question_id, topic, difficulty, prompt, options
       FROM hf_question_bank WHERE assessment_type = $1 AND active = TRUE
       ORDER BY question_id`,
      [type]
    );

    if (questions.rowCount !== (type === 'final' ? 10 : 6)) {
      return res.status(500).json({ error: 'The configured question bank has an unexpected question count.' });
    }

    const attemptId = crypto.randomUUID();
    await pool.query(
      `INSERT INTO hf_assessment_attempts
        (attempt_id, session_id, assessment_type, question_count)
       VALUES ($1,$2,$3,$4)`,
      [attemptId, req.session.session_id, type, questions.rowCount]
    );

    res.status(201).json({
      attemptId,
      assessmentType: type,
      questions: questions.rows.map(publicQuestion)
    });
  } catch (error) {
    next(error);
  }
});

// Submit all answers. The server calculates correctness and score.
app.post('/api/v2/assessments/:type/submit', requireSession, async (req, res, next) => {
  try {
    const type = req.params.type;
    const { attemptId, answers } = req.body || {};

    if (!validAssessmentTypes.has(type)) {
      return res.status(400).json({ error: 'Invalid assessment type.' });
    }
    if (typeof attemptId !== 'string' || !Array.isArray(answers)) {
      return res.status(400).json({ error: 'attemptId and answers are required.' });
    }

    const result = await withTransaction(async (client) => {
      const attemptResult = await client.query(
        `SELECT * FROM hf_assessment_attempts
         WHERE attempt_id = $1 AND session_id = $2 AND assessment_type = $3
         FOR UPDATE`,
        [attemptId, req.session.session_id, type]
      );

      if (attemptResult.rowCount !== 1 || attemptResult.rows[0].status !== 'in_progress') {
        const err = new Error('Assessment attempt is invalid or already submitted.');
        err.statusCode = 409;
        throw err;
      }

      const questionResult = await client.query(
        `SELECT question_id, topic, correct_option, options
         FROM hf_question_bank
         WHERE assessment_type = $1 AND active = TRUE`,
        [type]
      );

      if (answers.length !== questionResult.rowCount) {
        const err = new Error('Submit an answer for every question exactly once.');
        err.statusCode = 400;
        throw err;
      }

      const answerMap = new Map();
      for (const answer of answers) {
        if (!answer || typeof answer.questionId !== 'string' || typeof answer.selectedOption !== 'string') {
          const err = new Error('Each answer must include questionId and selectedOption.');
          err.statusCode = 400;
          throw err;
        }
        if (answerMap.has(answer.questionId)) {
          const err = new Error('Duplicate question answers are not allowed.');
          err.statusCode = 400;
          throw err;
        }
        answerMap.set(answer.questionId, answer.selectedOption);
      }

      const validIds = new Set(questionResult.rows.map(q => q.question_id));
      if (answerMap.size !== validIds.size || [...answerMap.keys()].some(id => !validIds.has(id))) {
        const err = new Error('The submitted question set does not match this assessment.');
        err.statusCode = 400;
        throw err;
      }

      let score = 0;
      const topicTotals = {};

      for (const question of questionResult.rows) {
        const selected = answerMap.get(question.question_id);
        const optionIds = question.options.map(option => option.id);
        if (!optionIds.includes(selected)) {
          const err = new Error(`Invalid option submitted for ${question.question_id}.`);
          err.statusCode = 400;
          throw err;
        }

        const correct = selected === question.correct_option;
        if (correct) score += 1;

        if (!topicTotals[question.topic]) topicTotals[question.topic] = { correct: 0, total: 0 };
        topicTotals[question.topic].total += 1;
        if (correct) topicTotals[question.topic].correct += 1;

        await client.query(
          `INSERT INTO hf_assessment_responses
            (attempt_id, question_id, selected_option, is_correct)
           VALUES ($1,$2,$3,$4)`,
          [attemptId, question.question_id, selected, correct]
        );
      }

      const total = questionResult.rowCount;
      const percentage = Number(((score / total) * 100).toFixed(2));
      const rank = type === 'final' ? rankTitle(percentage) : null;
      const elapsed = Math.max(
        0,
        Math.floor((Date.now() - new Date(attemptResult.rows[0].started_at).getTime()) / 1000)
      );

      await client.query(
        `UPDATE hf_assessment_attempts
         SET status = 'completed', score = $1, percentage = $2,
             rank_title = $3, submitted_at = NOW(), time_seconds = $4
         WHERE attempt_id = $5`,
        [score, percentage, rank, elapsed, attemptId]
      );

      if (type === 'final') {
        await client.query(
          `UPDATE hf_sessions SET status = 'completed', completed_at = NOW()
           WHERE session_id = $1`,
          [req.session.session_id]
        );
      }

      return {
        assessmentType: type,
        score,
        total,
        percentage,
        passed: percentage >= PASS_MARK,
        passMark: PASS_MARK,
        rankTitle: rank,
        timeSeconds: elapsed,
        topicBreakdown: topicTotals
      };
    });

    res.json(result);
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

// Retrieve checkpoint questions for a module. Correct answers are never returned.
app.get('/api/v2/modules/:moduleId/checkpoints', requireSession, async (req, res, next) => {
  try {
    const moduleId = req.params.moduleId;
    if (!validModules.has(moduleId)) {
      return res.status(400).json({ error: 'Unknown training module.' });
    }

    const progress = await pool.query(
      `SELECT video_completed FROM hf_module_progress
       WHERE session_id = $1 AND module_id = $2`,
      [req.session.session_id, moduleId]
    );
    if (progress.rowCount !== 1 || progress.rows[0].video_completed !== true) {
      return res.status(403).json({ error: 'Complete the training video before opening its checkpoint.' });
    }

    const result = await pool.query(
      `SELECT question_id, topic, difficulty, prompt, options
       FROM hf_question_bank
       WHERE assessment_type = 'checkpoint' AND module_id = $1 AND active = TRUE
       ORDER BY question_id`,
      [moduleId]
    );

    if (result.rowCount !== 2) {
      return res.status(500).json({ error: 'The module must have exactly two checkpoint questions.' });
    }

    res.json({ moduleId, questions: result.rows.map(publicQuestion) });
  } catch (error) {
    next(error);
  }
});

// Checkpoint answers are checked on the server; an incorrect answer does not unlock progression.
app.post('/api/v2/modules/:moduleId/checkpoints/:questionId/answer', requireSession, async (req, res, next) => {
  try {
    const { moduleId, questionId } = req.params;
    const { selectedOption } = req.body || {};

    if (!validModules.has(moduleId) || typeof selectedOption !== 'string') {
      return res.status(400).json({ error: 'A valid module and selectedOption are required.' });
    }

    const progress = await pool.query(
      `SELECT video_completed FROM hf_module_progress
       WHERE session_id = $1 AND module_id = $2`,
      [req.session.session_id, moduleId]
    );
    if (progress.rowCount !== 1 || progress.rows[0].video_completed !== true) {
      return res.status(403).json({ error: 'Complete the training video before answering its checkpoint.' });
    }

    const questionResult = await pool.query(
      `SELECT question_id, options, correct_option, explanation
       FROM hf_question_bank
       WHERE question_id = $1 AND assessment_type = 'checkpoint' AND module_id = $2 AND active = TRUE`,
      [questionId, moduleId]
    );

    if (questionResult.rowCount !== 1) {
      return res.status(404).json({ error: 'Checkpoint question not found.' });
    }

    const question = questionResult.rows[0];
    if (!question.options.some(option => option.id === selectedOption)) {
      return res.status(400).json({ error: 'Invalid answer option.' });
    }

    const attemptNumberResult = await pool.query(
      `SELECT COUNT(*)::int AS attempts
       FROM hf_checkpoint_responses
       WHERE session_id = $1 AND question_id = $2`,
      [req.session.session_id, questionId]
    );

    const isCorrect = selectedOption === question.correct_option;
    await pool.query(
      `INSERT INTO hf_checkpoint_responses
        (session_id, question_id, selected_option, is_correct, attempt_number)
       VALUES ($1,$2,$3,$4,$5)`,
      [
        req.session.session_id, questionId, selectedOption, isCorrect,
        attemptNumberResult.rows[0].attempts + 1
      ]
    );

    const correctCountResult = await pool.query(
      `SELECT COUNT(DISTINCT question_id)::int AS correct_count
       FROM hf_checkpoint_responses
       WHERE session_id = $1 AND is_correct = TRUE
         AND question_id IN (
           SELECT question_id FROM hf_question_bank
           WHERE assessment_type = 'checkpoint' AND module_id = $2
         )`,
      [req.session.session_id, moduleId]
    );
    const checkpointCompleted = correctCountResult.rows[0].correct_count >= 2;

    await pool.query(
      `INSERT INTO hf_module_progress (session_id, module_id, checkpoint_completed)
       VALUES ($1,$2,$3)
       ON CONFLICT (session_id, module_id)
       DO UPDATE SET checkpoint_completed = EXCLUDED.checkpoint_completed, updated_at = NOW()`,
      [req.session.session_id, moduleId, checkpointCompleted]
    );

    res.json({
      questionId,
      correct: isCorrect,
      explanation: question.explanation,
      checkpointCompleted
    });
  } catch (error) {
    next(error);
  }
});

// Module video completion is recorded separately from checkpoint completion.
// The frontend must use the video player's completion event; this endpoint alone
// cannot prove that a person watched a video.
app.post('/api/v2/modules/:moduleId/video-complete', requireSession, async (req, res, next) => {
  try {
    const moduleId = req.params.moduleId;
    if (!validModules.has(moduleId)) {
      return res.status(400).json({ error: 'Unknown training module.' });
    }

    await pool.query(
      `INSERT INTO hf_module_progress (session_id, module_id, video_completed)
       VALUES ($1,$2,TRUE)
       ON CONFLICT (session_id, module_id)
       DO UPDATE SET video_completed = TRUE, updated_at = NOW()`,
      [req.session.session_id, moduleId]
    );

    res.json({ moduleId, videoCompleted: true });
  } catch (error) {
    next(error);
  }
});

// Read-only progress summary for the frontend.
app.get('/api/v2/progress', requireSession, async (req, res, next) => {
  try {
    const modules = await pool.query(
      `SELECT module_id, video_completed, checkpoint_completed
       FROM hf_module_progress WHERE session_id = $1 ORDER BY module_id`,
      [req.session.session_id]
    );
    const assessments = await pool.query(
      `SELECT assessment_type, status, score, question_count, percentage, started_at, submitted_at
       FROM hf_assessment_attempts WHERE session_id = $1 ORDER BY started_at`,
      [req.session.session_id]
    );

    res.json({ modules: modules.rows, assessments: assessments.rows });
  } catch (error) {
    next(error);
  }
});

// Leaderboard uses pseudonymous participant codes, not names.
app.get('/api/leaderboard', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT p.participant_code AS username,
              a.score AS final_score,
              a.rank_title,
              a.time_seconds,
              a.submitted_at AS created_at
       FROM hf_assessment_attempts a
       JOIN hf_sessions s ON s.session_id = a.session_id
       JOIN hf_participants p ON p.participant_id = s.participant_id
       WHERE a.assessment_type = 'final' AND a.status = 'completed'
       ORDER BY a.score DESC, a.time_seconds ASC, a.submitted_at ASC
       LIMIT 50`
    );
    res.set('Cache-Control', 'no-store');
    res.json(result.rows);
  } catch (error) {
    next(error);
  }
});

// Old score-submission routes are intentionally disabled. They trusted scores
// calculated in the browser, which is the vulnerability identified by the supervisor.
app.post('/api/login', (req, res) => {
  res.status(410).json({ error: 'Legacy registration is disabled. Use /api/v2/register.' });
});

app.post('/api/submit', (req, res) => {
  res.status(410).json({ error: 'Client-calculated score submission is disabled. Use the v2 assessment endpoints.' });
});

// The old reset endpoint is deliberately removed. Never expose a public data-deletion route.
app.get('/api/reset-leaderboard', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

app.use(handleError);

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Human Firewall development server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialise Human Firewall database:', error);
    process.exit(1);
  }
}

process.on('SIGTERM', async () => {
  await pool.end();
  process.exit(0);
});

start();
