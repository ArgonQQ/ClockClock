const express = require('express');
const session = require('express-session');
const Database = require('better-sqlite3');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const mailer = require('./mailer');

// --- Config ---
const PORT = parseInt(process.env.PORT || '3000', 10);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data', 'timetracker.db');
const SESSION_SECRET = process.env.SESSION_SECRET || (() => {
  const secretPath = path.join(path.dirname(DB_PATH), '.session_secret');
  try { return fs.readFileSync(secretPath, 'utf8').trim(); } catch {}
  const secret = crypto.randomBytes(32).toString('hex');
  fs.mkdirSync(path.dirname(secretPath), { recursive: true });
  fs.writeFileSync(secretPath, secret, { mode: 0o600 });
  return secret;
})();
const AUTH_MODE = process.env.AUTH_MODE || 'local';
const RESET_TOKEN_TTL_MIN = parseInt(process.env.RESET_TOKEN_TTL_MIN || '60', 10);
const APP_BASE_URL = process.env.APP_BASE_URL || `http://localhost:${PORT}`;

// OIDC config
const OIDC_ISSUER = process.env.OIDC_ISSUER || '';
const OIDC_CLIENT_ID = process.env.OIDC_CLIENT_ID || '';
const OIDC_CLIENT_SECRET = process.env.OIDC_CLIENT_SECRET || '';
const OIDC_REDIRECT_URI = process.env.OIDC_REDIRECT_URI || 'http://localhost:3000/auth/oidc/callback';
const OIDC_SCOPES = process.env.OIDC_SCOPES || 'openid profile email groups';
const OIDC_ADMIN_GROUP = process.env.OIDC_ADMIN_GROUP || 'admin';
const OIDC_GROUPS_CLAIM = process.env.OIDC_GROUPS_CLAIM || 'groups';

// --- Database setup ---
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT,
    salt TEXT,
    role TEXT NOT NULL DEFAULT 'user',
    oidc_sub TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    customer TEXT NOT NULL,
    date TEXT NOT NULL,
    time_from TEXT NOT NULL,
    time_to TEXT NOT NULL,
    minutes INTEGER NOT NULL,
    description TEXT DEFAULT '',
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_entries_user ON entries(user_id);
  CREATE INDEX IF NOT EXISTS idx_entries_date ON entries(date);
  CREATE INDEX IF NOT EXISTS idx_entries_customer ON entries(customer);
  CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    contact_person TEXT DEFAULT '',
    email TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',
    city TEXT DEFAULT '',
    zip TEXT DEFAULT '',
    country TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    created_by INTEGER,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (created_by) REFERENCES users(id)
  );
`);

// --- Migration: add created_by to customers if missing ---
{
  const custCols = db.prepare('PRAGMA table_info(customers)').all();
  if (!custCols.some(c => c.name === 'created_by')) {
    db.exec('ALTER TABLE customers ADD COLUMN created_by INTEGER REFERENCES users(id)');
    // Assign existing customers to admin (user id 1)
    db.exec('UPDATE customers SET created_by = 1 WHERE created_by IS NULL');
  }
}

// --- Migration: add customer_id to entries and migrate existing customer text data ---
{
  const columns = db.prepare('PRAGMA table_info(entries)').all();
  const hasCustomerId = columns.some(c => c.name === 'customer_id');
  if (!hasCustomerId) {
    db.exec('ALTER TABLE entries ADD COLUMN customer_id INTEGER REFERENCES customers(id)');
  }

  // For each distinct customer name in entries that has no matching customer record, create one
  const distinctCustomers = db.prepare(
    "SELECT DISTINCT customer FROM entries WHERE customer != '' AND customer IS NOT NULL"
  ).all();
  const insertCustomer = db.prepare(
    'INSERT OR IGNORE INTO customers (name) VALUES (?)'
  );
  const insertMany = db.transaction(() => {
    for (const row of distinctCustomers) {
      // Only insert if no customer with that name exists yet
      const existing = db.prepare('SELECT id FROM customers WHERE name = ?').get(row.customer);
      if (!existing) {
        insertCustomer.run(row.customer);
      }
    }
  });
  insertMany();

  // Update entries.customer_id to match the customers table by name
  db.exec(`
    UPDATE entries
    SET customer_id = (SELECT id FROM customers WHERE customers.name = entries.customer)
    WHERE customer_id IS NULL AND customer != '' AND customer IS NOT NULL
  `);
}

// --- Migration: add email to users ---
{
  const userCols = db.prepare('PRAGMA table_info(users)').all();
  if (!userCols.some(c => c.name === 'email')) {
    db.exec('ALTER TABLE users ADD COLUMN email TEXT');
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email) WHERE email IS NOT NULL');
  }
}

// --- Password reset tokens table ---
db.exec(`
  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER NOT NULL,
    used_at INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pwreset_user ON password_resets(user_id);
