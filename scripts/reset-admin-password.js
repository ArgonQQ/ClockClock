'use strict';

const crypto = require('crypto');
const path = require('path');
const Database = require('better-sqlite3');

const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'timetracker.db');

const newPassword = crypto.randomBytes(12).toString('base64url');
const salt = crypto.randomBytes(16).toString('hex');
const hash = crypto.scryptSync(newPassword, salt, 64).toString('hex');

const db = new Database(DB_PATH);
const result = db
  .prepare("UPDATE users SET password_hash = ?, salt = ? WHERE username = ? AND role = 'admin'")
  .run(hash, salt, ADMIN_USER);

if (result.changes === 0) {
  console.error(`No admin user '${ADMIN_USER}' found in ${DB_PATH}.`);
  console.error("Set ADMIN_USER if your admin account uses a different username.");
  process.exit(1);
}

console.log('============================================');
console.log('  Admin password reset');
console.log(`  Username: ${ADMIN_USER}`);
console.log(`  Password: ${newPassword}`);
console.log('============================================');
console.log('Log in and change this via the Account modal.');