`);

// --- Password hashing with scrypt ---
function hashPassword(password, salt) {
  salt = salt || crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { hash, salt };
}

function verifyPassword(password, hash, salt) {
  const result = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(result, 'hex'), Buffer.from(hash, 'hex'));
}

function validatePassword(pw, username) {
  if (typeof pw !== 'string') return 'too_short';
  if (pw.toLowerCase() === (username || '').toLowerCase()) return 'same_as_username';
  if (pw.length < 10) return 'too_short';
  return null;
}

// --- Create default admin if no users exist ---
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count === 0) {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url');
  const { hash, salt } = hashPassword(adminPass);
  db.prepare('INSERT INTO users (username, password_hash, salt, role) VALUES (?, ?, ?, ?)').run(adminUser, hash, salt, 'admin');
  console.log('============================================');
  console.log(`  Default admin account created`);
  console.log(`  Username: ${adminUser}`);
  console.log(`  Password: ${adminPass}`);
  console.log('============================================');
}

// --- Password reset helpers ---
function issuePasswordResetToken(userId) {
  const raw = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(raw).digest('hex');
  const now = Date.now();
  const exp = now + RESET_TOKEN_TTL_MIN * 60 * 1000;
  db.prepare('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL').run(userId);
  db.prepare('INSERT INTO password_resets (user_id, token_hash, expires_at, created_at) VALUES (?,?,?,?)').run(userId, hash, exp, now);
  return raw;
}

function invalidateSessionsForUser(userId, exceptSid) {
  if (exceptSid) {
    db.prepare("DELETE FROM sessions WHERE json_extract(sess,'$.userId') = ? AND sid != ?").run(userId, exceptSid);
  } else {
    db.prepare("DELETE FROM sessions WHERE json_extract(sess,'$.userId') = ?").run(userId);
  }
}

// --- SQLite session store ---
db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    sid TEXT PRIMARY KEY,
    sess TEXT NOT NULL,
    expired INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
`);

class SQLiteStore extends session.Store {
  constructor() {
    super();
    this._get = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?');
    this._set = db.prepare('INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)');
    this._destroy = db.prepare('DELETE FROM sessions WHERE sid = ?');
    // Clean expired sessions on startup and every hour
    this._cleanup();
    setInterval(() => this._cleanup(), 60 * 60 * 1000);
  }
  _cleanup() { db.prepare('DELETE FROM sessions WHERE expired <= ?').run(Date.now()); }
  get(sid, cb) {
    try {
      const row = this._get.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (e) { cb(e); }
  }
  set(sid, sess, cb) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 7 * 24 * 60 * 60 * 1000;
      this._set.run(sid, JSON.stringify(sess), Date.now() + maxAge);
      cb(null);
    } catch (e) { cb(e); }
  }
  destroy(sid, cb) {
    try { this._destroy.run(sid); cb(null); } catch (e) { cb(e); }
  }
}

// --- Express app ---
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  store: new SQLiteStore(),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production'
  }
}));

// --- Rate limiting for login ---
const loginAttempts = new Map();
const LOGIN_WINDOW = 15 * 60 * 1000; // 15 min
const LOGIN_MAX = 15;
function checkLoginRateLimit(req) {
  const key = req.ip;
  const now = Date.now();
  const attempts = (loginAttempts.get(key) || []).filter(t => now - t < LOGIN_WINDOW);
  loginAttempts.set(key, attempts);
  return attempts.length >= LOGIN_MAX;
}
function recordLoginFailure(req) {
  const key = req.ip;
  const now = Date.now();
  const attempts = (loginAttempts.get(key) || []).filter(t => now - t < LOGIN_WINDOW);
  attempts.push(now);
  loginAttempts.set(key, attempts);
}

// --- Rate limiters for account/password flows ---
function makeRateLimiter(maxAttempts, windowMs) {
  const map = new Map();
  return function(key) {
    const now = Date.now();
    let attempts = map.get(key) || [];
    attempts = attempts.filter(ts => now - ts < windowMs);
    if (attempts.length >= maxAttempts) return false;
    attempts.push(now);
    map.set(key, attempts);
    return true;
  };
}

const rateLimitChangePassword = makeRateLimiter(5, 60 * 60 * 1000);
const rateLimitChangeEmail = makeRateLimiter(5, 60 * 60 * 1000);
const rateLimitForgotByIp = makeRateLimiter(10, 60 * 60 * 1000);
const rateLimitForgotByEmail = makeRateLimiter(3, 60 * 60 * 1000);
const rateLimitResetByIp = makeRateLimiter(20, 60 * 60 * 1000);

// --- Auth middleware ---
function requireAuth(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  if (req.session.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
}

// --- Auth routes ---
app.post('/auth/login', (req, res) => {
  if (checkLoginRateLimit(req)) return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !user.password_hash || !user.salt) {
    recordLoginFailure(req);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  try {
    if (!verifyPassword(password, user.password_hash, user.salt)) {
      recordLoginFailure(req);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
  } catch {
    recordLoginFailure(req);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    email: user.email || null,
    hasPassword: !!(user.password_hash)
  });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/auth/me', (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not authenticated' });
  const user = db.prepare('SELECT email, password_hash FROM users WHERE id = ?').get(req.session.userId);
  res.json({
    id: req.session.userId,
    username: req.session.username,
    role: req.session.role,
    email: user ? (user.email || null) : null,
    hasPassword: !!(user && user.password_hash)
  });
});

app.get('/auth/mode', (_req, res) => {
  res.json({ mode: AUTH_MODE });
});

app.post('/auth/change-password', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.password_hash || user.oidc_sub) return res.status(404).json({ error: 'Not available' });

  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'Missing fields' });

  const pwErr = validatePassword(new_password, user.username);
  if (pwErr === 'too_short') return res.status(400).json({ error: 'password_too_short' });
  if (pwErr === 'same_as_username') return res.status(400).json({ error: 'password_same_as_username' });

  if (!rateLimitChangePassword(req.session.userId)) return res.status(429).json({ error: 'Too many attempts' });

  try {
    if (!verifyPassword(current_password, user.password_hash, user.salt)) {
      return res.status(401).json({ error: 'Invalid current password' });
    }
  } catch { return res.status(401).json({ error: 'Invalid current password' }); }

  const { hash, salt } = hashPassword(new_password);
  db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
  invalidateSessionsForUser(user.id, req.session.id);
  res.json({ ok: true });
});

app.post('/auth/change-email', requireAuth, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.password_hash || user.oidc_sub) return res.status(404).json({ error: 'Not available' });

  const { current_password, new_email } = req.body;
  if (!new_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(new_email)) {
    return res.status(400).json({ error: 'email_invalid' });
  }

  if (!rateLimitChangeEmail(req.session.userId)) return res.status(429).json({ error: 'Too many attempts' });

  if (user.email) {
    if (!current_password) return res.status(401).json({ error: 'Current password required' });
    try {
      if (!verifyPassword(current_password, user.password_hash, user.salt)) {
        return res.status(401).json({ error: 'Invalid current password' });
      }
    } catch { return res.status(401).json({ error: 'Invalid current password' }); }
  }

  const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(new_email, user.id);
  if (taken) return res.status(409).json({ error: 'email_taken' });

  db.prepare('UPDATE users SET email = ? WHERE id = ?').run(new_email, user.id);
  res.json({ ok: true, email: new_email });
});

app.post('/auth/forgot-password', async (req, res) => {
  if (AUTH_MODE !== 'local') return res.status(404).json({ error: 'Not available' });
  if (!rateLimitForgotByIp(req.ip)) return res.status(429).json({ error: 'Too many requests' });

  const { email, lang } = req.body;
  if (email && !rateLimitForgotByEmail(email.toLowerCase())) return res.status(429).json({ error: 'Too many requests' });

  res.json({ ok: true });

  if (!email) return;
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  if (!user || !user.password_hash || user.oidc_sub) return;

  const raw = issuePasswordResetToken(user.id);
  const link = `${APP_BASE_URL}/#reset?token=${raw}`;
  const useLang = lang === 'de' ? 'de' : 'en';
  try {
    await mailer.sendPasswordResetEmail(user.email, link, useLang);
  } catch (err) {
    console.error('Failed to send password reset email:', err.message);
  }
});

app.post('/auth/reset-password', (req, res) => {
  if (AUTH_MODE !== 'local') return res.status(404).json({ error: 'Not available' });
  if (!rateLimitResetByIp(req.ip)) return res.status(429).json({ error: 'Too many requests' });

  const { token, new_password } = req.body;
  if (!token) return res.status(400).json({ error: 'invalid_token' });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const resetRow = db.prepare('SELECT * FROM password_resets WHERE token_hash = ?').get(tokenHash);
  if (!resetRow || resetRow.used_at || resetRow.expires_at < Date.now()) {
    return res.status(400).json({ error: 'invalid_token' });
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(resetRow.user_id);
  if (!user) return res.status(400).json({ error: 'invalid_token' });

  const pwErr = validatePassword(new_password, user.username);
  if (pwErr === 'too_short') return res.status(400).json({ error: 'password_too_short' });
  if (pwErr === 'same_as_username') return res.status(400).json({ error: 'password_same_as_username' });

  const { hash, salt } = hashPassword(new_password);
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
    db.prepare('UPDATE password_resets SET used_at = ? WHERE id = ?').run(Date.now(), resetRow.id);
    invalidateSessionsForUser(user.id);
  })();

  res.json({ ok: true });
});

// --- OIDC routes ---
let oidcConfig = null;

async function getOidcConfig() {
  if (oidcConfig) return oidcConfig;
  const resp = await fetch(`${OIDC_ISSUER}/.well-known/openid-configuration`);
  oidcConfig = await resp.json();
  return oidcConfig;
}

app.get('/auth/oidc/login', async (req, res) => {
  if (AUTH_MODE !== 'oidc') return res.status(404).json({ error: 'OIDC not enabled' });
  try {
    const config = await getOidcConfig();
    const state = crypto.randomBytes(16).toString('hex');
    req.session.oidcState = state;
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: OIDC_CLIENT_ID,
      redirect_uri: OIDC_REDIRECT_URI,
      scope: OIDC_SCOPES,
      state
    });
    res.redirect(`${config.authorization_endpoint}?${params}`);
  } catch (err) {
    console.error('OIDC login error:', err);
    res.status(500).json({ error: 'OIDC configuration error' });
  }
});

app.get('/auth/oidc/callback', async (req, res) => {
  if (AUTH_MODE !== 'oidc') return res.status(404).json({ error: 'OIDC not enabled' });
  const { code, state } = req.query;
  if (!code || state !== req.session.oidcState) {
    return res.status(400).send('Invalid OIDC callback');
  }
  delete req.session.oidcState;

  try {
    const config = await getOidcConfig();

    // Exchange code for tokens
    const tokenResp = await fetch(config.token_endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: OIDC_CLIENT_ID,
        client_secret: OIDC_CLIENT_SECRET,
        redirect_uri: OIDC_REDIRECT_URI,
        code
      })
    });
    const tokens = await tokenResp.json();
    if (!tokens.access_token) throw new Error('No access token');

    // Fetch userinfo
    const userResp = await fetch(config.userinfo_endpoint, {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });
    const userinfo = await userResp.json();

    const sub = userinfo.sub;
    const preferredUsername = userinfo.preferred_username || userinfo.email || sub;

    // Determine role from groups claim
    const groups = userinfo[OIDC_GROUPS_CLAIM] || [];
    const oidcRole = (Array.isArray(groups) && groups.includes(OIDC_ADMIN_GROUP)) ? 'admin' : 'user';

    // Find or create user
    let user = db.prepare('SELECT * FROM users WHERE oidc_sub = ?').get(sub);
    if (!user) {
      const existing = db.prepare('SELECT * FROM users WHERE username = ?').get(preferredUsername);
      if (existing) {
        db.prepare('UPDATE users SET oidc_sub = ?, role = ? WHERE id = ?').run(sub, oidcRole, existing.id);
        user = { ...existing, role: oidcRole };
      } else {
        const result = db.prepare('INSERT INTO users (username, role, oidc_sub) VALUES (?, ?, ?)').run(preferredUsername, oidcRole, sub);
        user = { id: result.lastInsertRowid, username: preferredUsername, role: oidcRole };
      }
    } else {
      // Update role on every login to stay in sync with OIDC groups
      if (user.role !== oidcRole) {
        db.prepare('UPDATE users SET role = ? WHERE id = ?').run(oidcRole, user.id);
        user.role = oidcRole;
      }
    }

    req.session.userId = user.id;
    req.session.username = user.username;
    req.session.role = user.role;
    res.redirect('/');
  } catch (err) {
    console.error('OIDC callback error:', err);
    res.status(500).send('OIDC authentication failed');
  }
});

// --- Entries API ---
app.get('/api/entries', requireAuth, (req, res) => {
  const { customerId, dateFrom, dateTo, userId } = req.query;
  let sql = 'SELECT entries.*, users.username, customers.name as customer_name FROM entries JOIN users ON entries.user_id = users.id LEFT JOIN customers ON entries.customer_id = customers.id WHERE 1=1';
  const params = [];

  if (req.session.role !== 'admin') {
    sql += ' AND entries.user_id = ?';
    params.push(req.session.userId);
  } else if (userId) {
    sql += ' AND entries.user_id = ?';
    params.push(parseInt(userId, 10));
  }

  if (customerId) {
    sql += ' AND entries.customer_id = ?';
    params.push(parseInt(customerId, 10));
  }
  if (dateFrom) {
    sql += ' AND entries.date >= ?';
    params.push(dateFrom);
  }
  if (dateTo) {
    sql += ' AND entries.date <= ?';
    params.push(dateTo);
  }

  sql += ' ORDER BY entries.date DESC, entries.time_from DESC';
  res.json(db.prepare(sql).all(...params));
});

app.post('/api/entries', requireAuth, (req, res) => {
  const { customer_id, date, time_from, time_to, minutes, description } = req.body;
  if (!customer_id || !date || !time_from || !time_to || minutes == null) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  const customerId = parseInt(customer_id, 10);
  const customerRow = db.prepare('SELECT * FROM customers WHERE id = ?').get(customerId);
  if (!customerRow) {
    return res.status(400).json({ error: 'Customer not found' });
  }
  const result = db.prepare(
    'INSERT INTO entries (user_id, customer, customer_id, date, time_from, time_to, minutes, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(req.session.userId, customerRow.name, customerId, date, time_from, time_to, parseInt(minutes, 10), (description || '').trim());
  const entry = db.prepare('SELECT entries.*, users.username, customers.name as customer_name FROM entries JOIN users ON entries.user_id = users.id LEFT JOIN customers ON entries.customer_id = customers.id WHERE entries.id = ?').get(result.lastInsertRowid);
  res.json(entry);
});

app.put('/api/entries/:id', requireAuth, (req, res) => {
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (req.session.role !== 'admin' && entry.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { customer_id, description, date, time_from, time_to, minutes } = req.body;
  let customerName = entry.customer;
  let customerId = entry.customer_id;
  if (customer_id !== undefined) {
    const cId = parseInt(customer_id, 10);
    const customerRow = db.prepare('SELECT * FROM customers WHERE id = ?').get(cId);
    if (!customerRow) return res.status(400).json({ error: 'Customer not found' });
    customerName = customerRow.name;
    customerId = cId;
  }
  db.prepare(
    'UPDATE entries SET customer = ?, customer_id = ?, description = ?, date = ?, time_from = ?, time_to = ?, minutes = ? WHERE id = ?'
  ).run(
    customerName, customerId,
    description !== undefined ? description.trim() : entry.description,
    date !== undefined ? date : entry.date,
    time_from !== undefined ? time_from : entry.time_from,
    time_to !== undefined ? time_to : entry.time_to,
    minutes !== undefined ? parseInt(minutes, 10) : entry.minutes,
    entry.id
  );
  const updated = db.prepare('SELECT entries.*, users.username, customers.name as customer_name FROM entries JOIN users ON entries.user_id = users.id LEFT JOIN customers ON entries.customer_id = customers.id WHERE entries.id = ?').get(entry.id);
  res.json(updated);
});

app.delete('/api/entries/:id', requireAuth, (req, res) => {
  const entry = db.prepare('SELECT * FROM entries WHERE id = ?').get(req.params.id);
  if (!entry) return res.status(404).json({ error: 'Not found' });
  if (req.session.role !== 'admin' && entry.user_id !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  db.prepare('DELETE FROM entries WHERE id = ?').run(entry.id);
  res.json({ ok: true });
});

// --- Customers API ---
app.get('/api/customers', requireAuth, (req, res) => {
  if (req.session.role === 'admin') {
    res.json(db.prepare('SELECT * FROM customers ORDER BY name').all());
  } else {
    res.json(db.prepare('SELECT * FROM customers WHERE created_by = ? ORDER BY name').all(req.session.userId));
  }
});

app.post('/api/customers', requireAuth, (req, res) => {
  const { name, contact_person, email, phone, address, city, zip, country, notes } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }
  const result = db.prepare(
    'INSERT INTO customers (name, contact_person, email, phone, address, city, zip, country, notes, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    name.trim(),
    (contact_person || '').trim(),
    (email || '').trim(),
    (phone || '').trim(),
    (address || '').trim(),
    (city || '').trim(),
    (zip || '').trim(),
    (country || '').trim(),
    (notes || '').trim(),
    req.session.userId
  );
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
  res.json(customer);
});

app.put('/api/customers/:id', requireAuth, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });
  if (req.session.role !== 'admin' && customer.created_by !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const { name, contact_person, email, phone, address, city, zip, country, notes } = req.body;
  if (name !== undefined) {
    if (!name.trim()) return res.status(400).json({ error: 'name cannot be empty' });
    db.prepare('UPDATE customers SET name = ? WHERE id = ?').run(name.trim(), customer.id);
  }
  if (contact_person !== undefined) db.prepare('UPDATE customers SET contact_person = ? WHERE id = ?').run(contact_person.trim(), customer.id);
  if (email !== undefined) db.prepare('UPDATE customers SET email = ? WHERE id = ?').run(email.trim(), customer.id);
  if (phone !== undefined) db.prepare('UPDATE customers SET phone = ? WHERE id = ?').run(phone.trim(), customer.id);
  if (address !== undefined) db.prepare('UPDATE customers SET address = ? WHERE id = ?').run(address.trim(), customer.id);
  if (city !== undefined) db.prepare('UPDATE customers SET city = ? WHERE id = ?').run(city.trim(), customer.id);
  if (zip !== undefined) db.prepare('UPDATE customers SET zip = ? WHERE id = ?').run(zip.trim(), customer.id);
  if (country !== undefined) db.prepare('UPDATE customers SET country = ? WHERE id = ?').run(country.trim(), customer.id);
  if (notes !== undefined) db.prepare('UPDATE customers SET notes = ? WHERE id = ?').run(notes.trim(), customer.id);
  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer.id);
  res.json(updated);
});

app.delete('/api/customers/:id', requireAuth, (req, res) => {
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!customer) return res.status(404).json({ error: 'Not found' });
  if (req.session.role !== 'admin' && customer.created_by !== req.session.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const refCount = db.prepare('SELECT COUNT(*) as count FROM entries WHERE customer_id = ?').get(customer.id);
  if (refCount.count > 0) {
    return res.status(409).json({ error: 'Cannot delete customer: there are entries referencing it' });
  }
  db.prepare('DELETE FROM customers WHERE id = ?').run(customer.id);
  res.json({ ok: true });
});

// --- Users API (admin) ---
app.get('/api/users', requireAdmin, (req, res) => {
  const users = db.prepare('SELECT id, username, email, role, created_at FROM users ORDER BY username').all();
  res.json(users);
});

app.post('/api/users', requireAdmin, (req, res) => {
  const { username, password, role, email } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'email_invalid' });
  const pwErr = validatePassword(password, username);
  if (pwErr === 'too_short') return res.status(400).json({ error: 'password_too_short' });
  if (pwErr === 'same_as_username') return res.status(400).json({ error: 'password_same_as_username' });
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: 'Username already exists' });
  const emailTaken = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (emailTaken) return res.status(409).json({ error: 'email_taken' });
  const validRole = role === 'admin' ? 'admin' : 'user';
  const { hash, salt } = hashPassword(password);
  const result = db.prepare('INSERT INTO users (username, password_hash, salt, role, email) VALUES (?, ?, ?, ?, ?)').run(username.trim(), hash, salt, validRole, email.trim());
  res.json({ id: result.lastInsertRowid, username: username.trim(), email: email.trim(), role: validRole });
});

app.put('/api/users/:id', requireAdmin, (req, res) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'Not found' });
  const { username, password, role, email } = req.body;
  if (username !== undefined) {
    const existing = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(username, user.id);
    if (existing) return res.status(409).json({ error: 'Username already exists' });
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username.trim(), user.id);
  }
  if (password) {
    const pwErr = validatePassword(password, username || user.username);
    if (pwErr === 'too_short') return res.status(400).json({ error: 'password_too_short' });
    if (pwErr === 'same_as_username') return res.status(400).json({ error: 'password_same_as_username' });
    const { hash, salt } = hashPassword(password);
    db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE id = ?').run(hash, salt, user.id);
  }
  if (role !== undefined) {
    const validRole = role === 'admin' ? 'admin' : 'user';
    db.prepare('UPDATE users SET role = ? WHERE id = ?').run(validRole, user.id);
  }
  if (email !== undefined) {
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'email_invalid' });
    if (email) {
      const taken = db.prepare('SELECT id FROM users WHERE email = ? AND id != ?').get(email, user.id);
      if (taken) return res.status(409).json({ error: 'email_taken' });
    }
    db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email || null, user.id);
  }
  const updated = db.prepare('SELECT id, username, email, role, created_at FROM users WHERE id = ?').get(user.id);
  res.json(updated);
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const userId = parseInt(req.params.id, 10);
  if (userId === req.session.userId) return res.status(400).json({ error: 'Cannot delete yourself' });
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM entries WHERE user_id = ?').run(userId);
  db.prepare('UPDATE customers SET created_by = NULL WHERE created_by = ?').run(userId);
  db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  res.json({ ok: true });
});

// --- Start server ---
app.listen(PORT, () => {
  console.log('');
  console.log('   ╔═╗╦  ╔═╗╔═╗╦╔═  ╔═╗╦  ╔═╗╔═╗╦╔═');
  console.log('   ║  ║  ║ ║║  ╠╩╗  ║  ║  ║ ║║  ╠╩╗');
  console.log('   ╚═╝╩═╝╚═╝╚═╝╩ ╩  ╚═╝╩═╝╚═╝╚═╝╩ ╩');
  console.log('');
  console.log(`   Port: ${PORT}  |  Auth: ${AUTH_MODE}`);
  console.log('');
});
